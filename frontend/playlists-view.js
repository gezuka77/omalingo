function playlistLessons(p){return p.lessons.map(id=>s.lessons.find(l=>l.id===id&&!l.archived)).filter(Boolean);}
function playlistArtwork(lessons){return `<div class="playlist-artwork">${lessons.slice(0,4).map(l=>{const image=omaImportSafeImage(l.imageUrl||l.image||'')||(l.youtubeId?'https://i.ytimg.com/vi/'+encodeURIComponent(l.youtubeId)+'/hqdefault.jpg':'');return `<div>${image?`<img src="${E(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 16c7-2 13 0 20 5 7-5 13-7 20-5v32c-7-2-13 0-20 5-7-5-13-7-20-5ZM32 22v30" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>'}</div>`;}).join('')||'<div><span>＋</span></div>'}</div>`;}
function playlistFacts(lessons){const words=lessons.reduce((n,l)=>n+C.words(l.text).length,0),seconds=lessons.reduce((n,l)=>n+(l.cues?.at(-1)?.end||0),0);return lessons.length+(lessons.length===1?' lesson · ':' lessons · ')+words.toLocaleString()+(words===1?' word':' words')+(seconds?' · '+time(seconds)+' recorded audio':'');}
async function playPersonalPlaylist(p,index=0){queue=playlistLessons(p).map(l=>l.id);if(!queue.length)throw Error('Add a lesson to this playlist first.');if(shuffle&&index===0)queue.sort(()=>Math.random()-.5);queueIndex=Math.max(0,Math.min(index,queue.length-1));s.settings.queue=[...queue];save();await playLesson(queue[queueIndex],true);}
function playlistCollections(){
 const lessons=s.lessons.filter(l=>!l.archived),groups=[];
 const recent=(s.settings.recentLessons||[]).map(id=>lessons.find(l=>l.id===id)).filter(Boolean);if(recent.length)groups.push({name:'Continue listening',description:'Pick up with your recently opened lessons.',lessons:recent});
 const videos=lessons.filter(l=>l.youtubeId);if(videos.length)groups.push({name:'Videos & vlogs',description:'Original voices and stories from your video imports.',lessons:videos});
 const articles=lessons.filter(l=>l.sourceUrl&&!l.youtubeId);if(articles.length)groups.push({name:'News & articles',description:'Listen to your imported reading with the local voice.',lessons:articles});
 for(const course of [...new Set(lessons.map(l=>l.course).filter(Boolean))]){const items=lessons.filter(l=>l.course===course);if(items.length>1)groups.push({name:course,description:'Keep lessons from this course together.',lessons:items});}
 if(!groups.length&&lessons.length)groups.push({name:'My '+learningLanguage().name+' collection',description:'A listening collection from the lessons already in your library.',lessons});return groups.slice(0,4);
}
function playlists(){
 focusedLibraryTab='playlists';
 focusedNavigate('library');
}
function renderLibraryPlaylists(root){
 const collections=playlistCollections();
 root.innerHTML=`
  <div class="row between wrap">
   <h2>Saved playlists</h2>
   ${button('new-playlist','＋ New playlist')}
  </div>
  ${s.playlists.length?`<div class="focused-source-grid">${s.playlists.map(playlist=>{
   const lessons=playlistLessons(playlist);
   return `<article class="focused-saved-lesson personal-playlist-card">
    <button class="focused-saved-art playlist-cover-button" data-open-playlist="${E(playlist.id)}" aria-label="Open ${E(playlist.name)}">${playlistArtwork(lessons)}</button>
    <div><h3><button class="library-playlist-name" data-open-playlist="${E(playlist.id)}">${E(playlist.name)}</button></h3><p>${E(playlistFacts(lessons))}</p>
     <div class="saved-lesson-actions">
      <button data-play-personal="${E(playlist.id)}" ${lessons.length?'':'disabled'}>▶ Play</button>
      <button class="quiet" data-edit-playlist="${E(playlist.id)}">Edit playlist</button>
     </div>
    </div>
   </article>`;
  }).join('')}</div>`:`<div class="focused-empty"><h3>No playlists yet</h3><p>Create a playlist to listen to lessons in your preferred order.</p></div>`}
  <div class="playlist-preferences library-playlist-preferences">
   <label><input id="continuous" type="checkbox" ${continuous?'checked':''}> Continue to next lesson</label>
   <label><input id="shuffle" type="checkbox" ${shuffle?'checked':''}> Shuffle playlist</label>
  </div>
  ${collections.length?`<section>
   <div class="playlist-section-heading"><h2>Build from your lessons</h2><small>Suggested collections</small></div>
   <div class="playlist-collection-grid">${collections.map((collection,index)=>`<article class="playlist-collection">
    ${playlistArtwork(collection.lessons)}
    <div><h3>${E(collection.name)}</h3><p>${E(collection.description)}</p>
     <button data-create-collection="${index}">Make playlist ↗</button>
    </div>
   </article>`).join('')}</div>
  </section>`:''}`;
 bind('new-playlist',()=>playlistEditor());
 bind('continuous',()=>{continuous=$('#continuous').checked;s.settings.continuous=continuous;save();},'change');
 bind('shuffle',()=>{shuffle=$('#shuffle').checked;s.settings.shuffle=shuffle;save();},'change');
 root.querySelectorAll('[data-open-playlist]').forEach(b=>b.onclick=()=>playlistDetails(s.playlists.find(p=>p.id===b.dataset.openPlaylist),root));
 root.querySelectorAll('[data-edit-playlist]').forEach(b=>b.onclick=()=>playlistEditor(s.playlists.find(p=>p.id===b.dataset.editPlaylist)));
 root.querySelectorAll('[data-play-personal]').forEach(b=>b.onclick=act(()=>playPersonalPlaylist(s.playlists.find(p=>p.id===b.dataset.playPersonal))));
 root.querySelectorAll('[data-create-collection]').forEach(b=>b.onclick=()=>{
  const collection=collections[Number(b.dataset.createCollection)];
  playlistEditor(undefined,collection.lessons.map(lesson=>lesson.id),collection.name);
 });
}


function playlistDetails(p,root){
 if(!p)return renderLibraryPlaylists(root);const lessons=playlistLessons(p);root.innerHTML=`<button id="playlist-back" class="quiet">← All playlists</button><section class="playlist-detail-heading">${playlistArtwork(lessons)}<div><small>PLAYLIST</small><h1>${E(p.name)}</h1><p>${E(playlistFacts(lessons))}</p><div class="row wrap"><button id="playlist-play-all" class="primary">▶ Play playlist</button><button id="playlist-edit-detail">Edit & arrange lessons</button></div></div></section><div class="playlist-track-list">${lessons.map((l,i)=>`<article><span class="playlist-track-number">${i+1}</span><button data-playlist-track="${i}" aria-label="Play ${E(l.title)}">▶</button><button class="playlist-track-title" data-playlist-open="${E(l.id)}"><strong>${E(l.title)}</strong><small>${E(l.course||'Personal lesson')} · ${C.words(l.text).length} words</small></button><span class="muted">${l.cues?.length?time(l.cues.at(-1).end):'Local voice'}</span></article>`).join('')||'<div class="playlists-empty"><p>This playlist is ready for its first lesson.</p></div>'}</div>`;
 bind('playlist-back',()=>renderLibraryPlaylists(root));bind('playlist-play-all',()=>playPersonalPlaylist(p));bind('playlist-edit-detail',()=>playlistEditor(p));$$('[data-playlist-track]').forEach(b=>b.onclick=act(()=>playPersonalPlaylist(p,Number(b.dataset.playlistTrack))));$$('[data-playlist-open]').forEach(b=>b.onclick=()=>openLesson(b.dataset.playlistOpen));
}
