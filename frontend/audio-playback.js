/* Preserve the tapped media element across asynchronous speech generation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OmaAudio=api;})(globalThis,()=>{
 const silence='data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
 const primed=new WeakSet(),pending=new WeakSet();
 function prime(audio){
  if(!audio||primed.has(audio)||pending.has(audio)||audio.getAttribute('src'))return;
  audio.setAttribute('playsinline','');audio.src=silence;pending.add(audio);
  const clear=()=>{if(audio.getAttribute('src')===silence){audio.pause();audio.removeAttribute('src');}};
  try{Promise.resolve(audio.play()).then(()=>{primed.add(audio);clear();},clear).finally(()=>pending.delete(audio));}
  catch{clear();pending.delete(audio);}
 }
 async function play(audio,{isCurrent=()=>true,onBlocked=()=>{}}={}){
  if(!isCurrent())return false;
  audio.setAttribute('playsinline','');
  const source=audio.src;
  try{await audio.play();return true;}
  catch(error){
   if(error?.name!=='NotAllowedError')throw error;
   if(isCurrent()&&audio.src===source)onBlocked(async()=>{
    if(!isCurrent()||audio.src!==source)return false;
    await audio.play();return true;
   });
   return false;
  }
 }
 return {prime,play};
});
