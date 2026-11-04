'use strict';
const fs=require('node:fs');
const Core=require('./core.js');
const {plain}=require('./anki-sync-text.cjs');

function createServerSync({db,language,userId,serverUrl=process.env.OMA_ANKI_SERVER_URL,accountsFile=process.env.OMA_ANKI_ACCOUNTS_FILE,transport=fetch}){
 const base=new URL(serverUrl);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('OMA_ANKI_SERVER_URL must be an HTTPS origin.');
 db.exec('CREATE TABLE IF NOT EXISTS anki_server_sync(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL)');
 const get=db.prepare('SELECT payload FROM anki_server_sync WHERE id=1');
 const set=db.prepare('INSERT INTO anki_server_sync VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload');
 const load=()=>JSON.parse(get.get()?.payload||'{}');
 const store=value=>set.run(JSON.stringify(value));
 const code=language.code.toLowerCase();
 function credentials(){
  if(!userId||!accountsFile)return null;
  try{
   const value=JSON.parse(fs.readFileSync(accountsFile,'utf8'));
   const account=value.version===1&&Object.hasOwn(value.accounts||{},userId)?value.accounts[userId]:null;
   return typeof account?.token==='string'&&/^[A-Za-z0-9_-]{32,128}$/.test(account.token)?account:null;
  }catch{return null;}
 }
 const status=()=>{const value=load(),account=credentials();return {mode:'server',accountConnected:!!account,enabled:!!value.enabled,linked:!!value.lastSync,deck:'Vocabulary::'+code,lastSync:value.lastSync,notice:value.notice,syncServer:base.origin,syncUsername:account?.syncUsername};};
 let active=false;
 async function exclusive(work){
  if(active)throw Object.assign(Error('Anki sync is already running.'),{status:409});
  active=true;try{return await work();}finally{active=false;}
 }
 function account(){const value=credentials();if(!value)throw Object.assign(Error('Your account needs an Anki connection. Ask the administrator to link your personal collection.'),{status:503});return value;}
 async function request(route,token,body){
  if(credentials()?.token!==token)throw Object.assign(Error('Your Anki connection changed. Try again.'),{status:409});
  let response;
  try{response=await transport(new URL(route,base),{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','User-Agent':'OmaLingo/0.2.0'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});}
  catch{throw Object.assign(Error('The Anki server is unavailable. Your words are saved here; try syncing again.'),{status:503});}
  if(!response.ok){
   const message=response.status===401?'Your Anki connection needs to be renewed by the administrator.':response.status===409?'Your Anki collection is busy or needs a full-sync review. Try again; ask the administrator if it continues.':'The Anki server could not finish syncing. Your words are saved here; try again.';
   throw Object.assign(Error(message),{status:response.status===409?409:503});
  }
  try{return await response.json();}catch{throw Object.assign(Error('The Anki server returned an invalid response.'),{status:503});}
 }
 async function read(token){
  const result=new Map();
  for(let offset=0;offset<10000;){
   const page=await request('/v1/words?offset='+offset,token);
   if(!Number.isSafeInteger(page.total)||page.total<0||!Array.isArray(page.notes)||page.notes.length>100||page.offset!==offset)throw Error('The Anki server returned an invalid word list.');
   for(const note of page.notes){
    if(!Array.isArray(note.tags)||!note.tags.includes('language_'+code))continue;
    if(!Number.isSafeInteger(note.note_id)||typeof note.fields?.Front!=='string'||typeof note.fields?.Back!=='string')throw Error('An Anki word has an unsupported note format.');
    const term=Core.norm(plain(note.fields.Front)),meaning=plain(note.fields.Back);
    if(term&&!['__proto__','constructor','prototype'].includes(term)){
     if(result.has(term))throw Error('Duplicate Anki words need administrator review.');
     result.set(term,{meaning,noteId:note.note_id});
    }
   }
   offset+=page.notes.length;
   if(offset>=page.total)return result;
   if(!page.notes.length)throw Error('The Anki word list changed. Try syncing again.');
  }
  throw Error('This Anki collection is too large for one sync. Ask the administrator for help.');
 }
 async function test(){await read(account().token);return {mode:'server',connected:true};}
 async function enable(){return exclusive(async()=>{await test();store({...load(),enabled:true});return status();});}
 function pause(){if(active)throw Object.assign(Error('Wait for the current Anki sync to finish.'),{status:409});store({...load(),enabled:false});return status();}
 async function sync({state,verify,commit}){
  return exclusive(async()=>{
   const link=load();if(!link.enabled)throw Error('Enable Anki sync for this language first.');
   const token=account().token,baseline=link.baseline||{},remote=await read(token);
   let writes=0,pending=0,skipped=0;
   for(const [term,word] of Object.entries(state.words)){
    const meaning=String(word.meaning||'').trim();
    if(!meaning)continue;
    if(term.length>300||meaning.length>5000){skipped++;continue;}
    const current=remote.get(term),previous=Object.hasOwn(baseline,term)?baseline[term]:null;
    // Existing remote content wins first-link and simultaneous-edit conflicts.
    const changed=current&&previous&&meaning!==previous.meaning&&current.meaning===previous.meaning;
    if(current&&!changed)continue;
    if(writes>=100){pending++;continue;}
    verify();
    const result=await request('/v1/words',token,{language:code,word:term,meaning});
    if(!Number.isSafeInteger(result.note_id))throw Error('The Anki server did not confirm the word.');
    remote.set(term,{meaning,noteId:result.note_id});writes++;
   }
   if(writes){const fresh=await read(token);remote.clear();for(const entry of fresh)remote.set(...entry);}
   verify();if(credentials()?.token!==token)throw Object.assign(Error('Your Anki connection changed. Try again.'),{status:409});
   const words={...state.words},nextBaseline={};
   for(const [term,value] of remote){
    const old=words[term];
    // An unfinished batch must not overwrite unsent local edits with old remote content.
    if(old&&Object.hasOwn(baseline,term)&&old.meaning!==baseline[term].meaning&&value.meaning===baseline[term].meaning)continue;
    const changed=old?.meaning!==value.meaning;
    words[term]={...(old||{term,status:1,due:Date.now(),note:'',tags:[],encounters:[]}),meaning:value.meaning,ankiServerNoteId:value.noteId,...(changed?{meanings:[{text:value.meaning,language:'en',source:'anki'}]}:{})};
    Object.defineProperty(nextBaseline,term,{value,enumerable:true,configurable:true,writable:true});
   }
   const next={...link,baseline:{...baseline,...nextBaseline},lastSync:Date.now(),notice:[pending?pending+' word edits are queued for the next sync.':'',skipped?skipped+' entries exceed the server word/meaning limit and remain saved here.':''].filter(Boolean).join(' ')};
   const changed=JSON.stringify(words)!==JSON.stringify(state.words);
   const result=commit(changed?{...state,words}:null,()=>store(next));
   return {...result,anki:status(),linked:remote.size,ready:0};
  });
 }
 function rebase(){const value=load();store({...value,baseline:{}});}
 function hasChanges(before,after){return !!load().enabled&&JSON.stringify(Object.entries(before?.words||{}).map(([t,w])=>[t,w.meaning]))!==JSON.stringify(Object.entries(after.words).map(([t,w])=>[t,w.meaning]));}
 async function review(){throw Error('Open your personal collection in your Anki app to practise. You can also practise words in O/L.');}
 return {status,test,enable,pause,sync,rebase,hasChanges,review};
}
module.exports={createServerSync};
