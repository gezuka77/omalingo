function speakerIcon(){return '<svg class="oma-speaker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>';}
// Personal learning layout, mapped to observed LingQ navigation. No commercial/social UI.
let parityCollapsed=false,parityReaderList='saved',paritySentenceOnly=false;
const icons={library:'▥',create:'＋',ai:'♧',activities:'◴',settings:'⚙',collapse:'◧',play:'▷',more:'···'};
function libraryTabs(){return '';}
function parityNavigate(v){document.body.classList.remove('mobile-sidebar-open');paritySentenceOnly=false;trackRead();if(v==='library'){lid=null;libraryDiscoveryMode='home';}review=null;go(v);window.scrollTo(0,0);}
function wireNavigation(){$$('[data-nav]').forEach(b=>b.onclick=()=>parityNavigate(b.dataset.nav));}
function floatingMenu(anchor,items){
 $('#floating-menu')?.remove();const menu=document.createElement('div');menu.id='floating-menu';menu.className='floating-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',anchor.getAttribute('aria-label')||anchor.textContent.trim()||'Options');anchor.setAttribute('aria-haspopup','menu');anchor.setAttribute('aria-expanded','true');anchor.setAttribute('aria-controls','floating-menu');
 const close=restore=>{menu.remove();anchor.setAttribute('aria-expanded','false');if(restore&&anchor.isConnected)anchor.focus({preventScroll:true});};
 items.forEach(item=>{if(item===null){const hr=document.createElement('hr');hr.setAttribute('role','separator');menu.append(hr);return;}const button=document.createElement('button');button.type='button';button.textContent=item.label;button.setAttribute('role','menuitem');button.tabIndex=-1;button.onclick=act(async()=>{close(false);if(innerWidth<=800)closeSidebarDrawer();await item.run();});menu.append(button);});
 menu.addEventListener('keydown',event=>{const buttons=[...menu.querySelectorAll('[role=menuitem]')],index=buttons.indexOf(document.activeElement);let next;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}if(event.key==='Tab'){close(true);return;}if(event.key==='ArrowDown')next=(index+1)%buttons.length;if(event.key==='ArrowUp')next=(index-1+buttons.length)%buttons.length;if(event.key==='Home')next=0;if(event.key==='End')next=buttons.length-1;if(next!==undefined){event.preventDefault();buttons[next]?.focus();}});
 document.body.append(menu);const rect=anchor.getBoundingClientRect();menu.style.left=Math.max(12,Math.min(rect.left,innerWidth-menu.offsetWidth-12))+'px';menu.style.top=Math.max(12,Math.min(rect.bottom+7,innerHeight-menu.offsetHeight-12))+'px';menu.querySelector('button')?.focus({preventScroll:true});
 const outside=event=>{if(menu.contains(event.target)||anchor.contains(event.target))return;close(false);document.removeEventListener('pointerdown',outside,true);};setTimeout(()=>{if(menu.isConnected)document.addEventListener('pointerdown',outside,true);},0);
 const observer=new MutationObserver(()=>{if(!menu.isConnected){anchor.setAttribute('aria-expanded','false');document.removeEventListener('pointerdown',outside,true);observer.disconnect();}});observer.observe(document.body,{childList:true});
}

function createMenu(anchor){floatingMenu(anchor,[{label:'Import Lesson',run:()=>importDialog()},{label:'Import eBook',run:()=>importDialog('file')},{label:'Import Audio',run:()=>importDialog('audio')},{label:'Import Vocabulary',run:()=>{parityNavigate('words');$('#csv-import')?.click();}},{label:'Import from a website or YouTube',run:()=>importDialog('web')}]);}
function setupParityShell(){
 const nav=document.querySelector('.shell>nav');nav.className='app-sidebar';nav.innerHTML=`<div class="sidebar-brand"><button id="brand-home" aria-label="${OMA_BRAND_NAME} home">${omaBrandMark}<span class="nav-label">${OMA_BRAND_NAME}</span></button><button id="collapse-sidebar" aria-label="Toggle Sidebar">◧</button></div><button id="create-menu"><b class="create-icon">＋</b><span class="nav-label">Create</span></button><button id="library-menu" class="nav-section" aria-expanded="true" aria-controls="library-branch"><b class="library-chevron"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></b><span class="nav-label">Library</span></button><div id="library-branch"><button data-nav="library">Lessons</button><button data-nav="playlists">Playlists</button><button data-nav="words">Vocabulary</button></div><button data-nav="ai"><b>♧</b><span class="nav-label">O/L AI</span></button><div class="sidebar-divider"></div><button data-nav="progress"><b>◴</b><span class="nav-label">Activities</span></button><div id="recent-lessons"></div><div class="sidebar-bottom"><button id="profile-menu"><span class="avatar">ME</span><span class="nav-label">My profile</span><span class="nav-label">⌃</span></button><button id="notifications" aria-label="Notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 21h4"/></svg></button></div>`;
 const header=document.querySelector('header');header.innerHTML=`<button id="mobile-sidebar" aria-label="Toggle Sidebar">☰</button><div id="breadcrumb"></div><div class="row"><small id="storage-state">Saved locally</small><button id="language-menu" aria-label="Finnish"><svg viewBox="0 0 18 11" aria-hidden="true"><rect width="18" height="11" fill="white"/><path d="M5 0h3v11H5zM0 4h18v3H0z" fill="#003580"/></svg><svg class="oma-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
 const top=document.createElement('section');top.id='library-top';header.after(top);
 bind('brand-home',()=>parityNavigate('library'));bind('collapse-sidebar',()=>{parityCollapsed=!parityCollapsed;s.settings.sidebarCollapsed=parityCollapsed;save();render();});bind('mobile-sidebar',()=>{document.body.classList.toggle('mobile-sidebar-open');});bind('create-menu',e=>createMenu(e.currentTarget));bind('library-menu',()=>{const branch=$('#library-branch');branch.hidden=!branch.hidden;$('#library-menu').setAttribute('aria-expanded',String(!branch.hidden));s.settings.libraryExpanded=!branch.hidden;save();});if(s.settings.libraryExpanded===false){$('#library-branch').hidden=true;$('#library-menu').setAttribute('aria-expanded','false');}bind('profile-menu',e=>floatingMenu(e.currentTarget,[{label:'Settings',run:()=>parityNavigate('settings')},{label:'Statistics',run:()=>parityNavigate('progress')},{label:'Backup & Restore',run:()=>parityNavigate('backup')},{label:'Manage sources',run:()=>parityNavigate('sources')},{label:'Account',run:()=>openSettings('account')},{label:'Sign out',run:()=>signOutOma()}]));bind('language-menu',e=>floatingMenu(e.currentTarget,[{label:'Finnish → English',run:()=>{}},{label:'Language settings',run:()=>parityNavigate('settings')}]));bind('notifications',()=>modal('Notifications','<p>No new notifications. Import results and model downloads are available under Sources.</p>'+button('notification-jobs','View processing jobs'),()=>bind('notification-jobs',()=>{$('#dialog').close();parityNavigate('sources');})));
 parityCollapsed=!!s.settings.sidebarCollapsed;wireNavigation();
}
function render(){
 if(view!=='ai'){clearTimeout(aiChatTimer);refreshAiChat=null;}
 if(view!=='settings'||settingsTab!=='connections')$('#voice-preview')?.pause();
 document.body.classList.toggle('sentence-review-mode',view==='review'&&paritySentenceOnly);$('#main')?.classList.toggle('sentence-review-page',view==='review'&&paritySentenceOnly);
 if(!document.querySelector('.app-sidebar'))return legacyRender();
 syncReaderPlayback();
 $('#main').classList.toggle('pv-vocabulary',view==='words');document.body.classList.toggle('vocabulary-view',view==='words');const libraryActive=['library','playlists','words','review','sources'].includes(view);$('#library-menu')?.classList.toggle('active',libraryActive);$('#library-menu')?.setAttribute('aria-current',libraryActive?'page':'false');
 document.body.classList.toggle('sidebar-collapsed',sidebarShouldCollapse());
 $('#library-top').innerHTML=['library','words','playlists'].includes(view)&&!(view==='library'&&current())?libraryTabs():'';
 if(view==='ai')aiPage();else legacyRender();
 wireNavigation();const recent=(s.settings.recentLessons||[]).map(id=>s.lessons.find(l=>l.id===id)).filter(Boolean).slice(0,5);$('#recent-lessons').innerHTML=recent.map(l=>`<button data-recent="${E(l.id)}"><span class="recent-art">${E(l.icon||'▤')}</span><span class="nav-label">${E(l.title)}</span></button>`).join('');$$('[data-recent]').forEach(b=>b.onclick=()=>openLesson(b.dataset.recent));$$('.app-sidebar [data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));
 updateSidebarControls();
}
function openLesson(id){
 const lesson=s.lessons.find(item=>item.id===id);
 if(!lesson)return;
 if(view==='library'&&lid&&lid!==id)stopLessonPlayback();
 document.body.classList.remove('mobile-sidebar-open');
 if(!lesson.archived)s.settings.recentLessons=[id,...(s.settings.recentLessons||[]).filter(x=>x!==id)].slice(0,8);
 legacyOpenLesson(id);
 window.scrollTo(0,0);
}
function personalLibrary(){
 if(current())return legacyLibrary();
 $('#main').innerHTML=`<div class="library-search"><input id="lesson-search" placeholder="Search Library" aria-label="Search Library"><select id="library-level" aria-label="Level"><option value="">All levels</option>${['Beginner 1','Beginner 2','Intermediate 1','Intermediate 2','Advanced 1','Advanced 2'].map(v=>`<option>${v}</option>`).join('')}</select><button id="import" class="import-button">⇩ Import ⌄</button></div><div id="search-modes"><button class="active" data-searchmode="lessons">Lessons</button><button data-searchmode="courses">Courses</button><button data-searchmode="imported">Imported Lessons</button></div><div class="source-pickers"><button id="local-source">▥ My Library</button><button id="youtube-source"><span style="color:#f00000">▶</span> YouTube</button><button id="all-sources">Browse sources</button></div><div id="library-content"></div>`;
 let mode='lessons';const card=l=>{const types=[...new Set(C.words(l.text).map(C.norm))],unknown=types.filter(k=>!s.words[k]).length,pct=types.length?Math.round(100*unknown/types.length):0;return `<article class="lesson-card"><button class="lesson-cover" data-open="${E(l.id)}" aria-label="Open ${E(l.title)}">${(l.imageUrl||l.image)?`<img src="${E(omaImportSafeImage(l.imageUrl||l.image))}" alt="">`:l.youtubeId?`<img src="https://i.ytimg.com/vi/${encodeURIComponent(l.youtubeId)}/hqdefault.jpg" alt="">`:`<span>${E(l.icon||'▤')}</span>`}<div class="word-counts"><span class="blue-dot"></span>${unknown}<br><span class="yellow-dot"></span>${types.length-unknown}</div></button><div class="lesson-card-body"><button class="lesson-title" data-open="${E(l.id)}">${E(l.title)}</button><p class="difficulty"><i></i>${pct}% New Words</p><button class="course-link" data-course="${E(l.course||'Personal Lessons')}">${E(l.course||'Personal Lessons')}</button></div></article>`;};
 const draw=()=>{const q=C.norm($('#lesson-search').value),level=$('#library-level').value;const items=s.lessons.filter(l=>(!q||C.norm(l.title+' '+l.course+' '+l.tags.join(' ')).includes(q))&&(!level||l.level===level)&&(mode!=='imported'||l.created>2));let html='';if(mode==='courses'){const courses=[...new Set(items.map(l=>l.course||'Personal Lessons'))];html='<div class="cards">'+courses.map(c=>`<article class="lesson-card"><button class="lesson-cover" data-course="${E(c)}"><span>▥</span></button><div class="lesson-card-body"><button class="lesson-title" data-course="${E(c)}">${E(c)}</button><p>${items.filter(l=>(l.course||'Personal Lessons')===c).length} lessons</p></div></article>`).join('')+'</div>';}else{const recent=(s.settings.recentLessons||[]).map(id=>items.find(l=>l.id===id)).filter(Boolean);const groups=q||level||mode==='imported'?[['Search results',items]]:[['Continue Studying',recent.length?recent:items.filter(l=>!l.completed).slice(0,4)],['My Lessons',items],['Courses',[]]];html=groups.filter(([,ls])=>ls.length).map(([name,ls])=>`<section class="library-shelf"><div class="row between"><h2>${name}</h2><button data-viewall="${E(name)}">View all ›</button></div><div class="cards">${ls.slice(0,q?100:8).map(card).join('')}</div></section>`).join('');}if(mode==='courses'){const publicCourses=discoverySources().filter(source=>sourceMatchesCategory(source,'Guided Courses')&&(!q||C.norm(source.name+' '+source.description).includes(q)));html+='<section class="library-shelf"><h2>Public courses</h2><p class="muted">Free public course material and publisher samples. Open a course to choose a lesson or download a file to import.</p><div class="learning-resource-grid">'+publicCourses.map(learningResourceCard).join('')+'</div></section>';}$('#library-content').innerHTML=html||'<div class="empty">No matching lessons. Import a text, book, recording or public source.</div>';$$('.learning-home-shelf,.discovery-home-shelf').forEach(section=>section.hidden=mode==='courses');wireResourceFeeds($('#library-content'));$$('[data-open]').forEach(b=>b.onclick=()=>openLesson(b.dataset.open));$$('[data-course]').forEach(b=>b.onclick=()=>coursePage(b.dataset.course));$$('[data-viewall]').forEach(b=>b.onclick=()=>{mode='lessons';$('#lesson-search').value='';const expanded=b.dataset.viewall==='Continue Studying'?items.filter(l=>(s.settings.recentLessons||[]).includes(l.id)||!l.completed):items;$('#library-content').innerHTML='<div class="cards">'+expanded.map(card).join('')+'</div>';$$('[data-open]').forEach(el=>el.onclick=()=>openLesson(el.dataset.open));$$('[data-course]').forEach(el=>el.onclick=()=>coursePage(el.dataset.course));});};
 bind('import',e=>createMenu(e.currentTarget));bind('lesson-search',draw,'input');bind('library-level',draw,'change');$$('[data-searchmode]').forEach(b=>b.onclick=()=>{mode=b.dataset.searchmode;$$('[data-searchmode]').forEach(el=>el.classList.toggle('active',el===b));draw();});bind('youtube-source',()=>{parityNavigate('sources');});bind('all-sources',()=>parityNavigate('sources'));bind('local-source',()=>{mode='lessons';draw();});draw();
}
function coursePage(course){
 const lessons=s.lessons.filter(lesson=>!lesson.archived&&(lesson.course||'Personal Lessons')===course);
 $('#main').innerHTML=`<button id="course-back">‹ Lessons</button><section class="course-heading"><div class="course-art">▥</div><div><h1>${E(course)}</h1><p>${lessons.length} lessons · ${E(learningLanguage().name)}</p></div><button id="course-play" class="primary" ${lessons.length?'':'disabled'}>▶ Play course</button></section><div class="course-lesson-list">${lessons.map((l,i)=>`<article><span>${i+1}</span><button data-course-open="${E(l.id)}">${E(l.title)}</button><small>${C.words(l.text).length} words</small><span>${l.completed?'✓':''}</span></article>`).join('')}</div>`;
 bind('course-back',()=>{lid=null;render();});
 bind('course-play',async()=>{queue=lessons.map(lesson=>lesson.id);queueIndex=0;await playLesson(queue[0],true);});
 $$('[data-course-open]').forEach(b=>b.onclick=()=>openLesson(b.dataset.courseOpen));
}
function reader(l){
 const previousArticle=$('#reader-text')?.closest('article'),readerScrollBefore=previousArticle?.dataset.readerLesson===l.id?previousArticle.scrollTop:0;
 $$('.reading-bottom').forEach(el=>el.remove());legacyReader(l);const main=$('#main');main.querySelector(':scope>.row')?.remove();const toolbar=$('.reader-toolbar');if(!toolbar)return;const header=document.createElement('div');header.className='reading-top';header.innerHTML=`<div class="reading-progress" role="progressbar" aria-label="Lesson sentence position" title="Saved sentence position in this lesson"><i style="width:${100*(Number(s.positions[l.id]||0)+1)/Math.max(1,C.segments(l.text).length)}%"></i></div><div class="row"><button id="reader-aa">Aa</button><button id="reader-more" aria-label="Lesson menu">···</button><button id="reader-panel-toggle" aria-label="Toggle vocabulary sidebar">▤</button></div>`;toolbar.before(header);
 const previous=$('#prev-sentence'),next=$('#next-sentence');const oldNavigation=previous?.parentElement;if(previous&&next){previous.className='reader-side-prev';next.className='reader-side-next';previous.textContent='‹';next.textContent='›';previous.setAttribute('aria-label','Previous sentence');next.setAttribute('aria-label','Next sentence');oldNavigation.parentElement.append(previous,next);oldNavigation.remove();}$('#sentence-practice').hidden=true;
 const page=$('#reader-text');page.style.columnCount='1';page.style.columnGap='40px';const info=document.createElement('section');info.className='reading-lesson-title';info.innerHTML=readerSourceHeader(l);page.before(info);enrichReaderSourceHeader(l,info);const readingArticle=page.closest('article');readingArticle.dataset.readerLesson=l.id;readingArticle.scrollTop=readerScrollBefore;
 bind('explain',()=>explainReaderPassage(l));
 const menuNodes=['listen','selected-phrase','edit-lesson','add-playlist','complete','attach-audio','attach-subtitles','transcribe','explain','embed-video'].map(id=>$('#'+id)).filter(Boolean);menuNodes.forEach(el=>el.hidden=true);toolbar.hidden=true;
 bind('reader-more',e=>floatingMenu(e.currentTarget,[...menuNodes.filter(el=>!['transcribe','attach-subtitles'].includes(el.id)).map(el=>({label:el.textContent,run:()=>el.click()})),{label:'Transcript…',run:()=>transcriptOptionsDialog(l)},{label:'Review Lesson',run:()=>{view='review';reviewPage(Object.entries(s.words).filter(([,w])=>w.encounters?.some(e=>e.lessonId===l.id)).map(([k])=>k));}},{label:'Sentence Audio & Timing',run:()=>showLessonTimings(l)},{label:'Reader settings',run:()=>readerSettings()}]));bind('reader-aa',readerSettings);bind('sentence-listen',async()=>{if(l.media||l.youtubeId){await playLesson(l.id);const index=Number(s.positions[l.id]||0);const cue=l.cues.find(c=>c.text.includes(C.segments(l.text)[index]?.text||'!'));if(cue)seekMedia(cue.start);}else if(s.settings.sentenceMode)await speak(C.segments(l.text)[Number(s.positions[l.id]||0)]?.text||l.text);else await playLesson(l.id);});bind('reader-panel-toggle',()=>{const panel=$('#word-panel');if(!panel)return;if(!chosen){toast('Select a word in the text to see its meaning.');return;}if(innerWidth<=1100){delete panel.dataset.mobileDismissed;panel.dataset.mobileRequested='true';syncAdaptiveUI();}else document.body.classList.toggle('hide-word-panel');});
 const controls=document.createElement('div');controls.className='reading-bottom';controls.innerHTML=`<button id="reader-page-view">▥ ${s.settings.sentenceMode?'Page View':'Sentence View'}</button><button id="reader-review-sentence">▱ Review Sentence</button>`;$('.persistent-player').append(controls);bind('reader-page-view',toggleReaderSentenceView);bind('reader-review-sentence',startReaderSentenceReview);
 const translation=$('#translation');const tr=document.createElement('button');tr.className='show-translation';tr.innerHTML='<span>Show Translation</span><svg class="oma-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';tr.setAttribute('aria-expanded',String(!translation.hidden));page.after(tr);tr.onclick=()=>{translation.hidden=!translation.hidden;tr.setAttribute('aria-expanded',String(!translation.hidden));tr.querySelector('span').textContent=translation.hidden?'Show Translation':'Hide Translation';};
 const para=$('#library-content article>p.muted');if(para)para.hidden=true;
 $$('#library-content [data-sentence-word]').forEach(b=>b.parentElement?.remove());if(s.settings.sentenceMode&&s.settings.showVocabulary!==false){const section=document.createElement('section');section.className='reader-vocabulary-list';translation.after(section);refreshSentenceVocabulary();}
}
function termPanel(term,context=''){
 legacyTermPanel(term,context);const panel=$('#word-panel')||$('#term-editor');if(!panel)return;panel.classList.add('lingq-word-panel');const title=panel.querySelector('h2');panel.querySelector('.eyebrow')?.remove();const top=document.createElement('div');top.className='word-panel-heading';top.innerHTML=`<button id="panel-pronounce" aria-label="Pronounce selected word">${speakerIcon()}</button><strong>${E(term)}</strong><button id="panel-tags">Tag+</button>`;panel.prepend(top);title?.remove();
 const meaning=$('#term-meaning');if(meaning?.parentElement){const text=meaning.parentElement.firstChild;if(text?.nodeType===3)text.textContent='Saved Meaning';}const notes=$('#term-note');if(notes?.parentElement){const text=notes.parentElement.firstChild;if(text?.nodeType===3)text.textContent='Notes';notes.placeholder='Add a note here';}
 $('#term-status')?.parentElement.setAttribute('hidden','');$('#term-tags')?.parentElement.setAttribute('hidden','');
 const related=document.createElement('details');related.className='related-phrases';related.open=true;const tokens=C.words(context);const index=tokens.findIndex(k=>C.norm(k)===C.norm(term));const candidates=new Set();if(index>=0){for(let start=Math.max(0,index-3);start<=index;start++)for(let end=index+1;end<=Math.min(tokens.length,index+5);end++)if(end-start>1)candidates.add(tokens.slice(start,end).join(' '));}C.matches(s,context).filter(p=>p.term.includes(C.norm(term))).forEach(p=>candidates.add(p.term));related.innerHTML='<summary>Related Phrases</summary>'+[...candidates].slice(0,12).map(p=>`<button data-related-phrase="${E(p)}">${E(p)}</button>`).join('');meaning?.parentElement.after(related);$$('[data-related-phrase]').forEach(b=>b.onclick=()=>termPanel(b.dataset.relatedPhrase,context));
 const status=document.createElement('div');status.className='word-panel-status';status.innerHTML=[-1,1,2,3,4,5].map(n=>`<button data-direct-status="${n}" aria-label="${statusName(n)}" class="${(s.words[C.norm(term)]?.status||1)===n?'chosen':''}">${n===-1?'<svg class="ignore-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="m6.3 6.3 11.4 11.4"/></svg>':n===5?'✓':n}</button>`).join('');panel.append(status);$$('[data-direct-status]').forEach(b=>b.onclick=()=>{$('#term-status').value=b.dataset.directStatus;$('#save-term').click();});bind('panel-pronounce',()=>speak(term));bind('panel-tags',()=>{$('#term-tags').parentElement.hidden=false;$('#term-tags').focus();});
 for(const id of ['term-meaning','term-note','term-tags'])bind(id,()=>{const w=C.term(s,term,{status:Number($('#term-status').value),autoKnownLessonId:null,meanings:$('#term-meaning').value.split('\n').filter(Boolean).map(text=>({text,language:'en',source:'personal'})),note:$('#term-note').value,tags:taglist($('#term-tags').value),context},view==='library'&&current()?{lessonId:lid,sentence:context}:undefined);save();},'change');
 installReaderDictionaries(term,context,panel);
}

function readerSettings(){const set=s.settings;modal('Reader appearance',`<p class="muted">Adjust the text to suit your reading.</p><label><span id="rp-size-label">Font size · ${set.fontSize} px</span><input id="rp-size" type="range" min="14" max="48" value="${set.fontSize}"></label><label><span id="rp-line-label">Line spacing · ${set.lineHeight}</span><input id="rp-line" type="range" min="1.2" max="3" step=".05" value="${set.lineHeight}"></label><label>Font<select id="rp-font">${['Arial','Georgia','Verdana'].map(v=>`<option ${set.font===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Reading width · px<input id="rp-width" type="number" min="320" max="1400" step="20" value="${set.pageWidth}"></label><p id="reader-appearance-status" role="status"></p><div class="row wrap">${button('reader-settings-all','All settings')}${button('reader-settings-save','Done','primary')}</div>`,()=>{bind('reader-settings-all',()=>{$('#dialog').close();openSettings('reader');});bind('rp-size',()=>$('#rp-size-label').textContent='Font size · '+$('#rp-size').value+' px','input');bind('rp-line',()=>$('#rp-line-label').textContent='Line spacing · '+$('#rp-line').value,'input');bind('reader-settings-save',()=>{const width=Number($('#rp-width').value);if(!Number.isFinite(width)||width<320||width>1400){$('#reader-appearance-status').textContent='Choose a reading width between 320 and 1400 px.';return;}set.fontSize=Number($('#rp-size').value);set.lineHeight=Number($('#rp-line').value);set.font=$('#rp-font').value;set.pageWidth=width;save();$('#dialog').close();reader(current());});});}

function progress(){const st=C.stats(s),reading=s.events.filter(e=>e.kind==='read').reduce((n,e)=>n+e.amount,0),listening=s.events.filter(e=>e.kind==='listen').reduce((n,e)=>n+e.amount,0);$('#main').innerHTML=`<div class="activity-heading"><h1>Activities</h1><button id="activity-manual">＋ Add activity</button></div><div class="stats-grid">${[['Known Words',st.known],['Learning Words',st.learning],['Words Read',reading],['Listening',time(listening)],['Reviews',s.reviewHistory.filter(r=>!r.skipped).length],['Lessons Completed',s.lessons.filter(l=>l.completed).length]].map(([label,value])=>`<section class="panel"><h2>${E(value)}</h2><p>${label}</p></section>`).join('')}</div><h2 class="section-heading">Study history</h2><div class="activity-history">${s.events.slice(-70).reverse().map(e=>`<article><span>${e.kind==='listen'?speakerIcon():e.kind==='read'?'▥':'✓'}</span><div><strong>${E(s.lessons.find(l=>l.id===e.lessonId)?.title||({review:'Vocabulary Review',read:'Reading',listen:'Listening',complete:'Lesson completed'})[e.kind]||e.kind)}</strong><p>${new Date(e.at).toLocaleString()} · ${e.kind==='listen'?time(e.amount):Math.round(e.amount)+' '+(e.kind==='read'?'words':'activities')}</p></div></article>`).join('')||'<p>Your reading, listening and review activity will appear here.</p>'}</div>`;bind('activity-manual',()=>modal('Add activity',`<label>Activity<select id="manual-kind"><option value="read">Words read</option><option value="listen">Minutes listened</option></select></label><input id="manual-amount" type="number" min="1" value="10">${button('manual-save','Save','primary')}`,()=>bind('manual-save',()=>{const kind=$('#manual-kind').value,n=Number($('#manual-amount').value);if(!Number.isFinite(n)||n<=0)throw Error('Enter a positive amount.');C.event(s,kind,kind==='listen'?n*60:n,{manual:true});save();$('#dialog').close();progress();})));}
function settings(){legacySettings();$('#main>p.eyebrow')?.remove();$('#main>h1').textContent='Settings';const goal=$('#set-dailyGoal')?.parentElement;if(goal)goal.hidden=true;const tabs=document.createElement('div');tabs.className='settings-tabs';tabs.innerHTML='<button class="active" id="settings-reader-tab">Reader Settings</button><button id="settings-ai-tab">AI & Connections</button><button id="settings-backup-tab">Backup & Restore</button>';$('#main h1').after(tabs);bind('settings-backup-tab',()=>parityNavigate('backup'));bind('settings-ai-tab',()=>{aiConnectionSettings();});const goalLabel=$('#set-dailyGoal')?.parentElement;if(goalLabel?.firstChild)goalLabel.firstChild.textContent='';}
function aiConnectionSettings(){modal('AI & Connections',`<div class="row wrap"><button id="openrouter-settings" class="primary">OpenRouter · ElevenLabs speech</button></div><p>Choose local Ollama or connect OpenAI with a Platform API key.</p><label>AI provider<select id="ai-provider"><option value="ollama" ${s.settings.aiProvider!=='openai'?'selected':''}>Ollama · local</option><option value="openai" ${s.settings.aiProvider==='openai'?'selected':''}>OpenAI</option></select></label><label>OpenAI API key<input id="openai-key" type="password" autocomplete="off" placeholder="Enter a Platform API key"></label><p class="muted">The key stays with this computer’s local service and is excluded from library backups. A ChatGPT browser/session token is not an API key. OpenAI API requests may incur usage charges.</p><p><strong>Transcription:</strong> gpt-transcribe · imports only<br><strong>Generated speech:</strong> choose below · originals play as recorded</p><label>Speech provider<select id="speech-provider"><option value="openai">OpenAI · cloud, API usage charges</option><option value="piper">Piper Harri · local, free</option></select></label><label>OpenAI voice<select id="speech-voice"><option value="marin">Marin</option><option value="cedar">Cedar</option></select></label><p class="muted">GPT Realtime 2.1 Mini · AI-generated speech. Recordings are cached on this computer for repeat playback.</p><label>Text model · chat, translations and explanations<input id="openai-model" value="${E(s.settings.openaiModel&&!/(transcrib|whisper|tts|realtime|embedding|image|moderation|audio)/i.test(s.settings.openaiModel)?s.settings.openaiModel:'gpt-4.1-mini')}" placeholder="Model ID from your OpenAI account"></label><div class="row">${button('openai-save','Save connection','primary')}${button('openai-test','Test connection')}${button('openai-models','List available models')}${button('openai-forget','Forget key')}</div><p id="openai-status" role="status"></p>`,()=>{bind('openrouter-settings',openRouterSettings);api('/api/openai/config').then(r=>{$('#openai-status').textContent=r.keyConfigured?'A key is configured.':'No key configured.';if(r.model)$('#openai-model').value=r.model;$('#speech-provider').value=r.speechProvider||'piper';$('#speech-voice').value=r.speechVoice||'marin';}).catch(e=>{$('#openai-status').textContent=e.message;});bind('openai-save',async()=>{const key=$('#openai-key').value,model=$('#openai-model').value;await api('/api/openai/config',{...(key?{apiKey:key}:{}),model,speechProvider:$('#speech-provider').value,speechVoice:$('#speech-voice').value,enabled:$('#ai-provider').value==='openai'||$('#speech-provider').value==='openai'});s.settings.aiProvider=$('#ai-provider').value;s.settings.openaiModel=model;$('#openai-key').value='';save();$('#openai-status').textContent='Connection settings saved.';});bind('openai-test',async()=>{const r=await api('/api/openai/test',{});$('#openai-status').textContent=r.message||'Connection works.';});bind('openai-models',async()=>{const r=await api('/api/openai/models');const models=(r.models||r.data||[]).filter(m=>/^(gpt-|o[1-9])/.test(m.id||m)&&!/(transcrib|whisper|tts|realtime|embedding|image|moderation|audio)/i.test(m.id||m));$('#openai-status').innerHTML=models.map(m=>'<button data-openai-model="'+E(m.id||m)+'">'+E(m.id||m)+'</button>').join('');$$('[data-openai-model]').forEach(b=>b.onclick=()=>$('#openai-model').value=b.dataset.openaiModel);});bind('openai-forget',async()=>{await api('/api/openai/config',undefined,'DELETE');$('#openai-key').value='';$('#openai-status').textContent='Key removed.';});});}
let refreshAiChat=null,aiChatTimer=null;
const aiChatChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('oma-temporary-chat'):null;
aiChatChannel?.addEventListener('message',event=>{
 if(event.data?.accountId===authUser?.id)refreshAiChat?.(event.data.cleared);
});
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden)refreshAiChat?.();
});

function aiPage(){
 const sendIcon='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>';
 const provider=s.settings.aiProvider==='openai'?'openai':'ollama';
 $('#main').innerHTML=`
  <div class="ai-heading">
   <h1>O/L AI</h1>
   <div class="row wrap ai-actions"><button id="ai-clear" disabled>Clear chat</button><button id="ai-options">Connections</button></div>
  </div>
  <div id="ai-welcome" class="ai-welcome" hidden><h2>Your personal language coach</h2><p>Ask about words, get help with a sentence, or practise a conversation.</p></div>
  <section id="ai-messages" aria-live="polite"><p role="status">Loading chat…</p></section>
  <form id="ai-form">
   <textarea id="ai-question" rows="2" maxlength="20000" placeholder="Ask O/L AI…" aria-label="Message" disabled></textarea>
   <button id="ai-send" class="primary" type="submit" aria-label="Send message" title="Send message" disabled>${sendIcon}</button>
  </form>
  <p id="ai-request-error" role="alert"></p>
  <button id="ai-reload" hidden>Reload chat</button>
  <p class="ai-caption">${provider==='openai'?'OpenAI':'Ollama · local'} · Chat clears 24 hours after the last message and is excluded from backups.</p>`;
 const form=$('#ai-form'),question=$('#ai-question'),send=$('#ai-send'),clear=$('#ai-clear');
 const messages=$('#ai-messages'),welcome=$('#ai-welcome'),error=$('#ai-request-error'),reload=$('#ai-reload');
 let chat=null,sending=false,clearing=false,mutation=0,readSequence=0;
 const announceChange=(cleared=false)=>aiChatChannel?.postMessage({accountId:authUser.id,cleared});
 const updateControls=()=>{
  question.disabled=!chat||sending||clearing||chat.replying;
  send.disabled=question.disabled||!question.value.trim();
  clear.disabled=clearing||!chat||(!chat.messages.length&&!sending);
 };
 function draw(){
  clearTimeout(aiChatTimer);
  if(chat?.expiresAt&&chat.expiresAt<=Date.now())chat=null;
  welcome.hidden=!chat||!!chat.messages.length||sending;
  messages.innerHTML=(chat?.messages||[]).map(message=>`<article class="ai-message ${message.role}"><strong>${message.role==='user'?'You':'O/L AI'}</strong><p>${aiText(message.text)}</p></article>`).join('')
   +(sending||chat?.replying?'<p class="ai-thinking" role="status">O/L AI is thinking…</p>':!chat&&!error.textContent?'<p role="status">Loading chat…</p>':'');
  updateControls();
  const untilExpiry=chat?.expiresAt?chat.expiresAt-Date.now():Infinity;
  const wait=chat?.replying&&!sending?Math.min(3000,untilExpiry):untilExpiry;
  if(Number.isFinite(wait))aiChatTimer=setTimeout(()=>{
   if(!form.isConnected)return;
   if(chat?.expiresAt<=Date.now())draw();
   refresh();
  },Math.max(1,wait));
 }
 async function refresh(){
  if(!form.isConnected||sending||clearing)return;
  const before=mutation,request=++readSequence;
  try{
   const latest=await api('/api/chat');
   if(!form.isConnected||before!==mutation||request!==readSequence)return;
   if(!reload.hidden)error.textContent='';
   reload.hidden=true;
   chat=latest;
   draw();
  }catch(cause){
   if(!form.isConnected||before!==mutation||request!==readSequence)return;
   error.textContent=cause.message==='Unknown app endpoint'?'Restart O/L to use temporary chat.':cause.message;
   reload.hidden=false;
   draw();
  }
 }
 refreshAiChat=cleared=>{
  if(!form.isConnected)return;
  if(cleared){
   mutation++;
   sending=false;
   chat=null;
   question.value='';
   error.textContent='';
   draw();
  }
  refresh();
 };
 bind('ai-options',aiConnectionSettings);
 bind('ai-reload',refresh);
 question.addEventListener('input',updateControls);
 form.onsubmit=async event=>{
  event.preventDefault();
  if(send.disabled)return;
  const text=question.value.trim();
  const version=chat.version;
  const operation=++mutation;
  error.textContent='';
  sending=true;
  draw();
  try{
   const result=await api('/api/chat',{text,version,provider,model:provider==='openai'?s.settings.openaiModel:s.settings.ollamaModel});
   announceChange();
   if(!form.isConnected||operation!==mutation)return;
   chat=result;
   if(result.error)error.textContent=result.error+' You can retry your message.';
   else question.value='';
  }catch(cause){
   if(form.isConnected&&operation===mutation)error.textContent=cause.message;
  }finally{
   if(form.isConnected&&operation===mutation){
    sending=false;
    draw();
    refresh();
   }
  }
 };
 bind('ai-clear',async()=>{
  if(clear.disabled)return;
  clearing=true;
  updateControls();
  try{
   const empty=await api('/api/chat',undefined,'DELETE');
   announceChange(true);
   if(!form.isConnected)return;
   mutation++;
   sending=false;
   chat=empty;
   question.value='';
   error.textContent='';
  }catch(cause){
   if(form.isConnected)error.textContent=cause.message;
  }finally{
   clearing=false;
   if(form.isConnected){
    draw();
    if(!error.textContent)question.focus();
   }
  }
 });
 clearTimeout(aiChatTimer);
 refresh();
}


function reviewCardBase(){syncParityFrame();if(paritySentenceOnly&&review?.material==='sentences'&&review.index===0){const sentence=C.segments(current()?.text||'')[Number(s.positions[lid]||0)]?.text;if(sentence&&review.items[sentence])review.terms=[sentence];}legacyReviewCard();const r=review;if(!r)return;if(paritySentenceOnly&&r.index<r.terms.length){const title=$('.review-card h1');if(title)title.textContent='Put the sentence in order';}if(paritySentenceOnly)bind('finish-review',closeReaderSentenceReview);const head=document.createElement('div');head.className='review-topline';head.innerHTML=`<button id="review-close" aria-label="Close">×</button><div class="review-progress-track"><i style="width:${100*r.index/Math.max(1,r.terms.length)}%"></i><span>${Math.min(r.index+1,r.terms.length)} / ${r.terms.length}</span></div><button id="review-options" aria-label="Review Settings">···</button>`;$('#main').prepend(head);$('#main>.row')?.remove();bind('review-close',()=>{if(paritySentenceOnly)return closeReaderSentenceReview();review=null;parityNavigate('words');});bind('review-options',()=>modal('Review Settings',`<h3>General</h3><label><input id="session-autospeak" type="checkbox" ${r.autospeak?'checked':''}>Auto Text-to-Speech</label><label><input id="session-reschedule" type="checkbox" ${r.reschedule?'checked':''}>Update SRS schedule</label><label>Activities<select id="session-type">${['flashcard','reverse','cloze','multiple-choice','dictation','matching','unscramble','speaking'].map(v=>`<option ${r.type===v?'selected':''}>${v}</option>`).join('')}</select></label>${button('session-save','Done','primary')}`,()=>bind('session-save',()=>{r.autospeak=$('#session-autospeak').checked;r.reschedule=$('#session-reschedule').checked;r.type=$('#session-type').value;$('#dialog').close();reviewCard();})));}

function syncReaderPlayback(){
 const reading=view==='library'&&!!current();
 if(!reading){
  if(playingLesson||document.body.classList.contains('reader-mode'))stopLessonPlayback();
  $$('.reading-bottom').forEach(el=>el.remove());
 }
 document.body.classList.toggle('reader-mode',reading);
}
function syncParityFrame(){
 syncReaderPlayback();
 document.body.classList.toggle('sidebar-collapsed',sidebarShouldCollapse());
 $('#main').classList.toggle('pv-vocabulary',view==='words');document.body.classList.toggle('vocabulary-view',view==='words');const libraryActive=['library','playlists','words','review','sources'].includes(view);$('#library-menu')?.classList.toggle('active',libraryActive);$('#library-menu')?.setAttribute('aria-current',libraryActive?'page':'false');
 const top=$('#library-top');if(top&&!['library','words','playlists'].includes(view))top.innerHTML='';
 updateSidebarControls();
}
function reviewPage(keys,sentences=false){pauseMedia();syncParityFrame();legacyReviewPage(keys,sentences);window.scrollTo(0,0);}
function importAudioLesson(){pickFile('audio/*,video/*',async file=>{
 modal('Import Audio',`<label>Title<input id="audio-import-title" value="${E(file.name.replace(/\.[^.]+$/,''))}"></label><p>${E(file.name)} · ${(file.size/1048576).toFixed(1)} MB</p><label>Transcription model<select id="audio-import-model">${['OpenAI','tiny','base','small'].map(m=>`<option ${m==='OpenAI'?'selected':''}>${m}</option>`).join('')}</select></label><p class="muted">OpenAI transcribes the original audio with your saved key (API charges apply). Local Whisper models are optional and produce timed text.</p>${button('audio-import-start','Transcribe & Import','primary')}<p id="audio-import-status" role="status"></p>`,()=>bind('audio-import-start',async()=>{
 const title=$('#audio-import-title').value,model=$('#audio-import-model').value;$('#audio-import-start').disabled=true;$('#audio-import-status').textContent='Uploading audio…';
 try{const uploaded=await uploadAudio(file);if($('#audio-import-status'))$('#audio-import-status').textContent=model==='OpenAI'?'Transcribing with OpenAI…':'Transcribing on this computer…';const job=await api(model==='OpenAI'?'/api/transcribe/openai':'/api/transcribe',{media:uploaded.media,model});const result=await waitJob(job.id);importPreview({...result,title,media:uploaded.media});}
 catch(error){if($('#audio-import-status'))$('#audio-import-status').textContent=error.message;if($('#audio-import-start'))$('#audio-import-start').disabled=false;throw error;}
 }));
 });}

function showLessonTimings(l){const items=l.cues.length?l.cues:C.segments(l.text).map(p=>({text:p.text}));modal('Sentence Audio & Timing',`<div class="cue-list">${items.map((c,i)=>`<button data-timing-jump="${i}">${c.start!==undefined?time(c.start)+' · ':''}${E(c.text)}</button>`).join('')}</div>`,()=>{$$('[data-timing-jump]').forEach(b=>b.onclick=act(async()=>{const i=Number(b.dataset.timingJump);if(playingLesson!==l.id)await playLesson(l.id);if(l.cues[i])seekMedia(l.cues[i].start);else if(clips.length){clipIndex=i;await loadClip();}await playMedia();}));});}



async function explainReaderPassage(l){
 const text=window.getSelection()?.toString().trim()||C.segments(l.text)[Number(s.positions[l.id]||0)]?.text||l.text.slice(0,1600);
 modal('Explain passage',`<blockquote>${E(text)}</blockquote><div id="passage-explanation" role="status">Explaining the meaning and grammar…</div>`);
 const target=$('#passage-explanation');
 try{const r=await api('/api/assist',{text,mode:'explain',model:s.settings.ollamaModel});if(target.isConnected)target.innerHTML=aiText(r.text)+'<p class="muted">AI explanation · check unfamiliar grammar against a dictionary.</p>';}
 catch(error){if(target.isConnected)target.textContent='Could not explain this passage: '+error.message;}
}
