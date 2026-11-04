'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createServerSync}=require('../anki-server.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'oma-anki-'));
 const file=path.join(root,'accounts.json');
 const a='a'.repeat(43),b='b'.repeat(43);
 fs.writeFileSync(file,JSON.stringify({version:1,accounts:{alice:{token:a,syncUsername:'alice'},bob:{token:b,syncUsername:'bob'}}}));
 const collections=new Map([[a,new Map()],[b,new Map()]]),dbs=[],calls=[];let nextId=10;
 t.after(()=>{dbs.forEach(db=>db.close());fs.rmSync(root,{recursive:true,force:true});});
 const transport=async(url,options)=>{
  assert.equal(url.origin,'https://anki.example.com');assert.equal(options.redirect,'error');
  const token=options.headers.Authorization.slice(7);assert.ok(collections.has(token));calls.push({token,method:options.method});
  const store=collections.get(token);
  if(options.method==='POST'){
   const body=JSON.parse(options.body);assert.equal(body.language,'fi');assert.equal(Object.hasOwn(body,'userId'),false);
   const old=store.get(body.word);const value={note_id:old?.note_id||nextId++,fields:{Front:body.word,Back:body.meaning},tags:['vocabulary','language_fi']};store.set(body.word,value);
   return {ok:true,json:async()=>({note_id:value.note_id,created:!old})};
  }
  const offset=Number(url.searchParams.get('offset')||0),notes=[...store.values()];
  return {ok:true,json:async()=>({total:notes.length,offset,notes:notes.slice(offset,offset+100)})};
 };
 function app(user){const db=new DatabaseSync(':memory:');dbs.push(db);return createServerSync({db,language:{code:'fi'},userId:user,serverUrl:'https://anki.example.com',accountsFile:file,transport});}
 async function sync(app,state){return app.sync({state,verify:()=>state,commit:(next,remember)=>{remember();return {revision:2,words:(next||state).words};}});}
 return {app,sync,collections,calls,a,b,file,transport};
}
test('separate authenticated identities, stable writes and meaning conflict handling preserve local study data',async t=>{
 const f=fixture(t),alice=f.app('alice'),bob=f.app('bob');
 await alice.enable();await bob.enable();
 let state={words:{kissa:{term:'kissa',meaning:'cat',status:3,due:123,note:'my note',tags:['mine'],context:'sentence'}}};
 let result=await f.sync(alice,state);state={words:result.words};
 assert.equal(f.collections.get(f.a).size,1);assert.equal(f.collections.get(f.b).size,0);
 const id=state.words.kissa.ankiServerNoteId;assert.ok(id);
 await f.sync(alice,state);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 state.words.kissa.meaning='a cat';result=await f.sync(alice,state);state={words:result.words};
 assert.equal(f.collections.get(f.a).get('kissa').fields.Back,'a cat');assert.equal(state.words.kissa.ankiServerNoteId,id);
 f.collections.get(f.a).get('kissa').fields.Back='remote meaning';state.words.kissa.meaning='concurrent local edit';
 result=await f.sync(alice,state);assert.equal(result.words.kissa.meaning,'remote meaning');
 assert.equal(result.words.kissa.note,'my note');assert.equal(result.words.kissa.context,'sentence');assert.equal(result.words.kissa.due,123);assert.equal(result.words.kissa.status,3);
 assert.deepEqual((await f.sync(bob,{words:{}})).words,{});
 assert.equal(JSON.stringify(alice.status()).includes(f.a),false);
 const unmapped=f.app('someone-else');assert.equal(unmapped.status().accountConnected,false);await assert.rejects(unmapped.test(),/personal collection/);
});
test('pagination, language filtering, HTML decoding and local removals do not delete central words',async t=>{
 const f=fixture(t);for(let i=0;i<105;i++)f.collections.get(f.a).set('word'+i,{note_id:100+i,fields:{Front:'word'+i,Back:'meaning &amp; more'},tags:['language_fi']});
 f.collections.get(f.a).set('english',{note_id:1000,fields:{Front:'english',Back:'not Finnish'},tags:['language_en']});
 const app=f.app('alice');await app.enable();const result=await f.sync(app,{words:{}});assert.equal(Object.keys(result.words).length,105);assert.equal(result.words.word0.meaning,'meaning & more');
 const again=await f.sync(app,{words:{}});assert.equal(Object.keys(again.words).length,105);assert.equal(f.calls.some(c=>c.method==='POST'),false);
});
test('failed requests preserve unsynced local data and credential remapping aborts without cross-user writes',async t=>{
 const f=fixture(t),app=f.app('alice');await app.enable();
 const state={words:{word:{meaning:'saved locally',status:1}}};
 fs.writeFileSync(f.file,JSON.stringify({version:1,accounts:{bob:{token:f.b}}}));
 await assert.rejects(f.sync(app,state),/personal collection/);assert.equal(state.words.word.meaning,'saved locally');assert.equal(f.collections.get(f.b).size,0);
});
test('transport errors are sanitized and unsupported server origins are rejected',async t=>{
 const f=fixture(t),db=new DatabaseSync(':memory:');t.after(()=>db.close());
 assert.throws(()=>createServerSync({db,language:{code:'fi'},serverUrl:'http://127.0.0.1',accountsFile:f.file}),/HTTPS/);
 const app=createServerSync({db,language:{code:'fi'},userId:'alice',serverUrl:'https://anki.example.com',accountsFile:f.file,transport:async()=>{throw Error('private credential details');}});
 await assert.rejects(app.test(),e=>!e.message.includes('private credential')&&e.status===503);
});
