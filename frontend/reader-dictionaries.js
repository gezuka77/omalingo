/* Saved Meaning disclosure and explicitly opened external dictionary resources. */
const readerMeaningDisclosure=new Map(),readerDictionaryResults=new Map(),readerContextResults=new Map(),readerExplanations=new Map();
let readerDictionaryPopup=null;
function dictionaryLookupForm(term){return s.settings.readerLookupForms?.[C.norm(term)]||term;}
function openReaderResource(resource,term,event){
 const url=OmaResources.buildURL(resource,dictionaryLookupForm(term));
 if(s.settings.readerDictionaryOpenMode==='tab')return; // The ordinary anchor opens the tab.
 event.preventDefault();
 try{
  if(readerDictionaryPopup&&!readerDictionaryPopup.closed){readerDictionaryPopup.location.href=url;readerDictionaryPopup.focus();return;}
 }catch{readerDictionaryPopup=null;}
 const popup=window.open('about:blank','OmaDictionaryWindow','popup=yes,width=960,height=600,resizable=yes,scrollbars=yes');
 if(!popup){toast('The browser blocked the popup. Right-click the dictionary link to open a new tab, or choose New tab in Manage.');return;}
 try{popup.opener=null;popup.location.replace(url);popup.focus();readerDictionaryPopup=popup;}
 catch{popup.close();toast('Use Open link in new tab for this dictionary.');}
}
function refreshReaderResourceChips(term,panel){
 const list=panel.querySelector('.reader-resource-chips');if(!list)return;
 const resources=OmaResources.preferred(s.settings),form=dictionaryLookupForm(term);
 list.replaceChildren();
 for(const resource of resources){const a=document.createElement('a');a.href=OmaResources.buildURL(resource,form);a.textContent=resource.name;a.target='_blank';a.rel='noopener noreferrer';a.dataset.readerResource=resource.id;a.title=resource.availability==='unverified'?'External resource · provider availability has not been verified':'Open '+resource.name;a.addEventListener('click',act(event=>openReaderResource(resource,term,event)));list.append(a);}
 if(!resources.length)list.innerHTML='<p class="muted">Choose your preferred dictionaries in Manage.</p>';
 const lookup=panel.querySelector('.reader-lookup-form');if(lookup)lookup.textContent=C.norm(form)!==C.norm(term)?'Looking up: '+form:'';
}
function addReaderSuggestion(term,text,context,source){
 const key=C.norm(term),w=s.words[key],meaning=$('#term-meaning'),note=$('#term-note'),tags=$('#term-tags'),status=$('#term-status');
 const texts=[...new Set([...(meaning?.value||w?.meaning||'').split('\n').map(t=>t.trim()).filter(Boolean),text])];
 const previous=new Map((w?.meanings||[]).map(m=>[m.text,m]));
 C.term(s,key,{status:Number(status?.value||w?.status||1),autoKnownLessonId:null,meanings:texts.map(t=>previous.get(t)||{text:t,language:'en',source:t===text?source:'personal'}),note:note?.value||w?.note||'',tags:tags?taglist(tags.value):w?.tags||[],context},view==='library'&&current()?{lessonId:lid,sentence:context}:undefined);
 readerMeaningDisclosure.set(key,true);save();refreshSentenceVocabulary();toast('Meaning saved.');termPanel(term,context);
}
function renderReaderSuggestions(term,context,panel,result){
 const list=panel.querySelector('.reader-suggestion-list');if(!list)return;list.replaceChildren();
 const heading=panel.querySelector('.reader-popular-heading h3'),help=panel.querySelector('.reader-popular-heading small');if(heading)heading.textContent=result?.best?'AI meanings for this sentence':'Dictionary meanings';if(help)help.textContent=result?.best?'AI suggestions, with the best fit for this sentence first. Use ＋ to save another meaning.':'Definitions from the dictionary. These are general senses, not ranked for this sentence.';
 const definitions=result?.definitions||[];
 for(const text of definitions.slice(0,12)){const row=document.createElement('div');row.className='reader-meaning-suggestion';const content=document.createElement('span');content.textContent=text;if(text===result?.best){row.classList.add('context-best');const badge=document.createElement('small');badge.textContent='✦ Best in this sentence';content.append(document.createElement('br'),badge);}const add=document.createElement('button');add.textContent='＋';add.setAttribute('aria-label','Save meaning: '+text);add.onclick=act(()=>addReaderSuggestion(term,text,context,result?.source||'Wiktionary'));row.append(content,add);list.append(row);}
 if(!definitions.length)list.innerHTML='<p class="muted">No suggestions found for this spelling. You can try a base form in Manage or enter your own meaning.</p>';
 const attribution=panel.querySelector('.reader-dictionary-attribution');if(attribution){attribution.replaceChildren();if(result?.url){const a=document.createElement('a');a.href=safeURL(result.url);a.target='_blank';a.rel='noopener noreferrer';a.textContent=result.source||'Wiktionary';attribution.append(a);}else attribution.textContent=result?.source||'';}
}
function installReaderDictionaries(term,context,panel){
 const meaning=panel.querySelector('#term-meaning');if(!meaning)return;
 const key=C.norm(term),saved=s.words[key],hasSaved=!!(saved?.meaning||saved?.meanings?.some(m=>m.text));
 const label=meaning.parentElement;label.classList.add('reader-meaning-label');
 for(const node of [...label.childNodes])if(node.nodeType===3)node.remove();
 meaning.setAttribute('aria-label','Saved Meaning');meaning.placeholder='No saved meaning yet. Enter a meaning or choose a dictionary suggestion below.';
 const header=document.createElement('div');header.className='reader-saved-meaning-header';header.innerHTML='<span>Saved Meaning</span><button id="saved-meaning-toggle" aria-controls="reader-meaning-resources" type="button"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';label.before(header);
 const block=document.createElement('section');block.id='reader-meaning-resources';block.innerHTML=`<div class="reader-dictionary-heading"><h3>Dictionaries</h3><button id="reader-dictionary-manage" type="button">Manage ›</button></div><div class="reader-resource-chips"></div><small class="reader-lookup-form"></small><div class="reader-popular-heading"><h3>Meanings</h3><small>Choose dictionary definitions or AI suggestions for this sentence.</small></div><div class="reader-suggestion-list"><p class="muted">Load dictionary suggestions, or use a resource above.</p></div><p class="reader-dictionary-attribution"></p><button id="reader-load-suggestions" type="button">Dictionary meanings</button>`;label.after(block);
 const originalLookup=panel.querySelector('#dictionary');if(originalLookup)originalLookup.hidden=true;
 const originalDefinitions=panel.querySelector('#definitions');if(originalDefinitions)originalDefinitions.hidden=true;
 const oldExplain=panel.querySelector('#term-context-meaning'),explain=oldExplain?.cloneNode(true);if(oldExplain)oldExplain.replaceWith(explain);
 if(explain&&originalDefinitions){
  explain.textContent='Explain word & grammar';explain.setAttribute('aria-controls','definitions');
  originalDefinitions.className='reader-context-explanation';originalDefinitions.setAttribute('role','status');
  explain.onclick=act(async()=>{
   const cacheKey=activeStudyLanguage+'\n'+key+'\n'+context;
   const show=result=>{if(!panel.isConnected||panel.querySelector('#definitions')!==originalDefinitions||C.norm(chosen)!==key)return;originalDefinitions.hidden=false;originalDefinitions.innerHTML='<h3>Meaning in this sentence</h3><blockquote>'+E(context||C.selectionContext(current()?.text||'',key)||key)+'</blockquote><div>'+aiText(result.text)+'</div><small>'+E(result.provider)+' · AI explanation</small>';originalDefinitions.scrollIntoView({block:'nearest',behavior:'smooth'});};
   const cached=readerExplanations.get(cacheKey);if(cached){show(cached);return;}
   explain.disabled=true;originalDefinitions.hidden=false;originalDefinitions.textContent='Explaining the meaning and grammar in this sentence…';originalDefinitions.scrollIntoView({block:'nearest',behavior:'smooth'});
   try{
    const config=await api('/api/openai/config'),useOpenAI=s.settings.aiProvider==='openai'||(s.settings.aiProvider!=='ollama'&&config.enabled&&config.keyConfigured);
    const sentence=context||C.selectionContext(current()?.text||'',key)||key;
    const result=useOpenAI?await api('/api/openai/generate',{text:key,context:sentence,mode:'meaning',model:config.textModel}):await api('/api/assist',{text:'Explain the '+learningLanguage().name+' word or phrase "'+key+'" in this sentence: '+sentence,mode:'explain',model:s.settings.ollamaModel});
    readerExplanations.set(cacheKey,result);show(result);
   }catch(error){if(panel.isConnected&&panel.querySelector('#definitions')===originalDefinitions)originalDefinitions.textContent='Could not explain this word: '+error.message;}
   finally{if(explain.isConnected)explain.disabled=false;}
  });
 }

 const toggle=header.querySelector('button');const setOpen=open=>{block.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',(open?'Hide':'Show')+' Dictionaries and Popular Meanings');toggle.title=(open?'Hide':'Show')+' Dictionaries and Popular Meanings';header.classList.toggle('is-expanded',open);};
 setOpen(readerMeaningDisclosure.has(key)?readerMeaningDisclosure.get(key):!hasSaved);
 toggle.onclick=()=>{const open=block.hidden;readerMeaningDisclosure.set(key,open);setOpen(open);};
 refreshReaderResourceChips(term,panel);panel.querySelector('#reader-dictionary-manage').onclick=()=>manageReaderDictionaries(term,panel);
 const aiStatus=document.createElement('p');aiStatus.className='muted reader-auto-meaning-status';aiStatus.setAttribute('role','status');block.querySelector('.reader-suggestion-list').before(aiStatus);
 const aiButton=document.createElement('button');aiButton.type='button';aiButton.id='reader-ai-meanings';aiButton.textContent='AI meanings for this sentence';block.append(aiButton);
 let suggestionRequest=0;
 const loadContextMeaning=async()=>{
  const request=++suggestionRequest;
  aiButton.disabled=true;aiStatus.textContent='Finding and saving the best meaning for this sentence…';if(!meaning.value.trim())meaning.placeholder='Finding the best contextual meaning…';
  try{const result=await api('/api/openai/meaning',{term:key,context:context||C.selectionContext(current()?.text||'',key)||key});
   if(!panel.isConnected||panel.querySelector('#reader-meaning-resources')!==block||C.norm(chosen)!==key||request!==suggestionRequest)return;
   readerContextResults.set(key+'\n'+context,result);renderReaderSuggestions(term,context,panel,result);
   const currentWord=s.words[key];const alreadySaved=!!(currentWord?.meaning?.trim()||currentWord?.meanings?.some(m=>m.text?.trim()));
   if(!alreadySaved&&!meaning.value.trim()&&result.best){
    const existing=currentWord||{};C.term(s,key,{status:existing.status??1,autoKnownLessonId:null,meanings:[{text:result.best,language:'en',source:result.source,automatic:true,context}],note:existing.note||'',tags:existing.tags||[],context},view==='library'&&current()?{lessonId:lid,sentence:context}:undefined);
    meaning.value=result.best;save();refreshSentenceVocabulary();aiStatus.textContent='Best contextual meaning saved automatically. Choose ＋ to add another.';
   }else aiStatus.textContent='Your saved meaning is kept. Choose ＋ to add another.';
  }catch(e){if(panel.querySelector('#reader-meaning-resources')===block&&request===suggestionRequest){if(!meaning.value.trim())meaning.placeholder='Add a meaning, or retry the lookup below';aiStatus.textContent=/failed to fetch|network|load failed/i.test(e.message)?'O/L’s local service could not be reached. Reconnect O/L, then choose AI meanings for this sentence to retry. Your saved meanings are unchanged.':e.message+' You can also use the dictionaries above.';}}
  finally{if(aiButton.isConnected)aiButton.disabled=false;}
 };
 aiButton.onclick=act(loadContextMeaning);
 const contextCached=readerContextResults.get(key+'\n'+context);if(contextCached)renderReaderSuggestions(term,context,panel,contextCached);else loadContextMeaning();
 const cached=readerDictionaryResults.get(C.norm(dictionaryLookupForm(term)));if(!contextCached&&cached)renderReaderSuggestions(term,context,panel,cached);
 else if(!contextCached&&dictionary[key])renderReaderSuggestions(term,context,panel,{definitions:[dictionary[key]],source:'O/L sample vocabulary'});
 panel.querySelector('#reader-load-suggestions').onclick=act(async()=>{
  const request=++suggestionRequest;const button=panel.querySelector('#reader-load-suggestions'),lookup=dictionaryLookupForm(term);button.disabled=true;button.textContent='Looking up…';
  try{const result=await api('/api/dictionary',{term:lookup});readerDictionaryResults.set(C.norm(lookup),result);if(panel.isConnected&&C.norm(chosen)===key&&request===suggestionRequest){renderReaderSuggestions(term,context,panel,result);aiStatus.textContent='Dictionary definitions loaded. Your saved meaning is unchanged.';}}
  finally{if(button.isConnected){button.disabled=false;button.textContent='Dictionary meanings';}}
 });
}
function manageReaderDictionaries(term,panel){
 const dialog=document.createElement('dialog');dialog.id='reader-dictionary-manager';dialog.className='reader-dictionary-manager';document.body.append(dialog);
 let language='en',dragId=null,lookupDraft=dictionaryLookupForm(term),openMode=s.settings.readerDictionaryOpenMode||'popup';
 const commitIds=ids=>{s.settings.readerDictionaryIds=ids;save();refreshReaderResourceChips(term,panel);};
 const reorder=(id,offset)=>{const ids=OmaResources.preferred(s.settings).map(r=>r.id),from=ids.indexOf(id),to=from+offset;if(from<0||to<0||to>=ids.length)return;[ids[from],ids[to]]=[ids[to],ids[from]];commitIds(ids);draw();};
 const draw=()=>{
  const preferred=OmaResources.preferred(s.settings),ids=preferred.map(r=>r.id),available=OmaResources.getResources(s.settings).filter(r=>!ids.includes(r.id)&&r.language===language);
  dialog.innerHTML=`<div class="dictionary-manager-head"><h2>▤ Dictionaries</h2><button id="dictionary-manager-done" class="primary">Done</button></div><div class="dictionary-manager-body"><h3>Preferred</h3><div id="dictionary-preferred-list">${preferred.map((r,i)=>`<div class="dictionary-resource-row preferred" draggable="true" data-dictionary-id="${E(r.id)}"><span class="dictionary-drag-grip" aria-hidden="true">⠿</span><span class="dictionary-resource-name">${E(r.name)}</span><span class="dictionary-language">${r.language.toUpperCase()}</span><div class="dictionary-resource-actions"><button data-dictionary-up="${E(r.id)}" ${i===0?'disabled':''} aria-label="Move ${E(r.name)} up">↑</button><button data-dictionary-down="${E(r.id)}" ${i===preferred.length-1?'disabled':''} aria-label="Move ${E(r.name)} down">↓</button><button data-dictionary-remove="${E(r.id)}" aria-label="Remove ${E(r.name)}">×</button></div></div>`).join('')||'<p class="muted">Add a resource from the list below.</p>'}</div><div class="dictionary-all-heading"><h3>All Resources</h3><select id="dictionary-resource-language" aria-label="Dictionary language"><option value="en" ${language==='en'?'selected':''}>English</option><option value="fi" ${language==='fi'?'selected':''}>Finnish</option></select></div><div>${available.map(r=>`<div class="dictionary-resource-row"><span class="dictionary-resource-name">${E(r.name)}${r.availability==='unverified'?'<small>Provider availability not verified</small>':''}</span><button data-dictionary-add="${E(r.id)}" aria-label="Add ${E(r.name)}">＋</button></div>`).join('')||'<p class="muted">All resources for this language are already preferred.</p>'}</div><details class="dictionary-lookup-options"><summary>Lookup options</summary><label>Open resources in<select id="dictionary-open-mode"><option value="popup" ${openMode==='popup'?'selected':''}>Popup window</option><option value="tab" ${openMode==='tab'?'selected':''}>New tab</option></select></label><label>Lookup word or phrase<input id="dictionary-lookup-text" value="${E(lookupDraft)}"></label><p class="muted">Use a base form for conjugation or declension if needed. This does not rename the selected word or change its learning level.</p><button id="dictionary-reset-form">Use selected text</button></details></div>`;
  dialog.querySelector('#dictionary-manager-done').onclick=()=>{lookupDraft=dialog.querySelector('#dictionary-lookup-text').value.trim();openMode=dialog.querySelector('#dictionary-open-mode').value;if(!lookupDraft||lookupDraft.length>200){toast('Enter a lookup word or short phrase.');return;}s.settings.readerDictionaryOpenMode=openMode;s.settings.readerLookupForms=s.settings.readerLookupForms||{};if(C.norm(lookupDraft)===C.norm(term))delete s.settings.readerLookupForms[C.norm(term)];else s.settings.readerLookupForms[C.norm(term)]=lookupDraft;save();refreshReaderResourceChips(term,panel);dialog.close();};
  const captureDraft=()=>{lookupDraft=dialog.querySelector('#dictionary-lookup-text').value;openMode=dialog.querySelector('#dictionary-open-mode').value;};
  dialog.querySelector('#dictionary-resource-language').onchange=event=>{captureDraft();language=event.target.value;draw();};
  dialog.querySelector('#dictionary-reset-form').onclick=()=>{lookupDraft=term;dialog.querySelector('#dictionary-lookup-text').value=term;};
  dialog.querySelectorAll('[data-dictionary-remove]').forEach(b=>b.onclick=()=>{captureDraft();commitIds(ids.filter(id=>id!==b.dataset.dictionaryRemove));draw();});
  dialog.querySelectorAll('[data-dictionary-add]').forEach(b=>b.onclick=()=>{captureDraft();commitIds([...ids,b.dataset.dictionaryAdd]);draw();});
  dialog.querySelectorAll('[data-dictionary-up]').forEach(b=>b.onclick=()=>{captureDraft();reorder(b.dataset.dictionaryUp,-1);});
  dialog.querySelectorAll('[data-dictionary-down]').forEach(b=>b.onclick=()=>{captureDraft();reorder(b.dataset.dictionaryDown,1);});
  dialog.querySelectorAll('[data-dictionary-id]').forEach(row=>{row.ondragstart=event=>{dragId=row.dataset.dictionaryId;event.dataTransfer.setData('text/plain',dragId);};row.ondragover=event=>event.preventDefault();row.ondrop=event=>{event.preventDefault();captureDraft();const next=[...ids],from=next.indexOf(dragId),to=next.indexOf(row.dataset.dictionaryId);if(from<0||to<0)return;next.splice(from,1);next.splice(to,0,dragId);commitIds(next);draw();};});
 };
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});draw();dialog.showModal();
}
