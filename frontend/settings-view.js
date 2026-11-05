let settingsTab='reader';
function openSettings(tab='reader'){settingsTab=tab;parityNavigate('settings');}
function settingsSections(){
 return [['reader','Reader'],['translation','Translation'],['languages','Languages'],['connections','AI & Connections'],['anki','Anki'],['backup','Backup & Restore'],['account',authUser?.role==='admin'?'Account & Users':'Account']];
}
const settingsTabId=key=>'settings-'+(key==='connections'?'ai':key)+'-tab';
function settingsShell(){
 $('#voice-preview')?.pause();
 const sections=settingsSections();
 $('#main').innerHTML=`<section class="settings-page"><h1>Settings <small class="settings-version" style="font-size:14px;font-weight:400;color:var(--muted);white-space:nowrap">v${E(OMA_RELEASE_VERSION)}</small></h1><div class="settings-page-tabs" role="tablist" aria-label="Settings sections">${sections.map(([key,label])=>`<button id="${settingsTabId(key)}" role="tab" aria-selected="${settingsTab===key}" aria-controls="settings-content" class="${settingsTab===key?'active':''}">${label}</button>`).join('')}</div><section id="settings-content" role="tabpanel" aria-labelledby="${settingsTabId(settingsTab)}"></section></section>`;
 for(const [tab] of sections)bind(settingsTabId(tab),()=>{settingsTab=tab;settings();});
}
function settings(){
 if(settingsTab==='translation'){translationSettings();return;}
 if(settingsTab==='languages'){languageSettings();return;}
 if(settingsTab==='account'){accountSettings();return;}
 if(settingsTab==='backup'){
  legacyBackup();$('#main>p.eyebrow')?.remove();$('#main>h1')?.remove();const content=[...$('#main').childNodes];settingsShell();$('#settings-content').append(...content);return;
 }
 settingsShell();
 if(settingsTab==='connections'){aiConnectionSettings({embedded:true});return;}
 if(settingsTab==='anki'){ankiSettings();return;}
 const set=s.settings;
 const check=(key,title,description='')=>`<label class="settings-toggle"><span>${title}${description?'<small>'+description+'</small>':''}</span><input id="set-${key}" type="checkbox" ${set[key]?'checked':''}></label>`;
 $('#settings-content').innerHTML=`<section class="settings-card"><h2>Reading appearance</h2><p>Choose how lessons look in the reader.</p><div class="settings-field-grid"><label>Font<select id="set-font">${['Arial','Georgia','Verdana'].map(v=>`<option ${set.font===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Font size · px<input id="set-fontSize" type="number" min="14" max="48" value="${set.fontSize}"></label><label>Line spacing<input id="set-lineHeight" type="number" min="1.2" max="3" step=".1" value="${set.lineHeight}"></label><label>Reading width · px<input id="set-pageWidth" type="number" min="320" max="1400" step="20" value="${set.pageWidth}"></label></div></section><section class="settings-card"><h2>Words & study</h2>${check('autoSave','Save selected words automatically')}${check('autoPronounce','Pronounce selected words automatically')}${check('showVocabulary','Show O/L Words below each sentence')}${check('autoKnown','Mark remaining new words as known on completion','Applies when you complete a lesson.')}</section><section class="settings-card"><h2>Playback & translation</h2>${check('autoSentence','Speak when moving to the next sentence')}${check('autoTranslation','Show lesson translations automatically')}${check('preferSourceVideo','Use original YouTube audio when available')}<p class="settings-help">Choose the generated voice and translation tools under Translation. Playback speed is saved from the player.</p></section><section class="settings-card"><h2>Activity preferences</h2><label>Time zone<input id="set-timezone" value="${E(set.timezone)}"></label></section><p id="settings-feedback" role="status"></p><div class="settings-save-row"><button id="save-settings" class="primary">Save settings</button></div>`;
 bind('save-settings',()=>{try{const values={};for(const [key,min,max]of [['fontSize',14,48],['lineHeight',1.2,3],['pageWidth',320,1400]]){const value=Number($('#set-'+key).value);if(!Number.isFinite(value)||value<min||value>max)throw Error('Enter '+key.replace(/([A-Z])/g,' $1').toLowerCase()+' between '+min+' and '+max+'.');values[key]=value;}const timezone=$('#set-timezone').value.trim();new Intl.DateTimeFormat('en',{timeZone:timezone}).format();Object.assign(set,values,{font:$('#set-font').value,timezone});for(const key of ['autoSave','autoPronounce','showVocabulary','autoKnown','autoSentence','autoTranslation','preferSourceVideo'])set[key]=$('#set-'+key).checked;save();$('#settings-feedback').textContent='Settings saved.';}catch(e){$('#settings-feedback').textContent=e instanceof RangeError?'Enter a valid time zone, such as Europe/Helsinki.':e.message;}});
}
function backup(){settingsTab='backup';view='settings';settings();}
function settingsLocalTools(host){
 const set=s.settings,details=document.createElement('details');details.className='settings-card settings-offline';details.innerHTML=`<summary>Offline tools <span>Optional</span></summary><p>Local alternatives for translation and manually selected transcription. Imported recordings use OpenAI transcription by default.</p><p>Choose your default translator in Settings → Translation.</p><label>Ollama model<input id="ollama-model" value="${E(set.ollamaModel||'')}" placeholder="Installed text model name"></label><div class="row wrap"><button id="list-models">List installed models</button><button id="install-argos">Download ${E(learningLanguage().name)} translation model</button></div><p id="model-status" role="status"></p><label>Local Whisper model<select id="whisper-model">${['tiny','base','small'].map(v=>`<option ${set.whisperModel===v?'selected':''}>${v}</option>`).join('')}</select></label><small>Local models run on this computer. Larger models take longer.</small>`;host.querySelector('.connections-footer').before(details);
 bind('list-models',async()=>{const result=await api('/api/ollama-models');$('#model-status').textContent=result.error||result.models.map(m=>m.name).join(', ')||'No models installed.';});bind('install-argos',async()=>{try{$('#model-status').textContent='Downloading '+learningLanguage().name+' translation…';const job=await api('/api/install-translation',{});await waitJob(job.id);$('#model-status').textContent='Local translation model installed. Choose Argos under Settings → Translation to use it.';}catch(e){$('#model-status').textContent=e.message;}});
}
function decorateMenuIcons(){
 for(const button of document.querySelectorAll('button')){
  const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);let node,up=false,found=false;
  while(node=walker.nextNode()){if(/[⌄⌃▾▿˅]/.test(node.nodeValue)||node.nodeValue.trim()==='⌃'){up=up||/[⌃]/.test(node.nodeValue);node.nodeValue=node.nodeValue.replace(/[⌄⌃▾▿˅]/g,'').trimEnd();found=true;}}
  if(found&&!button.querySelector('.oma-chevron')){const holder=document.createElement('span');holder.innerHTML=sidebarSvg(up?'<path d="m7 14 5-5 5 5"/>':'<path d="m7 10 5 5 5-5"/>');const icon=holder.firstChild;icon.classList.add('oma-chevron');button.append(icon);button.classList.add('menu-chevron-button');}
  if(button.textContent.includes('⇩')&&!button.querySelector('.oma-import-icon')){for(const node of [...button.childNodes])if(node.nodeType===3)node.nodeValue=node.nodeValue.replace('⇩','').trimStart();const holder=document.createElement('span');holder.innerHTML=sidebarSvg('<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/>');const icon=holder.firstChild;icon.classList.add('oma-import-icon');button.prepend(icon);}
 }
}
