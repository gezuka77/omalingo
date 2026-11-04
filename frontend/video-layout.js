/* Keep the YouTube iframe mounted: reparenting a live iframe reloads playback. */
function layoutReaderVideo(){
 const dock=$('#youtube-dock'),active=!!dock&&videoMode&&view==='library'&&current()?.id===playingLesson;
 document.body.classList.toggle('video-docked',active);
 if(!dock){$$('.reader-video-slot').forEach(el=>el.remove());return;}
 dock.hidden=!active;if(!active){$$('.reader-video-slot').forEach(el=>el.remove());return;}
 const article=$('#reader-text')?.closest('article'),panel=$('#word-panel');if(!article||!panel)return;
 if(!dock.dataset.dockingReady){
  dock.dataset.dockingReady='true';
  const frame=$('#youtube-frame')||dock.querySelector('iframe'),wrap=document.createElement('div');wrap.className='video-frame-wrap';if(frame){frame.before(wrap);wrap.append(frame);}
  const close=$('#close-video'),hide=document.createElement('button');hide.id='toggle-reader-video';hide.type='button';hide.textContent='Hide video';hide.setAttribute('aria-expanded','true');
  hide.onclick=()=>{const collapsed=dock.classList.toggle('video-collapsed');hide.textContent=collapsed?'Show video':'Hide video';hide.setAttribute('aria-expanded',String(!collapsed));wrap.inert=collapsed;focusedMeasure();};
  close?.before(hide);close?.setAttribute('aria-label','Stop original video');if(close)close.title='Stop video';
 }
 const compact=innerWidth<=1100,collapsed=dock.classList.contains('video-collapsed');
 let slot=article.parentElement.querySelector('.reader-video-slot');
 if(!slot){
  slot=document.createElement('div');
  slot.className='reader-video-slot';
  slot.setAttribute('aria-hidden','true');
  article.before(slot);
 }
 slot.classList.toggle('reader-video-rail-slot',!compact);
 const {top,left:slotLeft,width:slotWidth}=slot.getBoundingClientRect();
 if(!slotWidth){dock.hidden=true;return;}
 const sheet=compact&&innerWidth>800&&panel.classList.contains('mobile-word-sheet')?panel.getBoundingClientRect():null;
 const freeWidth=sheet?.width?Math.min(slotWidth,Math.max(0,sheet.left-slotLeft-12)):slotWidth;
 const footer=$('.persistent-player'),bottom=footer?.getBoundingClientRect().top||innerHeight-120;
 const videoLimit=compact?innerHeight*.30:Math.max(0,bottom-top-190);
 const width=Math.min(freeWidth||slotWidth,Math.max(220,Math.floor(videoLimit*16/9)));
 const left=slotLeft+((freeWidth||slotWidth)-width)/2;
 const height=44+(collapsed?0:width*9/16);
 dock.style.setProperty('left',left+'px');dock.style.setProperty('top',top+'px');dock.style.setProperty('width',width+'px');dock.style.setProperty('height',height+'px');
 document.body.style.setProperty('--reader-video-height',height+'px');document.body.style.setProperty('--reader-video-width',width+'px');
 slot.style.height=(height+12)+'px';
 if(compact)document.body.style.setProperty('--reader-video-reader-height',Math.max(innerHeight<=520?70:125,bottom-article.getBoundingClientRect().top-8)+'px');
}
window.addEventListener('resize',layoutReaderVideo);
window.addEventListener('scroll',layoutReaderVideo,{passive:true});
