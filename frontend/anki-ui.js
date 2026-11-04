let ankiStatus={enabled:false},ankiTimer,ankiRunning,ankiDurableWords,ankiRestorePending=false,ankiError='';
const ankiDesktopEnabled=()=>ankiStatus.enabled&&ankiStatus.mode!=='server';
const ankiWordLinked=word=>ankiDesktopEnabled()&&word?.ankiDeckId===ankiStatus.deckId&&Number.isSafeInteger(word?.ankiNoteId);
const wordReady=word=>!!word.meaning&&(ankiWordLinked(word)?word.ankiDue===true:word.status>=1&&word.status<=4&&word.due<=Date.now());

function showAnkiStatus(message){
 const status=$('#anki-sync-status');
 if(!status)return;
 status.textContent=message||ankiError||(!ankiStatus.available?'Restart O/L to connect to Anki.':ankiStatus.mode==='server'&&!ankiStatus.accountConnected?'Your account needs an Anki connection. Ask the administrator to link your personal collection.':!ankiStatus.enabled?
  (ankiStatus.linked?'Sync is paused.':'Sync is off.'):
  ankiStatus.lastSync?'Last synced '+new Date(ankiStatus.lastSync).toLocaleString()+'. '+(ankiStatus.notice||''):'Ready to sync.');
}
async function loadAnkiStatus(){
 try{ankiStatus={...await api('/api/anki-sync'),available:true};}
 catch{ankiStatus={enabled:false,available:false};}
}
function queueAnkiSync(delay=1800){
 clearTimeout(ankiTimer);
 if(!connected||!ankiStatus.enabled)return;
 ankiTimer=setTimeout(()=>{
  if(document.hidden)return queueAnkiSync(45000);
  syncAnki().catch(()=>{});
 },delay);
}
async function startAnkiSync(){
 await loadAnkiStatus();
 queueAnkiSync(1500);
}
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&ankiStatus.enabled)queueAnkiSync(1000);
});

function applyAnkiWords(before,words){
 for(const term of new Set([...Object.keys(before),...Object.keys(words)])){
  const previous=before[term],remote=words[term];
  if(JSON.stringify(previous)===JSON.stringify(remote))continue;
  if(!remote){delete s.words[term];selected.delete(term);continue;}
  const current=s.words[term];
  if(!previous||!current){s.words[term]={...current,...remote};continue;}
  // Preserve unrelated edits made in this tab while Anki was responding.
  for(const [key,value] of Object.entries(remote)){
   if(JSON.stringify(value)!==JSON.stringify(previous[key])||JSON.stringify(current[key])===JSON.stringify(previous[key]))current[key]=value;
  }
 }
}
function syncAnki(){
 if(ankiRunning)return ankiRunning;
 ankiRunning=(async()=>{
  if(localStorage.getItem('oma-pending-v2'))await flush();
  showAnkiStatus('Syncing with Anki…');
  const task=saveChain.catch(()=>{}).then(async()=>{
   const before=ankiDurableWords;
   const result=await api('/api/anki-sync',{action:'sync',revision});
   revision=result.revision;
   ankiStatus={...result.anki,available:true};
   if(result.words){
    applyAnkiWords(before,result.words);
    ankiDurableWords=result.words;
    localStorage.setItem('oma-reader-v2',JSON.stringify(s));
    if(localStorage.getItem('oma-pending-v2'))localStorage.setItem('oma-pending-v2',JSON.stringify({state:s,revision,ankiRestore:ankiRestorePending}));
   }
   return result;
  });
  saveChain=task;
  return task;
 })().then(result=>{
  ankiError='';
  if(result.words&&view==='words'&&!$('#dialog')?.open&&!document.activeElement?.matches('input, select, textarea'))render();
  showAnkiStatus();
  return result;
 }).catch(error=>{
  ankiError=error.message;
  showAnkiStatus();
  throw error;
 }).finally(()=>{
  ankiRunning=null;
  queueAnkiSync(45000);
 });
 return ankiRunning;
}
async function practiseInAnki(){
 await syncAnki();
 await api('/api/anki-sync',{action:'review'});
 toast('Review opened in Anki Desktop.');
}
function ankiSettings(){
 const host=$('#settings-content');
 host.innerHTML=`<section class="settings-card"><h2>Anki sync</h2>
 <div id="anki-connection-description"><p>Checking your Anki connection…</p></div>
 <p id="anki-sync-deck" class="muted"></p><div class="row wrap" id="anki-sync-controls"></div>
 <p id="anki-sync-status" role="status">Checking the connection…</p></section>`;
 const controls=host.querySelector('#anki-sync-controls');
 const deck=host.querySelector('#anki-sync-deck');
 function draw(){
  if(!host.isConnected)return;
  const server=ankiStatus.mode==='server';
  host.querySelector('#anki-connection-description').innerHTML=server?
   `<p>Sync your saved ${E(learningLanguage().name)} words with your personal Anki collection. Words added from your other connected apps appear here too. If both sides edit a meaning, the central collection wins.</p><p>Anki Desktop does not need to stay open. Set your Anki app’s custom sync server to <strong>${E(ankiStatus.syncServer||'')}</strong> and use your personal Anki login. Review progress syncs between your Anki clients; O/L keeps its own practice progress.</p><p class="muted">Context, notes and familiarity stay in O/L. Removing a word here does not delete it from Anki; it can return on the next sync.</p>`:
   `<p>Sync saved words for ${E(learningLanguage().name)} with a dedicated deck in Anki Desktop. When both apps change the same field, Anki’s version wins.</p><p>Keep Anki Desktop open with the <a href="https://ankiweb.net/shared/info/2055492159" target="_blank" rel="noopener">AnkiConnect add-on</a> running. Anki manages review scheduling for linked words.</p>`;
  deck.textContent=ankiStatus.deck?'Deck in Anki · '+ankiStatus.deck:'';
  controls.innerHTML=ankiStatus.available?`<button id="anki-test">Test connection</button>
   ${ankiStatus.enabled?'<button id="anki-sync-now" class="primary">Sync now</button><button id="anki-pause">Pause sync</button>':
   '<button id="anki-enable" class="primary">'+(ankiStatus.linked?'Resume sync':'Enable sync')+'</button>'}`:'';
  if(server&&!ankiStatus.accountConnected)controls.querySelectorAll('button').forEach(button=>button.disabled=true);
  showAnkiStatus();
  const on=(id,action)=>bind(id,async event=>{
   const buttons=[...controls.querySelectorAll('button')];
   buttons.forEach(b=>b.disabled=true);
   try{await action();}catch(error){showAnkiStatus(error.message);}
   finally{buttons.forEach(b=>b.disabled=false);}
  });
  on('anki-test',async()=>{
   const result=await api('/api/anki-sync',{action:'test'});
   showAnkiStatus(result.mode==='server'?'Connected to your personal Anki collection.':'Connected to AnkiConnect. API version '+result.version+'.');
  });
  on('anki-enable',async()=>{
   showAnkiStatus('Linking your Anki deck…');
   await flush();
   ankiStatus={...await api('/api/anki-sync',{action:'enable'}),available:true};
   ankiError='';
   try{await syncAnki();}finally{draw();}
  });
  on('anki-sync-now',()=>syncAnki());
  on('anki-pause',async()=>{
   if(ankiRunning)await ankiRunning.catch(()=>{});
   ankiStatus={...await api('/api/anki-sync',{action:'pause'}),available:true};
   ankiError='';
   queueAnkiSync();
   draw();
  });
 }
 loadAnkiStatus().then(draw);
}
