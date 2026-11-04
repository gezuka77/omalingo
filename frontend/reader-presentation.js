function readerSourceHeader(l){
 const source=safeURL(l.sourceUrl||'');let domain='';try{domain=new URL(l.sourceUrl).hostname.replace(/^www\./,'');}catch{}
 const publisher=l.publisher||domain||l.course||'Personal lesson';
 const image=omaImportSafeImage(l.imageUrl||l.image||'')||(l.youtubeId?'https://i.ytimg.com/vi/'+encodeURIComponent(l.youtubeId)+'/hqdefault.jpg':'');
 const count=C.words(l.text).length,duration=l.cues?.at(-1)?.end;
 const summary=String(l.sourceSummary||l.description||'').trim();
 return `<div class="reader-source-art">${image?`<img src="${E(image)}" alt="" referrerpolicy="no-referrer">`:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 15c8-2 15 0 22 5 7-5 14-7 22-5v34c-8-2-15 0-22 5-7-5-14-7-22-5Z M32 20v34" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>'}</div><div class="reader-source-copy"><div class="reader-source-publisher">${E(publisher)}</div><h1>${E(l.title)}</h1><div class="reader-source-facts"><span>${E(learningLanguage().name)}</span><span>${count.toLocaleString()} words</span><span>${duration?time(duration)+' audio':'About '+Math.max(1,Math.ceil(count/180))+' min read'}</span>${l.level?`<span>${E(l.level)}</span>`:''}</div>${summary?`<p class="reader-source-summary">${E(summary.slice(0,300))}${summary.length>300?'…':''}</p>`:''}${source&&source!=='#'?`<a class="reader-source-link" href="${E(source)}" target="_blank" rel="noopener noreferrer">Original source ↗</a>`:''}</div>`;
}
function followReaderPlayback(active,lesson,charStart){
 const article=active.closest('.reader-grid>article');if(!article)return;
 const parts=C.segments(lesson.text),index=Math.max(0,parts.findIndex(p=>mInside(p,charStart)));
 let upcoming=active;
 if(!s.settings.sentenceMode){const next=parts[Math.min(parts.length-1,index+3)];if(next){const candidates=[...article.querySelectorAll('#reader-text .token')];upcoming=candidates.find(el=>Number(el.dataset.start)>=next.start)||active;}}
 const rect=active.getBoundingClientRect(),nextRect=upcoming.getBoundingClientRect();
 const internal=article.scrollHeight>article.clientHeight+2;
 const bounds=internal?article.getBoundingClientRect():{top:0,bottom:innerHeight-115,height:innerHeight-115};
 const height=bounds.bottom-bounds.top,readingLine=bounds.top+height*.3;
 // Move at paragraph/sentence lead-in, leaving room for unread sentences.
 if(rect.top>bounds.top+height*.42||rect.top<bounds.top+28||nextRect.bottom>bounds.bottom-48){
  const delta=rect.top-readingLine;
  if(Math.abs(delta)<24)return;
  if(internal)article.scrollTo({top:Math.max(0,article.scrollTop+delta),left:0,behavior:'smooth'});
  else window.scrollBy({top:delta,left:0,behavior:'smooth'});
 }
}

const readerSourceMetadata=new Map();
function enrichReaderSourceHeader(l,element){
 if(!/^https?:/.test(l.sourceUrl||'')||((l.imageUrl||l.image||l.youtubeId)&&(l.sourceSummary||l.description)))return;
 let pending=readerSourceMetadata.get(l.sourceUrl);if(!pending){pending=api('/api/source-metadata',{url:l.sourceUrl}).catch(()=>null);readerSourceMetadata.set(l.sourceUrl,pending);}
 pending.then(meta=>{if(!meta||!element.isConnected||current()?.id!==l.id)return;let changed=false;
 if(!l.imageUrl&&!l.image&&!l.youtubeId&&meta.image){l.imageUrl=meta.image;changed=true;}
 if(!l.sourceSummary&&!l.description&&meta.description){l.sourceSummary=meta.description;changed=true;}
 if(changed){element.innerHTML=readerSourceHeader(l);save();}
 });
}
