'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{DatabaseSync}=require('node:sqlite');
const languages=require('./languages.json');
const retiredSources=new Set(require('./retired-source-ids.json'));
const interests=['Reading','Videos','News Feed','Local News','Guided Courses','Mini Stories','Entertainment','Grammar','Travel','Podcasts','Sports','Technology'];
function createLearning({dataDir=process.env.OMA_DATA_DIR||path.join(__dirname,'data'),voices}={}){
 fs.mkdirSync(dataDir,{recursive:true});const db=new DatabaseSync(path.join(dataDir,'learning.sqlite'));
 db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,language TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(language,payload));');
 const supported=code=>languages.some(l=>l.code===code);
 function profile(user){const row=db.prepare('SELECT payload FROM profiles WHERE user_id=?').get(user.id);return row?JSON.parse(row.payload):{languages:[],active:null};}
 function list(code){return db.prepare('SELECT id,payload FROM sources WHERE language=? ORDER BY rowid').all(code).filter(row=>!retiredSources.has(row.id)).map(row=>JSON.parse(row.payload));}
 function publicFeedUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''}catch{return ''}}
 function add(code,value){if(!supported(code))throw Error('Choose an available language.');let url;try{url=new URL(value.url)}catch{throw Error('Use a valid public source URL.')}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Use a public HTTP or HTTPS URL.');const existing=list(code).find(s=>s.url===url.href);if(existing)return existing;
  const entry={id:String(value.id||'shared-'+crypto.randomUUID()),language:code,name:String(value.name||url.hostname).slice(0,120),url:url.href,siteUrl:url.href,feedUrl:publicFeedUrl(value.feedUrl),mode:value.mode==='website'?'website':'feed',level:String(value.level||'').slice(0,80),access:String(value.access||'').slice(0,160),kind:['news','video','podcast','resource'].includes(value.kind)?value.kind:'news',categories:Array.isArray(value.categories)?value.categories.filter(v=>interests.includes(v)):[],category:String(value.category||'News Feed').slice(0,40),description:String(value.description||'').slice(0,500),availability:value.availability==='verified'?'verified':'unverified'};db.prepare('INSERT OR IGNORE INTO sources VALUES(?,?,?)').run(entry.id,code,JSON.stringify(entry));return entry;
 }
 // Retire general book catalogs; existing lessons and personal sources are retained.
 for(const id of ['fi-gutenberg','hu-gutenberg']){const old=db.prepare('SELECT payload FROM sources WHERE id=?').get(id);if(old&&JSON.parse(old.payload).url.startsWith('https://www.gutenberg.org/browse/languages/')){const folder=path.join(dataDir,'backups');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,id+'-retired-source.json'),old.payload);db.prepare('DELETE FROM sources WHERE id=?').run(id);}}
 // Seed the shared Finnish catalog once. Personal lessons and progress are never copied.
 for(const source of require('./source-catalog.js'))if(source.url)add('fi',source);
 for(const source of require('./shared-source-seeds.json')){
  const existing=db.prepare('SELECT payload FROM sources WHERE id=? AND language=?').get(source.id,source.language);
  const entry=existing?JSON.parse(existing.payload):add(source.language,source);
  if(entry.id!==source.id)continue;
  const url=new URL(source.url).href;
  Object.assign(entry,{url,siteUrl:url,name:source.name,categories:source.categories||[source.category],category:source.category,
   feedUrl:publicFeedUrl(source.feedUrl),kind:source.kind,mode:source.mode||'feed',description:source.description,
   access:source.access||'',publicCourse:source.publicCourse===true,browseOnly:source.browseOnly===true});
  db.prepare('UPDATE sources SET payload=? WHERE id=? AND language=?').run(JSON.stringify(entry),entry.id,source.language);
 }
 const oldFile=path.join(dataDir,'oma.sqlite');if(fs.existsSync(oldFile)){const old=new DatabaseSync(oldFile,{readOnly:true});try{const row=old.prepare('SELECT payload FROM app_state WHERE id=1').get();const state=row?JSON.parse(row.payload):null;for(const source of state?.settings?.customSources||[])if(source.url)add('fi',source)}finally{old.close()}}
 async function input(req){let b='';for await(const c of req){b+=c;if(b.length>12000)throw Error('Request too large.')}return JSON.parse(b||'{}')}
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 async function handle(req,res,pathname,user){if(!['/api/learning','/api/learning/voice','/api/shared-sources'].includes(pathname))return false;
  try{
   if(pathname==='/api/learning'){
    if(req.method==='GET'){send(res,200,{profile:profile(user),interests,available:languages.map(l=>({code:l.code,name:l.name,nativeName:l.nativeName,voice:voices.status(l.code)}))});return true}
    if(req.method!=='POST')throw Error('Use a supported learning action.');const p=await input(req),current=profile(user);if(!supported(p.language))throw Error('Choose an available language.');if(!current.languages.includes(p.language))current.languages.push(p.language);current.active=p.language;if(p.interests!==undefined){if(!Array.isArray(p.interests)||!p.interests.length||p.interests.some(v=>!interests.includes(v)))throw Error('Choose at least one available interest.');current.interests=current.interests||{};current.interests[p.language]=[...new Set(p.interests)];}db.prepare('INSERT INTO profiles VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload').run(user.id,JSON.stringify(current));voices.ensure(p.language).catch(()=>{});send(res,200,{profile:current,voice:voices.status(p.language)});return true;
   }
   const code=String(req.headers['x-oma-language']||profile(user).active||'fi');if(!supported(code))throw Error('Choose an available language.');
   if(pathname==='/api/learning/voice'){if(req.method==='POST')voices.ensure(code).catch(()=>{});send(res,200,voices.status(code));return true}
   if(req.method==='GET'){send(res,200,{language:code,sources:list(code)});return true}
   if(req.method==='POST'){if(user.role!=='admin'){send(res,403,{error:'The administrator manages shared sources.'});return true}send(res,201,{source:add(code,await input(req))});return true}
   throw Error('Unsupported source action.');
  }catch(e){send(res,400,{error:e.message});return true}
 }
 return {profile,handle,supported,list,add};
}
module.exports={createLearning};
