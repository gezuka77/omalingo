'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');

const chatLifetime=24*60*60*1000;
const maxMessages=30;

function createChatStore({dataDir,now=Date.now}){
 const db=new DatabaseSync(path.join(dataDir,'temporary-chat.sqlite'));
 db.exec(`PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;
  CREATE TABLE IF NOT EXISTS chat(account_id TEXT PRIMARY KEY, version TEXT NOT NULL,
    expires_at INTEGER NOT NULL, messages TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS chat_expiry ON chat(expires_at);`);
 const select=db.prepare('SELECT version,expires_at,messages FROM chat WHERE account_id=?');
 const store=db.prepare(`INSERT INTO chat VALUES(?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET
  version=excluded.version,expires_at=excluded.expires_at,messages=excluded.messages`);
 const remove=db.prepare('DELETE FROM chat WHERE account_id=?');
 const expire=db.prepare('DELETE FROM chat WHERE expires_at<=? RETURNING account_id');
 const nextExpiry=db.prepare('SELECT MIN(expires_at) AS next FROM chat');
 const pending=new Map();
 const clearedVersions=new Map();
 let timer;

 function scheduleExpiry(){
  clearTimeout(timer);
  const {next}=nextExpiry.get();
  if(next===null)return;
  timer=setTimeout(()=>{
   for(const row of expire.all(now()))pending.delete(row.account_id);
   scheduleExpiry();
  },Math.max(1,next-now()));
  timer.unref();
 }
 expire.all(now());
 scheduleExpiry();

 function read(accountId){
  const row=select.get(accountId);
  if(row&&row.expires_at>now())return {version:row.version,expiresAt:row.expires_at,messages:JSON.parse(row.messages),replying:pending.has(accountId)};
  if(row){remove.run(accountId);pending.delete(accountId);scheduleExpiry();}
  return {version:clearedVersions.get(accountId)??null,expiresAt:null,messages:[],replying:false};
 }
 function write(accountId,version,messages,expiresAt){
  store.run(accountId,version,expiresAt,JSON.stringify(messages.slice(-maxMessages)));
  scheduleExpiry();
 }
 function clear(accountId){
  remove.run(accountId);
  pending.delete(accountId);
  // A send started in a tab before Clear must not recreate the conversation.
  clearedVersions.set(accountId,randomUUID());
  scheduleExpiry();
  return read(accountId);
 }
 async function send(accountId,input,generate){
  const text=typeof input?.text==='string'?input.text.trim():'';
  if(!text||text.length>20000)throw Object.assign(Error('Enter a message of 1–20,000 characters.'),{status:400});
  const previous=read(accountId);
  if(previous.replying)throw Object.assign(Error('O/L AI is already replying in another tab.'),{status:409});
  if(input.version!==previous.version)throw Object.assign(Error('The chat changed in another tab or expired. Send your message again to continue.'),{status:409});
  const at=now();
  const last=previous.messages.at(-1);
  const history=last?.role==='user'&&last.text===text?previous.messages.slice(0,-1):previous.messages;
  const messages=[...history,{role:'user',text,at}];
  const version=randomUUID();
  write(accountId,version,messages,at+chatLifetime);
  pending.set(accountId,version);
  let error;
  try{
   const answer=await generate({text,mode:'chat',history:history.slice(-10).map(m=>({role:m.role,content:m.text.slice(0,5000)}))});
   const reply=typeof answer?.text==='string'?answer.text.trim():'';
   if(!reply)throw Error('The model returned no text. Try again.');
   if(read(accountId).version===version){
    const at=now();
    write(accountId,randomUUID(),[...messages,{role:'assistant',text:reply.slice(0,20000),at}],at+chatLifetime);
   }
  }catch(cause){
   if(read(accountId).version===version)error=cause.message||'O/L AI could not reply. Try again.';
  }finally{
   if(pending.get(accountId)===version)pending.delete(accountId);
  }
  return {...read(accountId),error};
 }

 function migrate(accountId,libraryFiles){
  for(const file of libraryFiles){
   if(!fs.existsSync(file))continue;
   const library=new DatabaseSync(file);
   try{
    library.exec('PRAGMA busy_timeout=5000');
    if(!library.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_state'").get())continue;
    const row=library.prepare("SELECT json_extract(payload,'$.aiConversations') AS messages FROM app_state WHERE id=1 AND json_type(payload,'$.aiConversations') IS NOT NULL").get();
    if(!row)continue;
    let old;
    try{old=JSON.parse(row.messages);}catch{}
    const messages=Array.isArray(old)?old.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.text==='string'&&m.text.trim()&&Number.isFinite(m.at)).slice(-maxMessages).map(({role,text,at})=>({role,text:text.slice(0,20000),at:Math.min(at,now())})):[];
    const last=messages.at(-1);
    if(last){
     const expiresAt=last.at+chatLifetime;
     if(expiresAt>now()&&expiresAt>(read(accountId).expiresAt??0))write(accountId,randomUUID(),messages,expiresAt);
    }
    library.prepare("UPDATE app_state SET payload=json_remove(payload,'$.aiConversations') WHERE id=1").run();
   }finally{library.close();}
  }
 }
 return {read,clear,send,migrate,close(){clearTimeout(timer);db.close();}};
}

module.exports={createChatStore};
