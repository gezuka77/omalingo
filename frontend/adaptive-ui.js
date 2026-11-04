/* Adaptive web patterns; existing state and actions remain shared across sizes. */
let adaptivePending=false;
function syncAdaptiveUI(){
 if(!authReady)return;
 syncLearningChrome();
 decorateMenuIcons();layoutReaderVideo();
 let nav=$('#mobile-navigation');
 if(!nav){
  nav=document.createElement('nav');nav.id='mobile-navigation';nav.setAttribute('aria-label','Main navigation');
  const paths={library:'<path d="M4 4h6v16H4zM14 4h6v16h-6z"/>',playlists:'<path d="M4 5h16M4 11h10M4 17h10m3-5 5 4-5 4z"/>',words:'<path d="M3 5h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 7v15"/>',ai:'<path d="M4 4h16v13H9l-5 4zM12 7v7M9 10h6"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'};
  nav.innerHTML=[['library','Lessons'],['playlists','Playlists'],['words','O/L Words'],['ai','O/L AI'],['more','More']].map(([key,label])=>`<button type="button" data-mobile-destination="${key}">${sidebarSvg(paths[key])}<span>${label}</span></button>`).join('');
  document.body.append(nav);
  nav.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;const key=b.dataset.mobileDestination;if(!key)return;if(key==='more'){setSidebarExpanded(true);return;}closeSidebarDrawer();parityNavigate(key);});
 }
 nav.querySelectorAll('button').forEach(b=>{const active=b.dataset.mobileDestination===view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 $('#main')?.classList.toggle('playlists-page',view==='playlists');
 const panel=$('#word-panel');
 if(panel){
  const hasWord=!!panel.querySelector('#term-meaning');panel.classList.toggle('mobile-word-sheet',hasWord||!!panel.dataset.mobileRequested);
  if((hasWord||panel.dataset.mobileRequested)&&!panel.querySelector('#close-word-sheet')){const close=document.createElement('button');close.id='close-word-sheet';close.type='button';close.innerHTML=sidebarSvg('<path d="m6 6 12 12M18 6 6 18"/>');close.setAttribute('aria-label','Close word details');close.title='Close word details';close.onclick=()=>{chosen='';anchor=null;delete panel.dataset.mobileRequested;panel.classList.remove('mobile-word-sheet');panel.dataset.mobileDismissed='true';};panel.prepend(close);delete panel.dataset.mobileDismissed;}
  if(panel.dataset.mobileDismissed)panel.classList.remove('mobile-word-sheet');
 }
 if(typeof syncFocusedChrome==='function')syncFocusedChrome();
 document.body.classList.toggle('mobile-keyboard-open',window.innerWidth<=800&&!!window.visualViewport&&window.visualViewport.height<window.innerHeight*.75);
}
const adaptiveObserver=new MutationObserver(()=>{if(adaptivePending)return;adaptivePending=true;requestAnimationFrame(()=>{adaptivePending=false;adaptiveObserver.disconnect();syncAdaptiveUI();adaptiveObserver.observe($('#main'),{childList:true,subtree:true});});});
queueMicrotask(()=>{if(authReady&&$('#main')){syncAdaptiveUI();adaptiveObserver.observe($('#main'),{childList:true,subtree:true});}});
window.addEventListener('resize',syncAdaptiveUI);window.visualViewport?.addEventListener('resize',syncAdaptiveUI);
