'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MODEL='gpt-realtime-2.1-mini',RATE=24000;
function wav(pcm){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(pcm.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(RATE,24);h.writeUInt32LE(RATE*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm]);}
function createVoice(options){
 const folder=options.folder||process.env.OMA_AUDIO_CACHE_DIR||path.join(__dirname,'audio-cache'),pending=new Map(),sessions=require('./voice-session.cjs').createSessions({language:options.languageName||'Finnish'});
 async function generate(text,voice='marin'){
  if(typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Choose a word or sentence of up to 4,000 characters for OpenAI speech.');
  if(!['marin','cedar'].includes(voice))throw Error('Choose Marin or Cedar for OpenAI speech.');
  const key=crypto.createHash('sha256').update(JSON.stringify(['oma-multilingual-voice-v3',options.languageName||'Finnish',MODEL,voice,text])).digest('hex'),file=path.join(folder,key+'.wav');
  if(fs.existsSync(file)){const size=fs.statSync(file).size;return {key,url:'/audio-cache/'+key+'.wav',cached:true,duration:(size-44)/(RATE*2),voice,model:MODEL,provider:'OpenAI',aiGenerated:true};}
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
   const token=await options.getKey();let WS=options.WebSocket; if(!WS){try{WS=require('ws');}catch{throw Error('Install the ws package to use realtime voice.');}}
   const pcm=await sessions.generate(voice,text,token,WS,MODEL);
   const audio=wav(pcm);fs.mkdirSync(folder,{recursive:true});const temp=file+'.tmp-'+process.pid;fs.writeFileSync(temp,audio);fs.renameSync(temp,file);
   return {key,url:'/audio-cache/'+key+'.wav',cached:false,duration:pcm.length/(RATE*2),voice,model:MODEL,provider:'OpenAI',aiGenerated:true};
  })();pending.set(key,task);try{return await task;}finally{pending.delete(key);}
 }
 return {generate,close:sessions.close};
}
module.exports={createVoice,wav,MODEL};
