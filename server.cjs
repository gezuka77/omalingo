const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const readline = require('node:readline');
const PORT = Number(process.env.OMA_PORT || 3217);
const BIND_HOST = process.env.OMA_BIND_HOST || '127.0.0.1';
const publicOrigin = process.env.OMA_PUBLIC_ORIGIN ? new URL(process.env.OMA_PUBLIC_ORIGIN) : null;
if (publicOrigin && (publicOrigin.protocol !== 'https:' || publicOrigin.href !== publicOrigin.origin + '/')) {
  throw Error('OMA_PUBLIC_ORIGIN must be an HTTPS origin, such as https://omalingo.example.com.');
}
const localHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const localOrigins = [...localHosts].map(host => 'http://' + host);
if (!publicOrigin) {
  localOrigins.push(...['3217','3219','3220','3221'].flatMap(port => ['http://127.0.0.1:' + port, 'http://localhost:' + port]));
}
const services = require('./services.cjs');
const openai = require('./openai-service.cjs');
const openrouter = require('./openrouter-connection.cjs');
const DATA_ROOT=process.env.OMA_DATA_DIR||path.join(__dirname,'data');
const AUDIO_ROOT=process.env.OMA_AUDIO_CACHE_DIR||path.join(__dirname,'audio-cache');
const CREDENTIALS_ROOT=process.env.OMA_CREDENTIALS_DIR||path.join(__dirname,'credentials');
const auth=require('./auth.cjs').createAuth({dataDir:DATA_ROOT,publicSetup:!!publicOrigin}),userServices=new Map();
function context(user,code='fi'){
 const contextKey=user.id+':'+code,language=voices.languages.find(l=>l.code===code);
 if(userServices.has(contextKey))return userServices.get(contextKey);
 const userRoot=user.legacy?DATA_ROOT:path.join(DATA_ROOT,'users',user.id),dataDir=code==='fi'?userRoot:path.join(userRoot,'languages',code),cacheDir=user.legacy&&code==='fi'?AUDIO_ROOT:path.join(dataDir,'audio-cache'),credentialsDir=user.legacy?CREDENTIALS_ROOT:path.join(userRoot,'credentials');
 const ai=user.legacy&&code==='fi'?openai:openai.createService({dataDir,cacheDir,credentialsDir,languageName:language.name,languageCode:language.speechLanguage,environmentKey:user.legacy?undefined:''});
 const router=user.legacy&&code==='fi'?openrouter:openrouter.createConnection({credentialsDir,cacheDir,language});
 const ctx={openai:ai,openrouter:router,cacheDir,language,services:user.legacy&&code==='fi'&&!process.env.OMA_ANKI_SERVER_URL?services:services.createServices({dataDir,cacheDir,openai:ai,language,userId:user.id})};userServices.set(contextKey,ctx);return ctx;
}
const voices=require('./local-voices.cjs').createVoices({folder:process.env.OMA_VOICES_DIR});
const learning=require('./learning.cjs').createLearning({dataDir:DATA_ROOT,voices});
const chat=require('./chat.cjs').createChatStore({dataDir:DATA_ROOT});
const migratedChats=new Set();
function migrateChat(user){
 if(migratedChats.has(user.id))return;
 const root=user.legacy?DATA_ROOT:path.join(DATA_ROOT,'users',user.id);
 const libraries=voices.languages.map(({code})=>path.join(code==='fi'?root:path.join(root,'languages',code),'oma.sqlite'));
 chat.migrate(user.id,libraries);
 migratedChats.add(user.id);
}
for(const user of auth.workspaceUsers()){
 try{migrateChat(user);}catch(error){console.error('Chat migration could not finish:',error.message);}
}
const PYTHON = process.env.OMA_PYTHON || (process.platform==='win32'?'python':'python3');
let worker=null,ready=false,workerError='',sequence=0;
const pending=new Map();
function startWorker(){
  if(worker)return;
  worker=spawn(PYTHON,['-u',path.join(__dirname,'piper_worker.py')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  const lines=readline.createInterface({input:worker.stdout});
  lines.on('line',line=>{try{const result=JSON.parse(line);if(result.event==='ready'){ready=true;workerError='';console.log('Local speech worker ready.');return;}const task=pending.get(result.id);if(task){clearTimeout(task.timer);pending.delete(result.id);result.error?task.reject(new Error(result.error)):task.resolve(result);}}catch{workerError='Invalid response from local voice.';}});
  worker.stderr.on('data',data=>{workerError=String(data).slice(-1200);});
  const failed=()=>{ready=false;worker=null;for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('Local voice stopped. Restart O/L.'));}pending.clear();};
  worker.on('error',error=>{workerError=error.message;failed();});worker.on('exit',failed);
}
function synthesize(text,speed,cacheDir,model){startWorker();return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Speech generation took too long. Try a shorter passage.'));},120000);pending.set(id,{resolve,reject,timer});worker.stdin.write(JSON.stringify({id,text,speed,cacheDir,...model})+'\n',error=>{if(error){clearTimeout(timer);pending.delete(id);reject(error);}});});}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function handleChat(req,res,user,ctx){
 try{
  migrateChat(user);
  if(req.method==='GET'){json(res,200,chat.read(user.id));return;}
  if(req.headers['x-oma-user']!==user.id){json(res,409,{error:'The signed-in account changed. Refresh this tab before continuing.'});return;}
  if(req.method==='DELETE'){json(res,200,chat.clear(user.id));return;}
  if(req.method!=='POST'){json(res,405,{error:'Method not allowed.'});return;}
  let size=0;
  const chunks=[];
  for await(const chunk of req){
   size+=chunk.length;
   if(size>100000){json(res,413,{error:'The message is too long.'});return;}
   chunks.push(chunk);
  }
  const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const generate=options=>{
   const request={...options,model:input.model};
   return input.provider==='openai'?ctx.openai.generate(request):ctx.services.assist(request);
  };
  json(res,200,await chat.send(user.id,input,generate));
 }catch(error){if(!res.headersSent)json(res,error.status||400,{error:error.message});}
}
const files = {'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8']};
const server = http.createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  const host=req.headers.host?.toLowerCase();
  const isPublic=!!publicOrigin && host===publicOrigin.host;
  if(!isPublic&&!localHosts.has(host)){json(res,403,{error:'This hostname is not configured for Oma Lingo.'});return;}
  const allowedOrigins=isPublic?[publicOrigin.origin]:localOrigins;
  if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){json(res,403,{error:'Open Oma Lingo directly to use this service.'});return;}
  if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Credentials','true');}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, PUT, POST, DELETE, HEAD, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Range, X-File-Name, X-Oma-User, X-Oma-Language'});res.end();return;}
  if(await auth.handle(req,res,pathname,{secure:isPublic}))return;
  if(pathname==='/api/health'){json(res,200,{service:'oma',appVersion:4,resourceCatalogVersion:2,processId:process.pid,authentication:true,temporaryChat:true,ankiSync:true});return;}
  const protectedPath=pathname.startsWith('/api/')||pathname.startsWith('/media/')||pathname.startsWith('/audio-cache/');
  const user=protectedPath?auth.current(req):null;
  if(protectedPath&&!user){json(res,401,{error:'Sign in to O/L.'});return;}
  const scopedWrite=['/api/state','/api/anki-sync'].includes(pathname)&&['POST','PUT'].includes(req.method);
  if(user&&((req.headers['x-oma-user']&&req.headers['x-oma-user']!==user.id)||(scopedWrite&&req.headers['x-oma-user']!==user.id))){json(res,409,{error:'The signed-in account changed. Refresh this tab before continuing.'});return;}
  if(user&&await learning.handle(req,res,pathname,user))return;
  const profile=user?learning.profile(user):null,code=String(req.headers['x-oma-language']||new URL(req.url,'http://localhost').searchParams.get('language')||profile?.active||'fi');
  if(user&&(!learning.supported(code)||(!profile.languages.includes(code)&&code!=='fi'))){json(res,400,{error:'Add this study language to your account first.'});return;}
  if(user&&scopedWrite&&!req.headers['x-oma-language']){json(res,409,{error:'Choose a study language before saving.'});return;}
  if(pathname==='/api/state'&&!migratedChats.has(user.id)){
   try{migrateChat(user);}catch(error){console.error('Chat migration could not finish:',error.message);}
  }
  const ctx=user?context(user,code):null;
  if(pathname==='/api/chat'){await handleChat(req,res,user,ctx);return;}
  if(ctx&&await ctx.openrouter.handle(req,res,pathname))return;
  if(ctx&&await ctx.openai.handle(req,res,pathname))return;
  if(ctx&&await ctx.services.handle(req,res,pathname))return;
  if(pathname==='/api/tts/status'&&ctx.openai.getConfig().speechProvider==='openrouter'){const c=ctx.openrouter.config();json(res,200,{service:'oma-openrouter-speech',ready:c.keyConfigured&&!!c.voice,voice:c.voice,model:c.model,local:false,aiGenerated:true});return;}
  if(pathname==='/api/tts/status'&&ctx.openai.getConfig().speechProvider==='openai'){const c=ctx.openai.getConfig();json(res,200,{service:'oma-openai-speech',ready:c.enabled&&c.keyConfigured,voice:c.speechVoice,model:c.speechModel,local:false,aiGenerated:true});return;}
  if(pathname==='/api/tts/status'){json(res,200,{service:'oma-local-speech',version:2,ready,voice:ctx.language.voiceName,language:ctx.language.code,voiceStatus:voices.status(code),local:true,error:!ready&&workerError?'Voice is unavailable. Restart O/L.':null});return;}
  if(pathname==='/api/tts'&&req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON required.'});return;}
    let body='',rejected=false;req.on('data',chunk=>{body+=chunk;if(body.length>100000&&!rejected){rejected=true;json(res,413,{error:'The passage is too long.'});}});
    req.on('end',async()=>{if(rejected)return;let text,speed;try{const input=JSON.parse(body);text=input.text;speed=input.speed;if(typeof text!=='string'||!text.trim()||text.length>20000)throw Error();}catch{json(res,400,{error:'Use between 1 and 20,000 characters.'});return;}try{const provider=ctx.openai.getConfig().speechProvider;const result=provider==='openrouter'?await ctx.openrouter.speech(text,undefined,speed):provider==='openai'?await ctx.openai.speech(text):await synthesize(text,speed,ctx.cacheDir,await voices.ensure(code));const value={url:'/audio-cache/'+result.key+'.wav',voice:ctx.language.voiceName,language:code,provider:'Piper',...result};value.url+='?language='+encodeURIComponent(code);json(res,200,value);}catch(error){json(res,503,{error:error.message});}});return;
  }
  if(/^\/audio-cache\/[a-f0-9]{64}\.(?:wav|mp3)$/.test(pathname)){
    const file=path.join(ctx.cacheDir,path.basename(pathname));let stat;try{stat=fs.statSync(file);}catch{res.writeHead(404);res.end();return;}
    const range=req.headers.range;let start=0,end=stat.size-1;
    if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}if(!match[1])start=Math.max(0,stat.size-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}}
    const headers={'Content-Type':pathname.endsWith('.mp3')?'audio/mpeg':'audio/wav','Accept-Ranges':'bytes','Content-Length':end-start+1,'Cache-Control':'private, max-age=31536000, immutable'};if(range)headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;res.writeHead(range?206:200,headers);if(req.method==='HEAD'){res.end();return;}fs.createReadStream(file,{start,end}).pipe(res);return;
  }
  const entry=files[pathname];
  if(!entry){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':entry[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  fs.createReadStream(path.join(__dirname,entry[0])).pipe(res);
 }catch(error){console.error('Request failed:',error.message);if(!res.headersSent)json(res,500,{error:'O/L could not finish this request. Please try again.'});else res.end();}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'O/L may already be running. Open http://127.0.0.1:3217 in your browser.':error.message);process.exitCode=1;});
server.listen(PORT,BIND_HOST,()=>{console.log(`Oma Lingo is listening on ${BIND_HOST}:${PORT}.`);if(openai.getConfig().speechProvider==='piper')startWorker();});
process.on('exit',()=>{if(worker)worker.kill();});
process.on('SIGINT',()=>process.exit(0));
process.on('SIGTERM',()=>process.exit(0));


