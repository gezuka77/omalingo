function transcriptHistoryDialog(l){
 const entries=l.transcriptHistory||[];
 modal('Transcript history',entries.length?entries.map((v,i)=>`<section class="panel"><p>${E(new Date(v.savedAt).toLocaleString())} · ${E(v.provider)}</p><details><summary>View text</summary><p style="white-space:pre-wrap">${E(v.text)}</p></details><button data-restore-transcript="${i}">Restore this version</button></section>`).join(''):'<p>No earlier transcripts saved.</p>',()=>$$('[data-restore-transcript]').forEach(b=>b.onclick=act(()=>{
  const old=entries[Number(b.dataset.restoreTranscript)];entries.push({text:l.text,cues:l.cues||[],provider:l.transcriptProvider||'original',alignmentVersion:l.alignmentVersion||0,savedAt:Date.now()});l.text=old.text;l.cues=old.cues||[];l.transcriptProvider=old.provider;l.alignmentVersion=old.alignmentVersion||0;s.positions[l.id]=0;save();$('#dialog').close();reader(l);
 })));
}
function openAITranscriptDialog(l){
 if(!l.media&&!l.youtubeId){toast('Attach the original audio first using the lesson menu.');return;}
 modal('Transcribe with OpenAI',`<p>Transcribe the original Finnish audio with your saved API key. Audio is sent to OpenAI and API usage is charged to your account. You can review the result before changing this lesson.</p><p class="muted">${l.media?'Uses attached audio.':'Tries to retrieve the original YouTube audio. If YouTube blocks access, attach an audio file instead.'} The transcript is automatically aligned with the audio for synchronized highlighting; your current text and timings are kept in transcript history.</p><label>Optional context in Finnish (names or topic)<textarea id="transcription-context" maxlength="1000" rows="2"></textarea></label>${button('start-openai-transcription','Transcribe audio','primary')}<p id="transcription-status" role="status"></p>`,()=>bind('start-openai-transcription',async()=>{
  const btn=$('#start-openai-transcription');btn.disabled=true;
  try{const job=await api('/api/transcribe/openai',{media:l.media||undefined,youtubeId:l.youtubeId||undefined,context:$('#transcription-context').value});$('#transcription-status').textContent='Processing audio. You may close this window; the result remains available in Sources → Recent jobs.';
   const result=await waitJob(job.id);showOpenAITranscriptPreview(l,result);
  }catch(e){if(btn.isConnected)btn.disabled=false;throw e;}
 }));
}
function showOpenAITranscriptPreview(l,result){
 modal('Transcript preview',`<p><strong>Source:</strong> ${E(result.provider||'OpenAI')}</p><p>Review before applying. The current text and timings will be preserved. ${result.captionSource?'Caption timing is included; words highlight together within each caption.':'Word and sentence timings are included.'} Editing the text runs alignment again.</p><details><summary>Current transcript</summary><p style="white-space:pre-wrap">${E(l.text)}</p></details><textarea id="openai-transcript-preview" rows="14">${E(result.text)}</textarea>${button('apply-openai-transcript','Use this transcript','primary')}`,()=>bind('apply-openai-transcript',async()=>{
  const text=$('#openai-transcript-preview').value.trim();if(!text)throw Error('The transcript cannot be empty.');
  l.transcriptHistory=Array.isArray(l.transcriptHistory)?l.transcriptHistory:[];l.transcriptHistory.push({text:l.text,cues:l.cues||[],provider:l.transcriptProvider||'original',alignmentVersion:l.alignmentVersion||0,savedAt:Date.now()});
  const aligned=await ensureTranscriptTiming({...l,...result},text);l.text=text;l.cues=aligned.cues;l.alignmentVersion=aligned.alignmentVersion||1;l.alignmentMedia=aligned.alignmentMedia||l.alignmentMedia;l.transcriptProvider=result.provider;l.captionSource=result.captionSource;l.automaticCaptions=result.automaticCaptions;l.transcribedAt=Date.now();s.positions[l.id]=0;save();$('#dialog').close();if(current()?.id===l.id)reader(l);toast('Transcript updated. Original text and timings saved in transcript history.');
 }));
}

async function ensureTranscriptTiming(result,text){
 if(text===result.text&&result.cues?.length)return result;
 toast('Aligning the final text with the original audio…');const job=await api('/api/align',{text,media:result.media||result.alignmentMedia||undefined,youtubeId:result.youtubeId||undefined});return waitJob(job.id);
}

const lessonAlignmentJobs=new Map();
async function ensureLessonAlignment(l){
 if(l.alignmentVersion===1)return;
 if(lessonAlignmentJobs.has(l.id))return lessonAlignmentJobs.get(l.id);
 const task=(async()=>{const original=l.text;const result=await ensureTranscriptTiming({...l,cues:[]},original);if(l.text!==original)throw Error('Lesson text changed during alignment. Play again to align the current text.');l.cues=result.cues;l.alignmentVersion=1;l.alignmentProvider=result.alignmentProvider;l.alignmentMedia=result.alignmentMedia||l.alignmentMedia;save();toast('Audio and transcript synchronized.');})();
 lessonAlignmentJobs.set(l.id,task);try{return await task;}finally{lessonAlignmentJobs.delete(l.id);}
}
