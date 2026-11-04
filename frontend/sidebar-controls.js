/* Sidebar controls. Inject inside the application IIFE after parity-shell.js. */
let parityReaderExpanded=false,sidebarResizeBound=false;
const sidebarSvg=(paths)=>`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const sidebarArtwork={
 create:sidebarSvg('<path d="M12 5v14M5 12h14"/>'),
 library:sidebarSvg('<path d="M4 4h4v16H4zM11 4h4v16h-4zM17 5l3-1 4 15-3 1z" transform="translate(-1 0)"/>'),
 ai:sidebarSvg('<path d="M6 4h10a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-5l-5 4v-4a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z"/><path d="m12 7 1.2 3.2L16.5 11l-3.3 1L12 15l-1.1-3L7.5 11l3.4-.8Z"/>'),
 activities:sidebarSvg('<path d="M3 8V3M3 8h5"/><path d="M4.2 7a9 9 0 1 1-1 8"/><path d="M12 7v5l3 2"/>')
};
function sidebarShouldCollapse(){
 if(window.innerWidth<=800)return !document.body.classList.contains('mobile-sidebar-open');
 return parityCollapsed||(view==='library'&&!!current()&&!parityReaderExpanded);
}
function updateSidebarControls(){
 const button=$('#collapse-sidebar');if(!button)return;
 const collapsed=sidebarShouldCollapse();document.body.classList.toggle('sidebar-collapsed',collapsed);
 const label=collapsed?'Expand sidebar':'Collapse sidebar';button.setAttribute('aria-label',label);button.setAttribute('title',label);button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-controls','oma-sidebar-navigation');
 button.innerHTML=sidebarSvg(`<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M${collapsed?'12 9l3 3-3 3':'16 9l-3 3 3 3'}"/>`);
 const backdrop=$('#sidebar-backdrop');if(backdrop)backdrop.hidden=!(window.innerWidth<=800&&!collapsed);
}
function setSidebarExpanded(expanded){
 if(window.innerWidth<=800){document.body.classList.toggle('mobile-sidebar-open',expanded);}
 else{parityCollapsed=!expanded;parityReaderExpanded=expanded;s.settings.sidebarCollapsed=parityCollapsed;save();}
 render();updateSidebarControls();
}
function closeSidebarDrawer(){document.body.classList.remove('mobile-sidebar-open');updateSidebarControls();}
function installSidebarControls(){
 const nav=document.querySelector('.app-sidebar');if(!nav)return;
 nav.id='oma-sidebar-navigation';
 if(nav.dataset.sidebarControls==='ready'){updateSidebarControls();return;}
 nav.dataset.sidebarControls='ready';
 const oldToggle=$('#collapse-sidebar');if(oldToggle){const button=oldToggle.cloneNode(false);oldToggle.replaceWith(button);button.type='button';button.addEventListener('click',()=>setSidebarExpanded(sidebarShouldCollapse()));}
 const oldMobile=$('#mobile-sidebar');if(oldMobile){const mobile=oldMobile.cloneNode(false);oldMobile.replaceWith(mobile);mobile.type='button';mobile.setAttribute('aria-label','Open sidebar');mobile.innerHTML=sidebarSvg('<path d="M4 6h16M4 12h16M4 18h16"/>');mobile.addEventListener('click',()=>setSidebarExpanded(true));}
 const create=$('#create-menu');if(create){create.setAttribute('aria-label','Create');create.title='Create';const icon=create.querySelector('b');if(icon)icon.innerHTML=sidebarArtwork.create;}
 const library=$('#library-menu');if(library){library.setAttribute('aria-label','Library');library.title='Library';const icon=document.createElement('span');icon.className='library-rail-icon';icon.innerHTML=sidebarArtwork.library;library.prepend(icon);library.addEventListener('click',event=>{if(!sidebarShouldCollapse())return;event.preventDefault();event.stopImmediatePropagation();const branch=$('#library-branch');if(branch)branch.hidden=false;library.setAttribute('aria-expanded','true');s.settings.libraryExpanded=true;setSidebarExpanded(true);},true);}
 for(const [name,label]of [['ai','O/L AI'],['progress','Activities']]){const button=nav.querySelector(`[data-nav="${name}"]`);if(button){button.setAttribute('aria-label',label);button.title=label;const icon=button.querySelector('b');if(icon){icon.className='sidebar-nav-icon';icon.innerHTML=sidebarArtwork[name==='progress'?'activities':'ai'];}}}
 const profile=$('#profile-menu');if(profile){profile.setAttribute('aria-label','Settings menu');profile.title='Settings';profile.setAttribute('aria-haspopup','menu');const avatar=profile.querySelector('.avatar');if(avatar){avatar.classList.add('settings-avatar');avatar.innerHTML=sidebarSvg('<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-2Z"/><circle cx="12" cy="12" r="3"/>');}const label=profile.querySelector('.nav-label');if(label)label.textContent='Settings';}
 const home=$('#brand-home');if(home)home.title=OMA_BRAND_NAME+' home';
 const backdrop=document.createElement('button');backdrop.id='sidebar-backdrop';backdrop.type='button';backdrop.setAttribute('aria-label','Close sidebar');backdrop.hidden=true;backdrop.addEventListener('click',closeSidebarDrawer);document.body.append(backdrop);
 if(!sidebarResizeBound){sidebarResizeBound=true;window.addEventListener('resize',()=>{if(window.innerWidth>800)document.body.classList.remove('mobile-sidebar-open');updateSidebarControls();});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('mobile-sidebar-open'))closeSidebarDrawer();});}
 updateSidebarControls();
}
