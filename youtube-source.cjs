'use strict';
function youtubeId(value){
 let u;try{u=new URL(value);}catch{throw Error('Use a valid source URL.');}
 if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(u.hostname))return null;
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)throw Error('Use a standard YouTube URL.');
 const id=u.hostname==='youtu.be'?u.pathname.split('/')[1]:u.pathname==='/watch'?u.searchParams.get('v'):['shorts','embed','live'].includes(u.pathname.split('/')[1])?u.pathname.split('/')[2]:null;
 if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))throw Error('Choose a single YouTube video URL.');return id;
}
function youtubeImportPlan(url,source='openai'){
 const id=youtubeId(url);if(!id)return null;
 if(!['openai','publisher','automatic'].includes(source))throw Error('Choose a transcript source.');
 return source==='openai'?{kind:'openai-transcribe',input:{youtubeId:id}}:{kind:'captions',input:{action:'youtube-captions',url:'https://www.youtube.com/watch?v='+id,captionMode:source}};
}
module.exports={youtubeId,youtubeImportPlan};
