'use strict';

const {randomUUID}=require('node:crypto');
const Core=require('./core.js');
const modelName='Oma Lingo Sync';
const fields=['Term','Meaning','Context','Notes','Labels','Familiarity'];
const levels=new Set([-1,1,2,3,4,5]);
const safeTerm=term=>term&&!['__proto__','constructor','prototype'].includes(term);
const scopePart=(name,value)=>'"'+name+':'+value.replace(/[\\"]/g,'\\$&').replace(/[*_]/g,'\\$&')+'"';

async function ankiConnect(action,params={}){
 let result;
 try{
  const response=await fetch(process.env.OMA_ANKI_CONNECT_URL||'http://127.0.0.1:8765',{
   method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({action,version:6,params,key:process.env.OMA_ANKI_API_KEY}),
   signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('HTTP '+response.status);
  result=await response.json();
 }catch{
  const message=process.env.OMA_ANKI_CONNECT_URL?'The server could not reach AnkiConnect. Check that Anki Desktop is open and reachable.':'Open Anki Desktop with AnkiConnect enabled, then try again.';
  throw Object.assign(Error(message),{status:503});
 }
 if(result?.error)throw Error('AnkiConnect: '+result.error);
 if(!result||!Object.hasOwn(result,'result'))throw Error('AnkiConnect returned an unexpected response.');
 return result.result;
}

const {plain}=require('./anki-sync-text.cjs');
const escapeHTML=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/\n/g,'<br>');
const labels=text=>[...new Set(text.split(/[,\n]/).map(Core.norm).filter(Boolean))].sort();
const textField=value=>String(value??'').replace(/\r\n?/g,'\n').trim();
function wordFields(term,w){
 const context=w.ankiNoteId?w.context:w.context||w.encounters?.[0]?.sentence;
 return {
  Term:term,
  Meaning:textField(w.meaning),
  Context:textField(context),
  Notes:textField(w.note),
  Labels:labels(Array.isArray(w.tags)?w.tags.join(','):'').join(', '),
  Familiarity:String(levels.has(w.status)?w.status:1)
 };
}
function noteFields(note){
 const value=Object.fromEntries(fields.map(field=>[field,plain(note.fields?.[field]?.value)]));
 value.Term=Core.norm(value.Term);
 value.Labels=labels(value.Labels).join(', ');
 value.Familiarity=String(levels.has(Number(value.Familiarity))?Number(value.Familiarity):1);
 return value;
}
function projectWord(old,entry,deckId){
 const {id,values,due}=entry;
 const word={...old,term:values.Term,status:Number(values.Familiarity),meaning:values.Meaning,context:values.Context,
  note:values.Notes,tags:labels(values.Labels),ankiNoteId:id,ankiDeckId:deckId,ankiDue:due};
 if(!old||old.meaning!==word.meaning)word.meanings=word.meaning?[{text:word.meaning,language:'en',source:'anki'}]:[];
 return word;
}

function createAnkiSync({db,language,userId,connect=ankiConnect}){
 if(process.env.OMA_ANKI_SERVER_URL)return require('./anki-server.cjs').createServerSync({db,language,userId});
 db.exec('CREATE TABLE IF NOT EXISTS anki_sync(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)');
 const get=db.prepare('SELECT payload FROM anki_sync WHERE id=1');
 const set=db.prepare('INSERT INTO anki_sync VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload');
 const load=()=>JSON.parse(get.get()?.payload||'{}');
 const store=link=>set.run(JSON.stringify(link));
 const status=()=>{const {enabled,deck,deckId,lastSync,notice}=load();return {enabled:!!enabled,deck,deckId,linked:!!deckId,lastSync,notice};};
 let active=false;

 async function exclusive(work){
  if(active)throw Object.assign(Error('Anki sync is already running.'),{status:409});
  active=true;
  try{return await work();}finally{active=false;}
 }
 async function test(){
  const version=await connect('version');
  if(!Number.isInteger(version)||version<6)throw Error('Update AnkiConnect to an add-on that supports API version 6.');
  return {version};
 }
 async function existingDeck(link){
  const decks=await connect('deckNamesAndIds');
  const deck=Object.keys(decks).find(name=>decks[name]===link.deckId);
  if(!deck)throw Error('The linked deck is missing. Open the Anki profile that contains '+link.deck+'.');
  return deck;
 }
 async function enable(){
  return exclusive(async()=>{
   await test();
   const link=load();
   if(link.deckId){
    link.deck=await existingDeck(link);
   }else{
    if(!link.deck){
     link.deck='Oma Lingo::'+language.name+' '+randomUUID().slice(0,8);
     store(link);
    }
    if(!(await connect('modelNames')).includes(modelName)){
     try{
      await connect('createModel',{modelName,inOrderFields:fields,cardTemplates:[
       {Name:'Vocabulary',Front:'{{Term}}',Back:'{{FrontSide}}<hr id="answer">{{Meaning}}<br>{{Context}}<br>{{Notes}}'}
      ]});
     }catch(error){if(!(await connect('modelNames')).includes(modelName))throw error;}
    }
    const actual=await connect('modelFieldNames',{modelName});
    if(!fields.every(field=>actual.includes(field)))throw Error('The '+modelName+' note type is missing required fields.');
    link.deckId=await connect('createDeck',{deck:link.deck});
    if(!Number.isSafeInteger(link.deckId))throw Error('Anki did not create the vocabulary deck.');
   }
   link.enabled=true;
   link.preferAnki=true;
   store(link);
   return status();
  });
 }
 function pause(){
  if(active)throw Object.assign(Error('Wait for the current Anki sync to finish.'),{status:409});
  const link=load();
  if(link.enabled)store({...link,enabled:false});
  return status();
 }
 function rebase(){
  const link=load();
  if(link.deckId)store({...link,preferAnki:true});
 }
 async function readNotes(ids){
  const result=[];
  for(let i=0;i<ids.length;i+=200){
   const batch=ids.slice(i,i+200);
   const notes=await connect('notesInfo',{notes:batch});
   const indexed=new Map(Array.isArray(notes)?notes.map(note=>[note?.noteId,note]):[]);
   if(indexed.size!==batch.length||batch.some(id=>{
    const note=indexed.get(id);
    return note?.modelName!==modelName||!fields.every(field=>typeof note.fields?.[field]?.value==='string');
   })){
    throw Error('Anki’s notes changed while syncing, or the note type was modified. Check the deck and try again.');
   }
   for(const id of batch)result.push({id,values:noteFields(indexed.get(id))});
  }
  return result;
 }
 async function snapshot(deck){
  const query=scopePart('deck',deck)+' -'+scopePart('deck',deck).slice(0,-1)+'::*" '+scopePart('note',modelName);
  const ids=await connect('findNotes',{query});
  if(!Array.isArray(ids)||ids.some(id=>!Number.isSafeInteger(id)))throw Error('Anki returned an invalid note list.');
  const entries=await readNotes(ids);
  return {entries,query};
 }
 function byTerm(entries,baseline){
  const notes=new Map();
  let skipped=0;
  for(const entry of entries){
   const term=entry.values.Term;
   if(!safeTerm(term)){skipped++;continue;}
   const previous=notes.get(term);
   if(previous)skipped++;
   if(!previous||(!Object.hasOwn(baseline,previous.id)&&Object.hasOwn(baseline,entry.id)))notes.set(term,entry);
  }
  return {notes,skipped};
 }
 function oldTerms(baseline){
  return new Set(Object.values(baseline).map(values=>values.Term));
 }
 async function sync({state,verify,commit}){
  return exclusive(async()=>{
   const link=load();
   if(!link.enabled)throw Error('Enable Anki sync for this language first.');
   const deck=await existingDeck(link);
   const baseline=link.baseline||{},previousTerms=oldTerms(baseline),removed=new Set(link.removed||[]);
   const first=await snapshot(deck);
   const {notes}=byTerm(first.entries,baseline);
   const updates=[];
   const additions=[];
   const localWords=state.words;
   const linkedWord=word=>word.ankiDeckId===link.deckId&&Number.isSafeInteger(word.ankiNoteId);
   const expired=(term,word)=>previousTerms.has(term)||linkedWord(word)||(link.preferAnki&&removed.has(term));
   for(const [term,word] of Object.entries(localWords)){
    const current=notes.get(term),local=wordFields(term,word);
    if(current){
     const base=baseline[current.id];
     if(!link.preferAnki&&base?.Term===term&&fields.some(field=>field!=='Term'&&local[field]!==base[field]))updates.push({id:current.id,base,local});
    }else if(local.Meaning&&!expired(term,word)){
     additions.push({deckName:deck,modelName,fields:Object.fromEntries(fields.map(field=>[field,escapeHTML(local[field])])),options:{allowDuplicate:false,duplicateScope:'deck'}});
    }
   }
   for(let i=0;i<updates.length;i+=100){
    const batch=updates.slice(i,i+100);
    const latest=await readNotes(batch.map(item=>item.id));
    const actions=[];
    for(const [j,{id,base,local}] of batch.entries()){
     const current=latest[j].values;
     if(current.Term!==base.Term)continue;
     const changes=fields.filter(field=>field!=='Term'&&local[field]!==base[field]&&current[field]===base[field]);
     if(changes.length)actions.push({action:'updateNoteFields',params:{note:{id,fields:Object.fromEntries(changes.map(field=>[field,escapeHTML(local[field])]))}}});
    }
    if(actions.length){
     verify();
     const result=await connect('multi',{actions:actions.map(action=>({...action,version:6}))});
     if(!Array.isArray(result)||result.length!==actions.length||result.some(value=>!value||value.error))throw Error('Anki could not apply every vocabulary edit. Try syncing again.');
    }
   }
   for(let i=0;i<additions.length;i+=100){
    verify();
    await connect('addNotes',{notes:additions.slice(i,i+100)});
   }
   if(await existingDeck(link)!==deck)throw Error('The Anki deck changed during sync. Try again.');
   const final=(updates.length||additions.length)?await snapshot(deck):first;
   const readyIds=await connect('findNotes',{query:final.query+' (is:new or is:due) -is:suspended -is:buried'});
   if(!Array.isArray(readyIds)||readyIds.some(id=>!Number.isSafeInteger(id)))throw Error('Anki returned an invalid review list.');
   const ready=new Set(readyIds);
   const {notes:canonical,skipped}=byTerm(final.entries,baseline);
   const words={...localWords};
   for(const [term,word] of Object.entries(localWords)){
    if(!canonical.has(term)&&expired(term,word)){delete words[term];removed.add(term);}
   }
   for(const term of previousTerms)if(!canonical.has(term))removed.add(term);
   for(const [term,entry] of canonical){
    removed.delete(term);
    const former=baseline[entry.id]?.Term;
    const old=localWords[term]||(former&&localWords[former]);
    words[term]=projectWord(old,{...entry,due:ready.has(entry.id)},link.deckId);
   }
   const failed=additions.filter(note=>!canonical.has(Core.norm(plain(note.fields.Term)))).length;
   const notice=[skipped?skipped+' duplicate or blank Anki notes were skipped.':'',failed?failed+' local words could not be added. They remain in O/L for retry.':''].filter(Boolean).join(' ');
   const next={...link,deck,baseline:Object.fromEntries([...canonical.values()].map(note=>[note.id,note.values])),
    removed:[...removed],preferAnki:false,lastSync:Date.now(),notice};
   const change=JSON.stringify(words)!==JSON.stringify(localWords);
   const result=commit(change?{...state,words}:null,()=>store(next));
   return {...result,anki:status(),linked:canonical.size,ready:[...canonical.values()].filter(note=>ready.has(note.id)).length};
  });
 }
 async function review(){
  const link=load();
  if(!link.enabled)throw Error('Enable Anki sync for this language first.');
  const name=await existingDeck(link);
  if(!await connect('guiDeckReview',{name}))throw Error('Anki could not open the review. Open the deck in Anki Desktop.');
  return {deck:name};
 }
 function hasChanges(before,after){
  if(!load().enabled)return false;
  const a=before?.words||{},b=after.words;
  const keys=Object.keys(a);
  return keys.length!==Object.keys(b).length||keys.some(key=>!Object.hasOwn(b,key)||JSON.stringify(wordFields(key,a[key]))!==JSON.stringify(wordFields(key,b[key])));
 }
 return {status,test,enable,pause,rebase,sync,review,hasChanges};
}

module.exports={createAnkiSync,ankiConnect};
