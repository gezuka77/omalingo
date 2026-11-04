'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const languages=require('./languages.json');
function createVoices({folder=path.join(__dirname,'voices'),fetchImpl=fetch}={}){
 const pending=new Map(),states=new Map();fs.mkdirSync(folder,{recursive:true});
 const language=code=>languages.find(l=>l.code===code);
 function status(code){const l=language(code);if(!l)throw Error('Unsupported study language.');const ready=l.files.every(f=>{const p=path.join(folder,path.basename(f.path));return fs.existsSync(p)&&fs.statSync(p).size===f.size_bytes});return {language:code,voice:l.voiceName,voiceId:l.voice,state:ready?'ready':states.get(code)?.state||'not-downloaded',downloadBytes:l.files.reduce((n,f)=>n+f.size_bytes,0),...(!ready?states.get(code):{})};}
 async function ensure(code){const l=language(code);if(!l)throw Error('Choose an available language.');if(status(code).state==='ready')return {modelPath:path.join(folder,l.voice+'.onnx'),voiceId:l.voice,voice:l.voiceName};if(pending.has(code))return pending.get(code);
  const task=(async()=>{states.set(code,{state:'downloading',percent:0});let total=0;const all=l.files.reduce((n,f)=>n+f.size_bytes,0);
   for(const f of l.files){const dest=path.join(folder,path.basename(f.path));if(fs.existsSync(dest)&&fs.statSync(dest).size===f.size_bytes){total+=f.size_bytes;continue;}const tmp=dest+'.partial-'+crypto.randomUUID();try{
    const response=await fetchImpl('https://huggingface.co/rhasspy/piper-voices/resolve/main/'+f.path,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('The local voice download failed. Retry in Languages settings.');const hash=crypto.createHash('md5');let bytes=0;const file=fs.openSync(tmp,'w');try{for await(const chunk of response.body){bytes+=chunk.length;if(bytes>f.size_bytes)throw Error('Unexpected local voice download size.');hash.update(chunk);fs.writeSync(file,chunk);states.set(code,{state:'downloading',percent:Math.floor((total+bytes)/all*100)})}}finally{fs.closeSync(file)}
    if(bytes!==f.size_bytes||hash.digest('hex')!==f.md5_digest)throw Error('Local voice verification failed. Retry the download.');fs.renameSync(tmp,dest);total+=bytes;
   }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}}
   states.set(code,{state:'ready'});return {modelPath:path.join(folder,l.voice+'.onnx'),voiceId:l.voice,voice:l.voiceName};
  })().catch(e=>{states.set(code,{state:'failed',error:e.message});throw e}).finally(()=>pending.delete(code));pending.set(code,task);return task;
 }
 return {status,ensure,languages};
}
module.exports={createVoices};
