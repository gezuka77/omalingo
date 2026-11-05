/* Translation follows the reader scope; whole lessons never stand in for sentences. */
const readerTranslationRequests=new Map();
function readerTranslationTarget(lesson){
 const sentence=!!s.settings.sentenceMode;
 const text=sentence?(C.segments(lesson.text)[Number(s.positions[lesson.id]||0)]?.text||''):lesson.text;
 const preference=lesson.translationPreference||s.settings;
 const provider=['openai','ollama'].includes(preference.translationProvider)?preference.translationProvider:'argos';
 const model=provider==='openai'?(preference.translationModel||s.settings.openaiModel||''):provider==='ollama'?(preference.ollamaModel||''):'';
 return {text,sentence,provider,model,language:activeStudyLanguage};
}
function readerTranslationKey(target){return JSON.stringify([target.language,target.sentence,target.text,target.provider,target.model]);}
function cachedReaderTranslation(lesson,target){
 const entry=(lesson.readerTranslations||[]).find(entry=>entry.key===readerTranslationKey(target));
 if(entry)return entry;
 // Existing imported/user translations remain available in page view only.
 if(!target.sentence&&lesson.translation&&((!lesson.translationRequest&&target.provider==='argos')||lesson.translationRequest===readerTranslationKey(target)))return {text:lesson.translation,provider:lesson.translationSource||'Saved lesson translation'};
 return null;
}
async function requestReaderTranslation(lesson,force=false,previewTarget=null){
 if(!lesson)return;
 const target=previewTarget||readerTranslationTarget(lesson),key=readerTranslationKey(target),state=s,user=authUser.id;
 if(!target.text.trim())return;
 let result=!force&&cachedReaderTranslation(lesson,target);
 if(!result){
  const requestKey=JSON.stringify([user,lesson.id,key]);
  let pending=readerTranslationRequests.get(requestKey);
  if(!pending){pending=api('/api/translate',{text:target.text,provider:target.provider,model:target.model});readerTranslationRequests.set(requestKey,pending);pending.finally(()=>readerTranslationRequests.delete(requestKey)).catch(()=>{});}
  result=await pending;
  if(s!==state||authUser.id!==user||activeStudyLanguage!==target.language)return;
  if(typeof result.text!=='string'||!result.text.trim())throw Error('No translation was returned. Try another model.');
  lesson.readerTranslations=[{key,text:result.text,provider:result.provider},...(lesson.readerTranslations||[]).filter(entry=>entry.key!==key)].slice(0,250);
  if(!target.sentence&&!previewTarget){lesson.translation=result.text;lesson.translationSource=result.provider;lesson.translationRequest=key;}
  save();
 }
 if(!previewTarget&&current()?.id===lesson.id&&readerTranslationKey(readerTranslationTarget(lesson))===key){
  const body=$('#translation-copy'),source=$('#translation-source');
  if(body)body.textContent=result.text;if(source)source.textContent=result.provider||'';
 }
 return result;
}
function setupReaderTranslation(lesson){
 const panel=$('#translation'),page=$('#reader-text');if(!panel||!page)return;
 const target=readerTranslationTarget(lesson),cached=cachedReaderTranslation(lesson,target);
 panel.innerHTML=`<p id="translation-copy" role="status">${E(cached?.text||'No '+(target.sentence?'sentence':'lesson')+' translation yet.')}</p><small id="translation-source">${E(cached?.provider||'')}</small><div class="row wrap"><button id="translate">${cached?'Translate again':'Translate '+(target.sentence?'sentence':'lesson')}</button><button id="reader-translation-options">Compare translations…</button></div>`;
 const tr=document.createElement('button');tr.className='show-translation';page.after(tr);
 const update=()=>{tr.setAttribute('aria-expanded',String(!panel.hidden));tr.textContent=panel.hidden?'Show translation':'Hide translation';};update();
 const run=async(force=false)=>{const button=$('#translate'),copy=$('#translation-copy');button.disabled=true;if(!cached||force)copy.textContent=target.provider==='argos'?'Translating locally… First use may download a free language model.':'Translating…';try{await requestReaderTranslation(lesson,force);}catch(e){if(copy.isConnected)copy.textContent=e.message;}finally{if(button.isConnected)button.disabled=false;}};
 tr.onclick=()=>{panel.hidden=!panel.hidden;s.settings.autoTranslation=!panel.hidden;save();update();if(!panel.hidden)run();};
 bind('translate',()=>run(true));bind('reader-translation-options',translationPreferences);
 if(!panel.hidden)run();
}
function translationFields(preference){
 return `<div class="translation-choice"><label>Translator<select id="reader-translation-provider"><option value="argos" ${preference.translationProvider==='argos'?'selected':''}>Argos · local, free</option><option value="ollama" ${preference.translationProvider==='ollama'?'selected':''}>Ollama · local AI model</option><option value="openai" ${preference.translationProvider==='openai'?'selected':''}>OpenAI · API usage charges</option></select></label><div id="translation-openai-fields"><label>OpenAI model<input id="reader-translation-model" list="translation-models" value="${E(preference.translationModel||s.settings.openaiModel||'')}" placeholder="Use your connected OpenAI text model"></label><datalist id="translation-models"></datalist><button id="translation-list-models">List available text models</button><small>Uses your saved API key. Text is sent to OpenAI and API usage charges apply.</small></div><div id="translation-ollama-fields"><label>Installed Ollama model<input id="reader-translation-ollama" value="${E(preference.ollamaModel||'')}"></label></div></div>`;
}
function translationChoice(){return {translationProvider:$('#reader-translation-provider').value,translationModel:$('#reader-translation-model').value.trim(),ollamaModel:$('#reader-translation-ollama').value.trim()};}
function wireTranslationFields(){
 const update=()=>{const provider=$('#reader-translation-provider').value;$('#translation-openai-fields').hidden=provider!=='openai';$('#translation-ollama-fields').hidden=provider!=='ollama';};update();bind('reader-translation-provider',update,'change');
 bind('translation-list-models',async()=>{const status=$('#translation-preference-status');try{const result=await api('/api/openai/models');if(!status.isConnected)return;const models=(result.models||[]).filter(m=>!/(transcrib|whisper|tts|realtime|embedding|image|moderation|audio)/i.test(m.id));$('#translation-models').innerHTML=models.map(m=>`<option value="${E(m.id)}">`).join('');status.textContent='Choose a model from the model field.';}catch(e){if(status.isConnected)status.textContent=e.message;}});
}
function translationSettings(){
 const dialog=$('#dialog');if(dialog?.querySelector('.translation-comparison')){dialog.close();dialog.replaceChildren();}
 settingsShell();const host=$('#settings-content');
 host.innerHTML=`<section class="settings-card"><h2>Default translation</h2><p>Use this translator for new lessons. You can compare samples and choose another translator for an individual lesson from its Translation menu.</p>${translationFields(s.settings)}<p id="translation-preference-status" role="status"></p><div class="row wrap"><button id="save-translation-default" class="primary">Save default</button><button id="translation-connections">Manage API connection</button></div></section>`;
 wireTranslationFields();
 bind('save-translation-default',async()=>{const button=$('#save-translation-default'),status=$('#translation-preference-status'),choice=translationChoice(),state=s;button.disabled=true;try{if(choice.translationProvider==='openai')await api('/api/openai/config',{enabled:true});if(!button.isConnected||s!==state)return;Object.assign(s.settings,choice);save();status.textContent='Default translator saved.';}catch(e){if(status.isConnected)status.textContent=e.message;}finally{if(button.isConnected)button.disabled=false;}});
 bind('translation-connections',()=>openSettings('connections'));
}
function translationPreferences(){
 const lesson=current();if(!lesson)return;
 const state=s,language=activeStudyLanguage,user=authUser.id;
 const sample=C.segments(lesson.text)[Number(s.positions[lesson.id]||0)]?.text||lesson.text;
 const text=sample.slice(0,1500),preference=lesson.translationPreference||s.settings;
 modal('Compare translations',`<section class="translation-comparison"><p>Try this sentence with different translators. Previews leave your default unchanged.</p><blockquote class="translation-sample-source">${E(text)}${sample.length>text.length?'…':''}</blockquote>${translationFields(preference)}<button id="preview-translation">Preview sentence</button><p id="translation-preference-status" role="status"></p><div id="translation-samples" class="translation-samples" aria-live="polite"></div><div class="row wrap"><button id="save-translation-preference" class="primary">Use for this lesson</button><button id="translation-use-default">Use default</button><button id="translation-default-settings">Default translation settings</button></div><small>OpenAI previews incur API usage charges. A local model may need a download on first use.</small></section>`,()=>{
  wireTranslationFields();
  const stillCurrent=()=>s===state&&authUser.id===user&&activeStudyLanguage===language;
  bind('preview-translation',async()=>{const choice=translationChoice(),button=$('#preview-translation'),status=$('#translation-preference-status'),samples=$('#translation-samples');button.disabled=true;status.textContent='Preparing sample…';try{if(choice.translationProvider==='openai')await api('/api/openai/config',{enabled:true});if(!stillCurrent()||!button.isConnected)return;const target={text,sentence:true,provider:choice.translationProvider,model:choice.translationProvider==='openai'?(choice.translationModel||s.settings.openaiModel||''):choice.translationProvider==='ollama'?choice.ollamaModel:'',language};const result=await requestReaderTranslation(lesson,false,target);if(!result||!stillCurrent()||!samples.isConnected)return;const card=document.createElement('article');card.className='translation-sample-card';const title=document.createElement('strong'),copy=document.createElement('p'),use=document.createElement('button');title.textContent=result.provider||choice.translationProvider;copy.textContent=result.text;use.textContent='Use this translator';use.onclick=()=>applyChoice(choice);card.append(title,copy,use);samples.prepend(card);status.textContent='Sample ready. Try another translator to compare.';}catch(e){if(status.isConnected)status.textContent=e.message;}finally{if(button.isConnected)button.disabled=false;}});
  const applyChoice=async(choice)=>{const button=$('#save-translation-preference'),status=$('#translation-preference-status');button.disabled=true;try{if(choice?.translationProvider==='openai')await api('/api/openai/config',{enabled:true});if(!stillCurrent()||!button.isConnected)return;if(choice)lesson.translationPreference=choice;else delete lesson.translationPreference;save();$('#dialog').close();if(view==='library'&&current()?.id===lesson.id)reader(lesson);}catch(e){if(status.isConnected)status.textContent=e.message;}finally{if(button.isConnected)button.disabled=false;}};
  bind('save-translation-preference',()=>applyChoice(translationChoice()));bind('translation-use-default',()=>applyChoice(null));
  bind('translation-default-settings',()=>{$('#dialog').close();openSettings('translation');});
 });
}
