function transcriptOptionsDialog(l){
 modal('Transcript',`<p><strong>Current source:</strong> ${E(l.transcriptProvider||'Lesson text')}</p><p>Choose a new source to preview before replacing the text. Your current transcript will be kept in history; saved vocabulary is retained.</p><label>Transcript source<select id="lesson-transcript-source">${l.youtubeId?'<option value="publisher">YouTube publisher captions · if available</option><option value="automatic">YouTube automatic captions · if available</option>':''}${l.media||l.youtubeId?'<option value="openai">OpenAI · new audio transcription (API usage)</option>':''}${l.media||l.alignmentMedia?'<option value="local">Whisper · local audio transcription</option>':''}<option value="file">Upload a subtitle file</option></select></label><div class="row wrap"><button id="transcript-continue" class="primary">Continue</button><button id="transcript-history">Earlier versions</button>${l.youtubeId?'<button id="transcript-check-captions">Recheck subtitles</button>':''}</div><p id="transcript-choice-status" role="status"></p>`,()=>{
  bind('transcript-history',()=>transcriptHistoryDialog(l));
  bind('transcript-check-captions',()=>checkCaptionChoices($('#lesson-transcript-source'),'https://www.youtube.com/watch?v='+l.youtubeId,$('#transcript-choice-status'),true));
  if(l.youtubeId)checkCaptionChoices($('#lesson-transcript-source'),'https://www.youtube.com/watch?v='+l.youtubeId,$('#transcript-choice-status'));
  bind('transcript-continue',async()=>{const source=$('#lesson-transcript-source').value;if(source==='openai'){openAITranscriptDialog(l);return;}if(source==='file'){pickFile('.srt,.vtt,.ttml,.ass',async file=>{const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));const job=await api('/api/import',{name:file.name,data:btoa(raw)});const result=await waitJob(job.id);showOpenAITranscriptPreview(l,{...result,provider:'Subtitle file · '+file.name,captionSource:'file',alignmentVersion:result.cues?.length?1:0});});return;}
   const button=$('#transcript-continue');button.disabled=true;$('#transcript-choice-status').textContent=source==='local'?'Transcribing on this computer…':'Fetching '+(source==='publisher'?'publisher captions':'automatic captions')+'…';try{const job=source==='local'?await api('/api/transcribe',{media:l.media||l.alignmentMedia,model:s.settings.whisperModel||'base'}):await api('/api/import',{url:'https://www.youtube.com/watch?v='+l.youtubeId,transcriptSource:source});const result=await waitJob(job.id);showOpenAITranscriptPreview(l,result);}catch(e){const status=$('#transcript-choice-status');if(status)status.textContent=e.message;}finally{if(button.isConnected)button.disabled=false;}
  });
 });
}


async function checkCaptionChoices(select,url,status,refresh=false){
 if(!select||!status)return;
 const request=select.captionCheckRequest=(select.captionCheckRequest||0)+1;
 const previous=select.value;
 for(const option of select.options)if(['publisher','automatic'].includes(option.value)){option.disabled=true;option.textContent=(option.value==='publisher'?'Publisher':'Automatic')+' captions · checking…';}
 if(['publisher','automatic'].includes(select.value))select.value=[...select.options].find(o=>o.value==='file')?.value||[...select.options].find(o=>!o.disabled)?.value||'';
 const fallback=select.value;
 status.textContent='Checking available YouTube subtitles…';
 try{
  const result=await api('/api/youtube/captions',{url,refresh});if(!select.isConnected||request!==select.captionCheckRequest)return;
  for(const mode of ['publisher','automatic']){const option=[...select.options].find(o=>o.value===mode);if(!option)continue;const match=result.tracks.find(t=>t.source===mode&&t.finnish);option.disabled=!match;option.textContent=match?match.name+' · YouTube '+mode+' captions':(mode==='publisher'?'Publisher':'Automatic')+' captions · no '+learningLanguage().name+' track';}
  if(select.value===fallback&&[...select.options].some(o=>o.value===previous&&!o.disabled))select.value=previous;
  const describe=mode=>result.tracks.filter(t=>t.source===mode).map(t=>t.name+' ('+t.language+')').join(', ')||'none';
  status.textContent='Available subtitles — Publisher: '+describe('publisher')+'. Automatic: '+describe('automatic')+'. Tracks matching the study language can be used. Translated tracks are excluded.';
 }catch(error){if(!select.isConnected||request!==select.captionCheckRequest)return;status.textContent='Could not check subtitles: '+error.message+' Retry the check; availability has not been confirmed.';}
}
