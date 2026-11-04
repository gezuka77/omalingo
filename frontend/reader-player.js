function installPlayerLabels(){
 player.addEventListener('loadedmetadata',applyPlaybackSpeed);
 for(const [id,label]of [['player-play','Play or pause the open lesson'],['player-prev','Previous sentence'],['player-next','Next sentence'],['player-back','Rewind 5 seconds'],['player-forward','Forward 5 seconds'],['player-loop','Repeat audio'],['player-sleep','Sleep timer']]){const el=$('#'+id);if(el){el.title=label;el.setAttribute('aria-label',label);}}
 $('#player-seek').title='Position within the current recording or spoken sentence';
}
function applyPlaybackSpeed(){
 const rate=Number(s.settings.rate)||.85;
 const effective=rate/(player.generatedRate||1);
 player.defaultPlaybackRate=effective;player.playbackRate=effective;player.preservesPitch=true;
 if(pronunciation){const pronunciationRate=rate/(pronunciation.generatedRate||1);pronunciation.defaultPlaybackRate=pronunciationRate;pronunciation.playbackRate=pronunciationRate;pronunciation.preservesPitch=true;}
 if(videoMode)youtube?.setPlaybackRate?.(rate);
 const select=$('#player-rate');if(select)select.value=String(rate);
}
async function setPlaybackSpeed(value){
 const rate=Number(value);if(![.5,.7,.85,1,1.2,1.5,2].includes(rate))return;
 s.settings.rate=rate;s.settings.playbackSpeedVersion=1;save();
 if(!['ElevenLabs via OpenRouter','Piper'].includes(player.generatedProvider)||!clips.length||!playingLesson){applyPlaybackSpeed();return;}
 const lesson=playingLesson,index=clipIndex,wasPlaying=mediaPlaying(),fraction=Number.isFinite(player.duration)&&player.duration>0?player.currentTime/player.duration:0;
 const request=player.paceRequest=(player.paceRequest||0)+1;pauseMedia();$('#player-source').textContent='Preparing natural speech at '+rate+'×…';
 try{const r=await api('/api/tts',{text:clips[index].slice(0,20000),speed:rate});if(request!==player.paceRequest||playingLesson!==lesson||clipIndex!==index)return;player.generatedRate=r.nativeRate||1;player.generatedProvider=r.provider;player.addEventListener('loadedmetadata',()=>{if(request===player.paceRequest&&Number.isFinite(player.duration))player.currentTime=Math.min(fraction*player.duration,Math.max(0,player.duration-.01));},{once:true});player.src=base+r.url;applyPlaybackSpeed();$('#player-source').textContent=r.provider+' · '+r.voice+' · natural '+(r.nativeRate||1)+'×';if(wasPlaying&&!lessonPlaybackSuspended)await playMedia();}
 catch(e){applyPlaybackSpeed();throw e;}
}
function toggleReaderSentenceView(){
 const l=current();if(!l)return;
 pauseMedia();readerSentenceRange=null;s.settings.sentenceMode=!s.settings.sentenceMode;chosen='';anchor=null;save();reader(l);
 const article=$('#reader-text')?.closest('article');if(article)article.scrollTop=0;
 if(!s.settings.sentenceMode){const p=C.segments(l.text)[s.positions[l.id]||0];const active=$$('#reader-text .token').find(el=>Number(el.dataset.start)>=p?.start);if(active)followReaderPlayback(active,l,p.start);}
}
async function navigateReaderSentence(delta){
 trackRead();const l=current();if(!l)return;
 const parts=C.segments(l.text),wasPlaying=mediaPlaying();pauseMedia();
 s.positions[l.id]=Math.max(0,Math.min(parts.length-1,Number(s.positions[l.id]||0)+delta));chosen='';anchor=null;save();reader(l);
 const sentence=parts[s.positions[l.id]];if(!sentence)return;
 if(playingLesson===l.id){
  if(clips.length){clipIndex=s.positions[l.id];await loadClip();if(wasPlaying&&playingLesson===l.id)await playMedia();}
  else{const cue=l.cues.find(c=>Number.isFinite(c.charStart)?c.charStart>=sentence.start&&c.charStart<sentence.end:c.text===sentence.text);if(cue){readerSentenceRange=s.settings.sentenceMode?{start:cue.start,end:cue.end}:null;seekMedia(cue.start);syncPlaybackHighlight();if(wasPlaying)await playMedia();}}
 }else if(s.settings.autoSentence)await speak(sentence.text);
 const el=$$('#reader-text .token').find(el=>s.settings.sentenceMode||Number(el.dataset.start)>=sentence.start);if(el)followReaderPlayback(el,l,sentence.start);
}
function startReaderSentenceReview(){
 const l=current();if(!l)return;pauseMedia();
 const sentence=C.segments(l.text)[Number(s.positions[l.id]||0)]?.text;if(!sentence)return;
 paritySentenceOnly=true;review={terms:[sentence],items:{[sentence]:{term:sentence,meaning:l.sentenceTranslations?.[sentence]||'',context:sentence,status:1,due:0,lessonId:l.id}},index:0,type:'unscramble',material:'sentences',reschedule:false,autospeak:false,cardFields:[],skips:0,results:[],retries:new Set(),graded:false};
 view='review';reviewCard();
}
function closeReaderSentenceReview(){review=null;paritySentenceOnly=false;view='library';render();}

let readerSentenceRange=null;
function readerTimelineTime(){return readerSentenceRange?Math.max(0,mediaTime()-readerSentenceRange.start):mediaTime();}
function readerTimelineDuration(){return readerSentenceRange?readerSentenceRange.end-readerSentenceRange.start:mediaDuration();}
function seekReaderTimeline(fraction){seekMedia((readerSentenceRange?.start||0)+fraction*readerTimelineDuration());syncPlaybackHighlight();}
async function playSelectedReaderSentence(){
 const l=current();if(!l)return;const index=Number(s.positions[l.id]||0),part=C.segments(l.text)[index];if(!part)return;
 if(playingLesson!==l.id||(!player.src&&!videoMode))await playLesson(l.id);
 if(view!=='library'||lid!==l.id||playingLesson!==l.id)return;
 if(clips.length){if(clipIndex!==index){clipIndex=index;await loadClip();}else if(player.ended)seekMedia(0);readerSentenceRange=null;}
 else{const cue=l.cues.find(c=>Number.isFinite(c.charStart)?c.charStart>=part.start&&c.charStart<part.end:c.text===part.text);if(!cue)throw Error('This sentence has no audio timing.');readerSentenceRange={start:cue.start,end:cue.end};seekMedia(cue.start);$('#player-source').textContent='Original audio · sentence '+(index+1)+'/'+C.segments(l.text).length;}
 await playMedia();
}
setInterval(()=>{if(readerSentenceRange&&mediaPlaying()&&mediaTime()>=readerSentenceRange.end){if(player.loop)seekMedia(readerSentenceRange.start);else pauseMedia();}},100);

function syncLocalSpeechFollow(){
 if(view!=='library'||playingLesson!==lid||!clips.length)return;
 const l=current(),part=C.segments(l?.text||'')[clipIndex];if(!l||!part)return;
 // Restore the sentence immediately, including time zero and after a redraw.
 const offset=s.settings.sentenceMode?part.start+l.text.slice(part.start,part.end).indexOf(part.text):0;
 const root=$('#reader-text'),mark=l.id+':'+clipIndex+':'+s.settings.sentenceMode;let active=syncLocalSpeechFollow.active;
 if(syncLocalSpeechFollow.root!==root||syncLocalSpeechFollow.mark!==mark||!active?.isConnected){
 active=null;for(const el of $$('#reader-text .token')){const start=Number(el.dataset.start)+offset,end=Number(el.dataset.end)+offset;const on=start<part.end&&end>part.start;el.classList.toggle('sounding',on);if(on&&!active)active=el;}
 syncLocalSpeechFollow.root=root;syncLocalSpeechFollow.mark=mark;syncLocalSpeechFollow.active=active;
 }
 if(active&&!player.paused){
  const progress=Number.isFinite(player.duration)&&player.duration>0?Math.min(.99,player.currentTime/player.duration):0;
  const relative=Math.floor(part.text.length*progress),start=part.start+l.text.slice(part.start,part.end).indexOf(part.text);
  const target=$$('#reader-text .sounding').find(el=>Number(el.dataset.end)+offset>=start+relative)||active;
  followReaderPlayback(target,l,part.start+relative);
 }
}

function refreshSentenceVocabulary(){
 const section=$('.reader-vocabulary-list'),l=current();if(!section||!l)return;
 const sentence=C.segments(l.text)[Number(s.positions[l.id]||0)]?.text||'';
 const words=[...new Set([...C.words(sentence).map(C.norm),...C.matches(s,sentence).map(p=>p.term)])];
 const learning=k=>s.words[k]&&s.words[k].status>=1&&s.words[k].status<=4;
 const groups={saved:words.filter(learning),new:words.filter(k=>!s.words[k]||s.words[k].status===0),all:words};
 const tab=groups[parityReaderList]?parityReaderList:'saved';
 section.innerHTML='<div class="reader-list-tabs" role="tablist" aria-label="Sentence vocabulary">'+[['saved','O/L Words'],['new','New Words'],['all','All Words']].map(([id,label])=>`<button role="tab" aria-selected="${tab===id}" data-reader-list="${id}" class="${tab===id?'active':''}">${label} <small>${groups[id].length}</small></button>`).join('')+'</div><div class="sentence-vocabulary-entries">'+(groups[tab].map(k=>{const w=s.words[k];return `<div class="reader-vocab-entry"><span class="status-circle level-${w?.status||0}" title="${w?statusName(w.status):'New word'}">${w?.status===5?'✓':w?.status===-1?'−':w?.status||'＋'}</span><button class="reader-vocab-meaning" data-reader-term="${E(k)}"><strong>${E(k)}</strong><small>${E(w?.meaning||'Choose a meaning')}</small></button><button class="reader-vocab-pronounce" data-reader-speak="${E(k)}" aria-label="Pronounce ${E(k)}">${speakerIcon()}</button></div>`;}).join('')||`<p class="muted">${tab==='saved'?'No O/L Words in this sentence yet. Choose New Words to save a meaning.':'No new words in this sentence.'}</p>` )+'</div>';
 section.querySelectorAll('[data-reader-list]').forEach(b=>b.onclick=()=>{parityReaderList=b.dataset.readerList;refreshSentenceVocabulary();});
 section.querySelectorAll('[data-reader-term]').forEach(b=>b.onclick=()=>termPanel(b.dataset.readerTerm,sentence));
 section.querySelectorAll('[data-reader-speak]').forEach(b=>b.onclick=act(()=>speak(b.dataset.readerSpeak)));
 $$('#reader-text .token').forEach(el=>{const w=s.words[C.norm(el.textContent)];for(const name of [...el.classList])if(name.startsWith('level-'))el.classList.remove(name);el.classList.add('level-'+(w?.status||0));});
}

function reviewCard(){reviewCardBase();decorateSentenceReview();}
function decorateSentenceReview(){
 const active=view==='review'&&paritySentenceOnly;document.body.classList.toggle('sentence-review-mode',active);$('#main').classList.toggle('sentence-review-page',active);if(!active)return;
 const top=$('.review-topline'),back=$('#review-close'),options=$('#review-options');
 if(top&&back){back.textContent='← Back to lesson';back.setAttribute('aria-label','Back to lesson');back.className='sentence-review-back';const context=document.createElement('div');context.className='sentence-review-context';const label=document.createElement('small');label.textContent='Sentence practice';const title=document.createElement('strong');title.textContent=current()?.title||'Your lesson';context.append(label,title);top.replaceChildren(back,context);if(options)top.append(options);}
 const card=$('.review-card');if(!card)return;const actions=document.createElement('div');actions.className='sentence-review-actions';actions.setAttribute('role','group');actions.setAttribute('aria-label','Sentence practice controls');
 for(const id of ['review-audio','reset-pieces','skip-review','check-pieces','next-review','finish-review']){const button=$('#'+id);if(button){if(id==='finish-review')button.textContent='Back to lesson';actions.append(button);}}
 card.querySelectorAll('.row.wrap').forEach(row=>{if(!row.children.length)row.remove();});if(actions.children.length)card.append(actions);
}
