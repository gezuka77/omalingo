(function(root){
'use strict';
const norm=s=>String(s??'').normalize('NFC').toLocaleLowerCase('fi-FI').trim().replace(/\s+/g,' ');
function tokens(text){text=String(text);if(['ja','zh-Hant'].includes(root.OmaLanguageCode)&&typeof Intl.Segmenter==='function')return [...new Intl.Segmenter(root.OmaLanguageCode,{granularity:'word'}).segment(text)].filter(x=>x.isWordLike).map(x=>Object.assign([x.segment],{index:x.index}));return [...text.matchAll(/[\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*/gu)];}
const words=s=>tokens(s).map(x=>x[0]);
const segments=s=>{let offset=0;return (String(s).match(/[^.!?。！？\n]+(?:[.!?。！？]+|(?=\n)|$)/gu)||[]).map(text=>{const start=s.indexOf(text,offset);offset=start+text.length;return {text:text.trim(),start,end:offset};}).filter(s=>s.text);};
const uuid=()=>root.crypto?.randomUUID?.()||'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const defaults=()=>({version:2,lessons:[],words:{},positions:{},playlists:[],events:[],reviewHistory:[],settings:{fontSize:26,lineHeight:1.9,font:'Georgia',pageWidth:800,dailyGoal:20,preferSourceVideo:true,autoKnown:false,autoSave:false,autoSentence:false,autoTranslation:false,showVocabulary:true,rate:1,sessionSize:20,activity:'flashcard',timezone:'Europe/Helsinki',translationProvider:'argos',ollamaModel:'',whisperModel:'base'},audioPositions:{}});
function withoutChat(state){
 if(!state||!Object.hasOwn(state,'aiConversations'))return state;
 const {aiConversations,...library}=state;
 return library;
}
function migrate(old){const s={...defaults(),...withoutChat(old),version:2,settings:{...defaults().settings,...old?.settings}};for(const key of ['lessons','playlists','events','reviewHistory'])if(!Array.isArray(s[key]))s[key]=[];for(const key of ['words','positions','audioPositions'])if(!s[key]||typeof s[key]!=='object'||Array.isArray(s[key]))s[key]={};s.lessons=s.lessons.map(l=>({...l,course:l.course||l.subtitle||'',tags:Array.isArray(l.tags)?l.tags:[],cues:Array.isArray(l.cues)?l.cues:[],completed:!!l.completed}));const clean={};for(const [key,value]of Object.entries(s.words)){if(!value||!Number.isInteger(value.status))continue;const k=norm(key);if(['__proto__','constructor','prototype'].includes(k))continue;clean[k]={...value,term:k,status:Math.max(-1,Math.min(5,value.status)),meaning:String(value.meaning||value.meanings?.[0]?.text||''),note:String(value.note||''),tags:Array.isArray(value.tags)?value.tags:[],meanings:Array.isArray(value.meanings)?value.meanings:[{text:String(value.meaning||''),language:'en',source:'personal'}].filter(m=>m.text),encounters:Array.isArray(value.encounters)?value.encounters:[],due:value.status===5||value.status===-1?null:Number(value.due)||Date.now(),reviewStage:Number(value.reviewStage)||0,correctRun:Number(value.correctRun)||0};}s.words=clean;return s;}
function validate(s){if(!s||![1,2].includes(s.version)||!Array.isArray(s.lessons)||s.lessons.length>10000||!s.words||typeof s.words!=='object'||Array.isArray(s.words))return false;const ids=new Set();for(const l of s.lessons){if(!l||typeof l.id!=='string'||ids.has(l.id)||typeof l.title!=='string'||typeof l.text!=='string'||l.text.length>2000000)return false;ids.add(l.id);}return Object.entries(s.words).every(([k,w])=>!['__proto__','constructor','prototype'].includes(k)&&w&&Number.isInteger(w.status)&&w.status>=-1&&w.status<=5&&(!w.meaning||typeof w.meaning==='string'));}
function term(s,key,changes={},encounter){key=norm(key);if(!key||['__proto__','constructor','prototype'].includes(key))throw Error('Invalid term');const old=s.words[key]||{term:key,status:1,meaning:'',meanings:[],note:'',tags:[],encounters:[],due:Date.now(),reviewStage:0,correctRun:0,created:Date.now()};const next={...old,...changes,term:key};if(changes.meanings){next.meanings=changes.meanings.filter(m=>m.text?.trim());next.meaning=next.meanings.map(m=>m.text).join('; ');}if(changes.meaning!==undefined&&!changes.meanings)next.meanings=[{text:changes.meaning,language:'en',source:'personal'}].filter(m=>m.text);next.tags=[...new Set((next.tags||[]).map(norm).filter(Boolean))];if(encounter&&!next.encounters.some(e=>e.lessonId===encounter.lessonId&&e.sentence===encounter.sentence))next.encounters=[...next.encounters,encounter];if(next.status===5||next.status===-1)next.due=null;else if(!next.due)next.due=Date.now();s.words[key]=next;return next;}
const intervals=[1,3,7,14,30,90];
function grade(s,key,correct,{now=Date.now(),reschedule=true,activity='flashcard'}={}){const w=s.words[key];if(!w)throw Error('Unknown word');if(w.status<1||w.status>4)return w;w.correctRun=correct?(w.correctRun||0)+1:0;if(!correct){w.status=Math.max(1,w.status-1);w.reviewStage=0;w.lapses=(w.lapses||0)+1;}else if(w.correctRun>=2){w.status=Math.min(4,w.status+1);w.correctRun=0;w.reviewStage=Math.min(5,(w.reviewStage||0)+1);}if(reschedule)w.due=now+(correct?intervals[Math.max(w.status-1,w.reviewStage||0)]*86400000:600000);w.lastReviewed=now;s.reviewHistory.push({id:uuid(),term:key,correct,activity,at:now,rescheduled:reschedule,status:w.status});return w;}
function csvParse(text){const rows=[];let row=[],cell='',quoted=false;text=text.replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(!quoted&&cell==='')quoted=true;else if(quoted)quoted=false;else cell+=c;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell='';}else cell+=c;}if(quoted)throw Error('Unclosed quotation in CSV');row.push(cell);if(row.some(x=>x!==''))rows.push(row);return rows;}
const csvCell=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
function exportCSV(entries){return '\uFEFF'+[['term','phrase','tag1','tag2','meaninglanguage1','meaning1','status','notes','tags','meanings'],...entries.map(([k,w])=>[k,w.context||w.encounters?.[0]?.sentence||'',w.tags?.[0]||'',w.tags?.[1]||'','en',w.meaning,w.status,w.note,(w.tags||[]).join('|'),JSON.stringify(w.meanings||[])])].map(r=>r.map(csvCell).join(',')).join('\r\n');}
function importCSV(s,text){const rows=csvParse(text),headers=rows.shift()?.map(norm)||[];if(!headers.includes('term'))throw Error('CSV needs a term column');let count=0;for(const row of rows){const d=Object.fromEntries(headers.map((h,i)=>[h,row[i]||'']));if(!norm(d.term))continue;let meanings;try{meanings=JSON.parse(d.meanings||'null');}catch{}const status=Number(d.status);term(s,d.term,{meaning:d.meaning1||d.meaning||'',...(Array.isArray(meanings)?{meanings}:{}),note:d.notes||'',status:d.status&&Number.isInteger(status)&&status>=-1&&status<=5?status:1,tags:[...(d.tags||'').split('|'),d.tag1,d.tag2].filter(Boolean),context:d.phrase||''});count++;}return count;}
function subtitle(text){const time=s=>{const p=s.replace(',','.').split(':').map(Number);return p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+p[1];};const cues=[];for(const block of text.replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n\s*\n/)){const lines=block.split('\n'),i=lines.findIndex(l=>l.includes('-->'));if(i<0)continue;const m=lines[i].match(/((?:\d+:)?\d{2}:\d{2}[.,]\d+)\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d+)/);if(!m)continue;const t=lines.slice(i+1).join(' ').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();if(t)cues.push({start:time(m[1]),end:time(m[2]),text:t});}return {text:cues.map(c=>c.text).join('\n'),cues};}
function stats(s,now=Date.now()){const day=(t)=>new Intl.DateTimeFormat('en-CA',{timeZone:s.settings.timezone||'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));const days={};for(const e of s.events){const d=day(e.at),r=days[d]||{read:0,listening:0,reviews:0,coins:0};if(e.kind==='read')r.read+=e.amount||0;if(e.kind==='listen')r.listening+=e.amount||0;if(e.kind==='review')r.reviews+=e.amount||0;r.coins+=e.coins||0;days[d]=r;}const today=day(now),goal=s.settings.dailyGoal||20;let cursor=new Date(now),streak=0;if((days[today]?.coins||0)<goal)cursor.setDate(cursor.getDate()-1);for(let i=0;i<3660;i++){const d=day(cursor);if((days[d]?.coins||0)<goal)break;streak++;cursor.setDate(cursor.getDate()-1);}const all=Object.values(s.words);return {days,today:days[today]||{read:0,listening:0,reviews:0,coins:0},streak,known:all.filter(w=>w.status>=4).length,learning:all.filter(w=>w.status>=1&&w.status<=3).length,due:all.filter(w=>w.status>=1&&w.status<=4&&w.due<=now&&w.meaning).length};}
function event(s,kind,amount,extra={}){s.events.push({id:uuid(),kind,amount,at:Date.now(),coins:kind==='read'?amount/10:kind==='listen'?amount/12:kind==='review'?amount:0,...extra});}
function matches(s,text){const ts=tokens(text),hits=[];for(const [k,w]of Object.entries(s.words)){if(words(k).length<2||w.status===-1)continue;const phrase=words(k).map(norm);for(let i=0;i<=ts.length-phrase.length;i++)if(phrase.every((word,j)=>norm(ts[i+j][0])===word)&&!/[.!?。！？\n]/.test(text.slice(ts[i].index,ts[i+phrase.length-1].index)))hits.push({term:k,start:ts[i].index,end:ts[i+phrase.length-1].index+ts[i+phrase.length-1][0].length});}return hits;}
function selectionContext(text,term){const needle=words(term).map(norm);if(!needle.length)return '';for(const sentence of segments(text)){const tokens=words(sentence.text).map(norm);for(let i=0;i<=tokens.length-needle.length;i++)if(needle.every((word,j)=>word===tokens[i+j]))return sentence.text;}return '';}
const api={norm,words,tokens,segments,selectionContext,uuid,defaults,withoutChat,migrate,validate,term,grade,csvParse,exportCSV,importCSV,subtitle,stats,event,matches,intervals};root.OmaCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

/* Preserve the tapped media element across asynchronous speech generation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OmaAudio=api;})(globalThis,()=>{
 const silence='data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
 const primed=new WeakSet(),pending=new WeakSet();
 function prime(audio){
  if(!audio||primed.has(audio)||pending.has(audio)||audio.getAttribute('src'))return;
  audio.setAttribute('playsinline','');audio.src=silence;pending.add(audio);
  const clear=()=>{if(audio.getAttribute('src')===silence){audio.pause();audio.removeAttribute('src');}};
  try{Promise.resolve(audio.play()).then(()=>{primed.add(audio);clear();},clear).finally(()=>pending.delete(audio));}
  catch{clear();pending.delete(audio);}
 }
 async function play(audio,{isCurrent=()=>true,onBlocked=()=>{}}={}){
  if(!isCurrent())return false;
  audio.setAttribute('playsinline','');
  const source=audio.src;
  try{await audio.play();return true;}
  catch(error){
   if(error?.name!=='NotAllowedError')throw error;
   if(isCurrent()&&audio.src===source)onBlocked(async()=>{
    if(!isCurrent()||audio.src!==source)return false;
    await audio.play();return true;
   });
   return false;
  }
 }
 return {prime,play};
});

(function(root){
'use strict';
const catalog=Object.freeze([
 {id:'babla-conjugator',name:'Babla Verb Conjugator (Popup)',language:'en',kind:'conjugation',template:'https://en.bab.la/conjugation/finnish/{term}',availability:'unverified'},
 {id:'verbix',name:'Verbix Verb Conjugator (popup)',language:'en',kind:'conjugation',template:'https://www.verbix.com/finnish/verb/{term}',availability:'verified'},
 {id:'babla',name:'bab.la (popup)',language:'en',kind:'dictionary',template:'https://en.bab.la/dictionary/finnish-english/{term}',availability:'unverified'},
 {id:'sanakirja',name:'Sanakirja.org (popup)',language:'en',kind:'dictionary',template:'https://www.sanakirja.org/search.php?q={term}&l=17&l2=3',availability:'verified'},
 {id:'wiktionary',name:'Wiktionary (popup)',language:'en',kind:'dictionary',template:'https://en.wiktionary.org/wiki/{term}#Finnish',availability:'verified'},
 {id:'verbix-nouns',name:'Verbix Noun Declension (popup)',language:'en',kind:'declension',template:'https://www.verbix.com/webverbix/go.php?D1=1010&T1={term}',availability:'verified'},
 {id:'glosbe',name:'Glosbe (popup)',language:'en',kind:'dictionary',template:'https://glosbe.com/fi/en/{term}',availability:'verified'},
 {id:'kieli',name:'Kielitoimiston sanakirja',language:'fi',kind:'dictionary',template:'https://www.kielitoimistonsanakirja.fi/#/{term}',availability:'verified'},
 {id:'google',name:'Google Translate',language:'en',kind:'translation',template:'https://translate.google.com/?sl=fi&tl=en&text={term}&op=translate',availability:'unverified'}
].map(r=>Object.freeze(r)));
// "Verified" records a checked provider/lookup route, not a guarantee that a
// provider will accept every word or continue to offer the same service.
const defaultIds=Object.freeze(['babla-conjugator','verbix','babla','sanakirja']);
const placeholder=/\{term\}|%\(term\)s/g;
const kinds=new Set(['dictionary','conjugation','declension','translation']);
function normalize(resource){
 if(!resource||typeof resource!=='object'||Array.isArray(resource))return null;
 const id=typeof resource.id==='string'?resource.id.trim().toLowerCase():'';
 const name=typeof resource.name==='string'?resource.name.trim():typeof resource.label==='string'?resource.label.trim():'';
 const template=typeof resource.template==='string'?resource.template.trim():'';
 const language=resource.language||'en',kind=resource.kind||'dictionary';
 if(!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)||!name||name.length>140||/[\x00-\x1f\x7f]/.test(name)||!['en','fi'].includes(language)||!kinds.has(kind))return null;
 if(!template||template.length>4096||/[\x00-\x20\x7f]/.test(template)||!placeholder.test(template)){placeholder.lastIndex=0;return null;}placeholder.lastIndex=0;
 // Placeholders belong to the path, query, or fragment. A fixed origin is
 // required so that a selected word cannot become part of a host/credential.
 const marker='OMA_DICTIONARY_LOOKUP';let u;
 try{u=new URL(template.replace(placeholder,marker));}catch{return null;}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.host.includes(marker.toLowerCase())||u.host.includes(marker)||!u.hostname)return null;
 if(!/^(https?):\/\//i.test(template))return null;
 return {id,name,language,kind,template,availability:resource.availability==='verified'?'verified':'unverified'};
}
function validateResource(resource){return normalize(resource)!==null;}
function buildURL(resource,term){
 const r=normalize(resource);if(!r)throw Error('Use a valid http or https resource URL containing {term}.');
 if(typeof term!=='string'||!term.trim()||term.length>2000||/[\x00-\x1f\x7f]/.test(term))throw Error('Choose a word or short phrase to look up.');
 const text=term.trim().normalize('NFC'),q=r.template.indexOf('?'),hash=r.template.indexOf('#');
 const encoded=encodeURIComponent(text);
 const result=r.template.replace(placeholder,(_match,offset)=>{
   const inQuery=q>=0&&offset>q&&(hash<0||offset<hash);
   return inQuery?encoded.replace(/%20/g,'+'):encoded;
 });
 // URL parsing also catches malformed fixed portions without decoding the
 // encoded selected text back into path separators or query delimiters.
 const url=new URL(result);if(url.username||url.password||!['http:','https:'].includes(url.protocol))throw Error('Invalid dictionary URL.');
 return url.href;
}
function getResources(settings={}){
 if(root.OmaLanguageCode&&root.OmaLanguageCode!=='fi'){const code=root.OmaLanguageCode,name={en:'English',hu:'Hungarian','zh-Hant':'Chinese',ja:'Japanese'}[code]||'English';return [{id:'wiktionary',name:'Wiktionary',language:'en',kind:'dictionary',template:'https://en.wiktionary.org/wiki/{term}#'+name},{id:'google',name:'Google Translate',language:'en',kind:'translation',template:'https://translate.google.com/?sl='+ (code==='zh-Hant'?'zh-TW':code)+'&tl=en&text={term}&op=translate'},...(settings.readerCustomResources||[])];}
 const resources=catalog.map(r=>({...r})),seen=new Set(resources.map(r=>r.id));
 const custom=Array.isArray(settings?.readerCustomResources)?settings.readerCustomResources:[];
 for(const input of custom.slice(0,100)){
   const r=normalize(input);if(!r||seen.has(r.id))continue;
   // A user-defined route is never silently represented as provider-verified.
   r.availability='unverified';r.custom=true;seen.add(r.id);resources.push(r);
 }
 return resources;
}
function preferred(settings={}){
 const all=getResources(settings),byId=new Map(all.map(r=>[r.id,r])),seen=new Set();
 const ids=Array.isArray(settings?.readerDictionaryIds)?settings.readerDictionaryIds:(root.OmaLanguageCode&&root.OmaLanguageCode!=='fi'?['wiktionary','google']:defaultIds);
 return ids.slice(0,100).flatMap(id=>{if(typeof id!=='string')return [];id=id.trim().toLowerCase();if(seen.has(id)||!byId.has(id))return [];seen.add(id);return [byId.get(id)];});
}
const api={catalog,defaultIds,validateResource,buildURL,getResources,preferred};
root.OmaResources=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

/* Public publisher sources for Oma's personal media feed. No hosted lessons. */
(function(root){
'use strict';
const sources=[
 {id:'yle-uutiset',name:'Yle Uutiset',url:'https://yle.fi/rss/uutiset/tuoreimmat',kind:'news',category:'News Feed',description:'Latest Finnish news from Finland’s public broadcaster.',availability:'verified',siteUrl:'https://yle.fi/uutiset'},
 {id:'yle-selkouutiset',name:'Yle Selkouutiset',url:'https://yle.fi/rss/selkouutiset',kind:'news',category:'News Feed',description:'News in easy Finnish, with short articles and listening material.',availability:'verified',siteUrl:'https://yle.fi/selkouutiset'},
 {id:'yle-areena-uutispodcast',name:'Yle Areena · Uutispodcast',url:'https://feeds.yle.fi/areena/v1/series/1-61894955.rss',kind:'podcast',category:'Podcasts',description:'Finnish current-affairs podcast. Public podcast episodes are supplied by Yle’s RSS feed.',availability:'verified',siteUrl:'https://areena.yle.fi/podcastit/1-61894955'},
 {id:'yle-areena-tiedeykkonen',name:'Yle Areena · Tiedeykkönen',url:'https://feeds.yle.fi/areena/v1/series/1-1403833.rss',kind:'podcast',category:'Technology',description:'Finnish science and research podcast with publicly published audio episodes.',availability:'verified',siteUrl:'https://areena.yle.fi/podcastit/1-1403833'},
 {id:'finnish-language-nuggets',name:'Finnish Language Nuggets',url:'https://www.youtube.com/feeds/videos.xml?channel_id=UCmhZu3jWkW4xF3nBxlkJ84A',kind:'video',category:'Travel',description:'Finnish-language vlogs, everyday life and visits to places in Finland.',availability:'verified',siteUrl:'https://www.youtube.com/channel/UCmhZu3jWkW4xF3nBxlkJ84A'},
 {id:'suomen-kurssi',name:'Suomen kurssi',url:'https://www.youtube.com/feeds/videos.xml?channel_id=UC3HqCHmhvyJPAyUc-VVUJwQ',kind:'video',category:'Grammar',description:'Finnish teacher Minna’s Finnish lessons, reading practice and grammar videos for levels 0–B2.',availability:'verified',siteUrl:'https://www.youtube.com/channel/UC3HqCHmhvyJPAyUc-VVUJwQ'},
 {id:'yle-urheilu',name:'Yle Urheilu',url:'https://yle.fi/rss/urheilu',kind:'news',category:'Sports',description:'Finnish sports news and reporting.',availability:'verified',siteUrl:'https://yle.fi/urheilu'},
 {id:'yle-tiede',name:'Yle Tiede',url:'https://yle.fi/rss/t/18-819/fi',kind:'news',category:'Technology',description:'Science, research and technology-related reporting in Finnish.',availability:'verified',siteUrl:'https://yle.fi/aihe/tiede'},
 {id:'yle-viihde',name:'Yle Viihde',url:'https://yle.fi/rss/t/18-36066/fi',kind:'news',category:'Entertainment',description:'Finnish entertainment, television and popular-culture news.',availability:'verified',siteUrl:'https://yle.fi/t/18-36066/fi'}
];
root.OmaSourceCatalog=Object.freeze(sources.map(source=>Object.freeze(source)));
if(typeof module!=='undefined'&&module.exports)module.exports=root.OmaSourceCatalog;
})(globalThis);

const demo=[{id:'morning',title:'A quiet morning in Helsinki',subtitle:'Arki Helsingissä',icon:'☕',text:'Aamulla kaupunki on hiljainen. Minä kävelen pieneen kahvilaan. Tilaan kahvin ja tuoreen leivän. Ikkunan takana sataa vähän vettä. Tänään minulla ei ole kiire. Istun hetken ja katson ihmisiä. Sitten lähden kirjastoon. Haluan löytää uuden kirjan.',translation:'In the morning the city is quiet. I walk to a small café. I order coffee and fresh bread. Outside the window it is raining a little. Today I am not in a hurry. I sit for a moment and watch people. Then I leave for the library. I want to find a new book.',created:1},{id:'forest',title:'An afternoon in the forest',subtitle:'Pieni retki',icon:'🌲',text:'Lauantaina menemme metsään. Ilma on viileä ja aurinko paistaa. Polun vieressä kasvaa paljon puita. Kuuntelemme lintuja ja kävelemme hitaasti. Järven rannalla pidämme tauon. Minulla on mukana teetä ja voileipiä. Täällä on hyvä olla.',translation:'On Saturday we go to the forest. The air is cool and the sun is shining. Many trees grow beside the path. We listen to birds and walk slowly. We take a break by the lake. I have tea and sandwiches with me. It feels good to be here.',created:2}];
const dictionary={aamulla:'in the morning',kaupunki:'city',on:'is',hiljainen:'quiet',minä:'I',kävelen:'I walk',pieneen:'into a small',kahvilaan:'to a café',tilaan:'I order',kahvin:'a coffee',ja:'and',tuoreen:'fresh',leivän:'bread',ikkunan:'of the window',takana:'behind / outside',sataa:'it rains',vähän:'a little',vettä:'water',tänään:'today',minulla:'I have / for me',ei:'not',ole:'be',kiire:'hurry',istun:'I sit',hetken:'a moment',katson:'I watch',ihmisiä:'people',sitten:'then',lähden:'I leave',kirjastoon:'to the library',haluan:'I want',löytää:'to find',uuden:'new',kirjan:'a book',lauantaina:'on Saturday',menemme:'we go',metsään:'into the forest',ilma:'air / weather',viileä:'cool',aurinko:'sun',paistaa:'shines',polun:'of the path',vieressä:'beside',kasvaa:'grows',paljon:'a lot',puita:'trees',kuuntelemme:'we listen',lintuja:'birds',kävelemme:'we walk',hitaasti:'slowly',järven:'of the lake',rannalla:'on the shore',pidämme:'we take / hold',tauon:'a break',mukana:'with / along',teetä:'tea',voileipiä:'sandwiches',täällä:'here',hyvä:'good',olla:'to be'};
const OMA_BRAND_NAME="Oma Lingo";
const OMA_RELEASE_VERSION="0.2.8";
const OMA_SHORT_NAME="O/L";
const omaBrandMark="<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" class=\"oma-lettermark\" aria-hidden=\"true\" focusable=\"false\">\n  <rect class=\"lettermark-tile\" width=\"64\" height=\"64\" rx=\"18\" fill=\"#224a3a\"/>\n  <circle class=\"lettermark-o\" cx=\"26.6\" cy=\"28.5\" r=\"10.7\" fill=\"none\" stroke=\"#c6edda\" stroke-width=\"6.1\"/>\n  <path class=\"lettermark-l\" d=\"M39 25v16.5a4 4 0 0 0 4 4h9.5\" fill=\"none\" stroke=\"#83c1a7\" stroke-width=\"6.4\"/>\n</svg>";
const olReadingFox="<svg xmlns=\"http://www.w3.org/2000/svg\" class=\"ol-reading-fox\" viewBox=\"0 0 88 88\" aria-hidden=\"true\" focusable=\"false\">\n  <ellipse cx=\"44\" cy=\"77\" rx=\"32\" ry=\"4\" fill=\"#739181\" opacity=\".22\"/>\n  <path d=\"M54 63c9-1 14-7 17-15 8 5 12 12 10 19-3 11-16 15-28 9z\" fill=\"#ac644d\"/>\n  <path d=\"M71 48c7 4 11 9 11 15-5 1-9 0-13-4l-4 1c3-3 5-7 6-12z\" fill=\"#f0d8b7\"/>\n  <path d=\"M26 73c-2-12 3-23 15-26 14-3 24 6 23 20l-3 7z\" fill=\"#ba7357\"/>\n  <path d=\"M20 34 19 11c8 1 16 6 21 13m7 0c5-7 12-12 21-14l-2 24\" fill=\"#b36c52\" stroke=\"#b36c52\" stroke-width=\"3\" stroke-linejoin=\"round\"/>\n  <path d=\"m24 18 11 9-10 4zm38-1-11 10 10 4z\" fill=\"#efbd9c\"/>\n  <path d=\"M15 40c1-11 13-19 28-19 16 0 29 8 30 19-7 11-18 17-29 17-12 0-23-6-29-17z\" fill=\"#d98f68\"/>\n  <path d=\"M15 40c10-5 20 0 29 9 10-9 20-14 29-9-7 11-18 17-29 17-12 0-23-6-29-17z\" fill=\"#f0d8b7\"/>\n  <path d=\"M27 37c2 2 5 3 8 2m18 0c3 1 6 0 8-2\" fill=\"none\" stroke=\"#4c3832\" stroke-width=\"2.1\" stroke-linecap=\"round\"/>\n  <path d=\"M40 47q4-3 8 0-1 4-4 4t-4-4z\" fill=\"#4c3832\"/>\n  <path d=\"M23 56c8-3 15-2 21 2 6-4 13-5 21-2v8H23z\" fill=\"#f0e9d5\"/>\n  <path d=\"M21 58c9-2 17-1 23 3 6-4 14-5 23-3v17c-9-2-17-1-23 3-6-4-14-5-23-3z\" fill=\"#39705b\"/>\n  <path d=\"M44 72v5\" fill=\"none\" stroke=\"#629581\" stroke-width=\"1.4\"/>\n  <g fill=\"none\" stroke=\"#d5efe1\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n    <ellipse cx=\"33.5\" cy=\"65.5\" rx=\"4\" ry=\"4.5\"/>\n    <path d=\"m41 70 6-9m5 0v9h6\"/>\n  </g>\n  <ellipse cx=\"23\" cy=\"64\" rx=\"3.3\" ry=\"4\" fill=\"#ca8663\"/>\n  <ellipse cx=\"65\" cy=\"64\" rx=\"3.3\" ry=\"4\" fill=\"#ca8663\"/>\n</svg>";
const retiredSourceIds=new Set(["fi-gutenberg", "hu-gutenberg", "fi-loecsen", "hu-loecsen", "hu-magyarok", "zh-huayu-course", "helsingin-sanomat", "turun-sanomat", "hameen-sanomat", "uusimaa", "is-kotimaa", "is-ulkomaat", "iltalehti", "en-bbc-news", "en-topic-sports", "en-topic-technology", "en-topic-entertainment", "hu-24hu", "hu-hvg", "hu-topic-sports", "hu-topic-technology", "hu-topic-entertainment", "hu-sziszi-podcast", "zh-abby"]);
/* O/L's local application. Bundled with core.js and the original sample lessons. */
(()=>{'use strict';
const C=OmaCore,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let s=C.defaults(),revision=0,base='',connected=false,view='library',lid=null,chosen='',anchor=null,selected=new Set(),filter={},review=null,saveTimer,saveChain=Promise.resolve(),queue=[],queueIndex=0,shuffle=false,continuous=true,sleepAt=0,clipIndex=0,clips=[],playingLesson=null,readSince=Date.now(),lastTick=Date.now(),lastCue=-1;
const player=new Audio();let toastTimer;
function toast(text,kind='status'){
 clearTimeout(toastTimer);const dialog=document.querySelector('dialog[open]');let notice;
 if(dialog){notice=dialog.querySelector('#dialog-notice');if(!notice){notice=document.createElement('p');notice.id='dialog-notice';notice.className='dialog-notice';dialog.append(notice);}notice.dataset.kind=kind;notice.setAttribute('role',kind==='error'?'alert':'status');notice.textContent=text;notice.hidden=false;notice.scrollIntoView({block:'nearest'});}
 else{notice=$('#toast');if(!notice)return;notice.textContent=text;notice.setAttribute('role',kind==='error'?'alert':'status');notice.dataset.kind=kind;notice.hidden=false;}
 toastTimer=setTimeout(()=>{if(notice.isConnected)notice.hidden=true;},8000);
}
async function api(path,body,method){
 if(path==='/api/assist'&&s.settings.aiProvider==='openai'){path='/api/openai/generate';body={...body,mode:body?.mode||'explain',model:s.settings.openaiModel};}
 let response;try{response=await languageFetch(base+path,{credentials:'include',method:method||(body?'POST':'GET'),headers:{'X-Oma-User':authUser?.id||'',...(body&&!(body instanceof Blob)?{'Content-Type':'application/json'}:{})},body:body?body instanceof Blob?body:JSON.stringify(body):undefined});}catch{throw Error('O/L’s local service could not be reached. Reopen O/L with its launcher, then try again.');}
 if(response.status===401){connected=false;location.reload();throw Error('Please sign in again.');}
 const raw=await response.text();let result;try{result=JSON.parse(raw);}catch{if(!response.ok)throw Error('O/L could not complete this request ('+response.status+'). Please try again.');throw Error('O/L received an unreadable response. Refresh the app and try again.');}
 if(!response.ok)throw Error(result?.error||response.statusText||'O/L could not finish this request.');return result;
}
function save(){accountStorage.setItem('oma-reader-v2',JSON.stringify(s));accountStorage.setItem('oma-pending-v2',JSON.stringify({state:s,revision,ankiRestore:ankiRestorePending}));if($('#storage-state'))$('#storage-state').textContent='Saving locally…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush().catch(e=>toast(e.message)),500);}
function flush(){clearTimeout(saveTimer);saveChain=saveChain.catch(()=>{}).then(async()=>{const snapshot=structuredClone(s),ankiRestore=ankiRestorePending;if(!connected)throw Error('Changes are kept in this browser. Open O/L with its launcher to reconnect the local database.');const r=await api('/api/state',{state:snapshot,revision,ankiRestore},'PUT');revision=r.revision;ankiDurableWords=snapshot.words;if(ankiRestore)ankiRestorePending=false;if(r.ankiPending)queueAnkiSync();if(JSON.stringify(snapshot)===JSON.stringify(s))accountStorage.removeItem('oma-pending-v2');else accountStorage.setItem('oma-pending-v2',JSON.stringify({state:s,revision}));$('#storage-state').textContent='Saved locally';});return saveChain;}
function act(fn){return async e=>{try{await fn(e);}catch(error){toast(error.message,'error');}};}
function bind(id,fn,event='click'){const el=$('#'+id);if(el)el.addEventListener(event,act(fn));}
const button=(id,text,cls='')=>`<button id="${id}" class="${cls}">${text}</button>`;
const taglist=v=>String(v||'').split(',').map(x=>x.trim()).filter(Boolean);
const current=()=>s.lessons.find(l=>l.id===lid);
const mInside=(p,n)=>p&&n>=p.start&&n<p.end;
function cuePosition(l,index){const offset=l.cues[index]?.charStart??l.cues.slice(0,index).reduce((n,c)=>n+c.text.length+1,0);return Math.max(0,C.segments(l.text).findIndex(p=>mInside(p,offset)));}
const aiText=t=>E(t).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
const statusName=n=>({'-1':'Ignored',1:'New',2:"Can't Remember",3:'Not Sure',4:'Learned',5:'Known'})[n]||'Blue word';
const statusOptions=(value,all=false)=>(all?'<option value="">All levels</option>':'')+[-1,1,2,3,4,5].map(n=>`<option value="${n}" ${String(value)===String(n)?'selected':''}>${statusName(n)}</option>`).join('');
const answerKey=v=>C.words(v).map(C.norm).join(' ');
const time=n=>`${Math.floor((n||0)/60)}:${String(Math.floor((n||0)%60)).padStart(2,'0')}`;
function modal(title,html,setup){if($('#dialog').open)$('#dialog').close();$('#dialog').innerHTML=`<div class="row between"><h2>${E(title)}</h2><button id="close-dialog" aria-label="Close">×</button></div>${html}`;$('#dialog').showModal();bind('close-dialog',()=>$('#dialog').close());setup?.();}
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function downloadAPI(path,name,body){await flush();const r=await languageFetch(base+path,{credentials:'include',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error((await r.json()).error);download(await r.blob(),name);}
function go(v){view=v;chosen='';render();}
function legacyRender(){document.documentElement.style.setProperty('--reader-size',s.settings.fontSize+'px');$$('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));$('#breadcrumb').textContent='Your learning space / '+view[0].toUpperCase()+view.slice(1);({library:library,words:vocabulary,review:reviewPage,playlists:playlists,sources:sources,progress:progress,settings:settings,backup:backup})[view]?.();}
function legacyLibrary(){const l=current();$('#main').innerHTML=`<div class="row between"><div><p class="eyebrow">YOUR FINNISH, EVERY DAY</p><h1>${l?E(l.title):'A little more Finnish.'}</h1></div><div>${button('import','＋ Import','primary')} ${l?button('all-lessons','All lessons'):''}</div></div><div id="library-content"></div>`;bind('import',importDialog);bind('all-lessons',()=>{lid=null;library();});if(l)return reader(l);$('#library-content').innerHTML=`<div class="row wrap"><input id="lesson-search" placeholder="Search lessons, courses, tags" aria-label="Search lessons"><select id="course-filter"><option value="">All courses</option>${[...new Set(s.lessons.map(l=>l.course).filter(Boolean))].map(c=>`<option>${E(c)}</option>`).join('')}</select><select id="completion-filter"><option value="">All lessons</option><option value="open">In progress</option><option value="done">Completed</option></select></div><div class="cards" id="lesson-list"></div>`;
const list=()=>{const q=C.norm($('#lesson-search').value),course=$('#course-filter').value,done=$('#completion-filter').value;$('#lesson-list').innerHTML=s.lessons.filter(l=>(!q||C.norm(l.title+' '+l.course+' '+l.tags.join(' ')).includes(q))&&(!course||l.course===course)&&(!done||l.completed===(done==='done'))).map(l=>`<article class="lesson-card"><div class="cover">${E(l.icon||'▤')}</div><p class="eyebrow">${E(l.course||'Personal lesson')}</p><h2>${E(l.title)}</h2><p class="muted">${C.words(l.text).length} words · ${l.completed?'Completed':'In progress'}${l.media?' · Audio':''}${l.cues.length?' · Timed text':''}</p><button data-open="${E(l.id)}" class="primary">Read lesson</button></article>`).join('')||'<p>No lessons match. Import text, a book, subtitles, or a public source.</p>';$$('[data-open]').forEach(b=>b.onclick=()=>openLesson(b.dataset.open));};['lesson-search','course-filter','completion-filter'].forEach(id=>bind(id,list,id==='lesson-search'?'input':'change'));list();}
function legacyOpenLesson(id){trackRead();chosen='';anchor=null;lid=id;const source=current();for(const sentence of C.segments(source.text)){for(const k of new Set([...C.words(sentence.text).map(C.norm),...C.matches(s,sentence.text).map(m=>m.term)]))if(s.words[k])C.term(s,k,{}, {lessonId:id,sentence:sentence.text});}save();view='library';readSince=Date.now();render();}
function trackRead(){const l=current();if(!l||view!=='library'||Date.now()-readSince<5000)return;const pos=Number(s.positions[l.id]||0),seg=C.segments(l.text)[pos];if(seg){const visible=s.settings.sentenceMode?C.words(seg.text).length:$$('#reader-text .token').filter(el=>{const r=el.getBoundingClientRect(),box=$('#reader-text').getBoundingClientRect();return r.top>=Math.max(70,box.top)&&r.bottom<=Math.min(window.innerHeight-90,box.bottom);}).length;C.event(s,'read',visible||C.words(seg.text).length,{lessonId:l.id});save();}readSince=Date.now();}
function legacyReader(l){const parts=C.segments(l.text);let position=Math.max(0,Math.min(Number(s.positions[l.id]||0),parts.length-1));s.positions[l.id]=position;const sent=parts[position]?.text||l.text;const sentenceMode=!!s.settings.sentenceMode;const text=sentenceMode?sent:l.text;const ts=C.tokens(text);let cursor=0;const matches=C.matches(s,text);const markup=ts.map((m,i)=>{const before=E(text.slice(cursor,m.index));cursor=m.index+m[0].length;const word=s.words[C.norm(m[0])],phrase=matches.find(p=>m.index>=p.start&&m.index<p.end);return before+`<span tabindex="0" role="button" data-token="${i}" data-start="${m.index}" data-end="${cursor}" class="token level-${word?.status||0} ${phrase?'phrase':''}" title="${E(phrase?.term||word?.meaning||'Select word; Shift-click to select a phrase')}">${E(m[0])}</span>`;}).join('')+E(text.slice(cursor));
$('#library-content').innerHTML=`<div class="row wrap reader-toolbar">${button('listen','▶ Listen','primary')} ${button('edit-lesson','Edit lesson')} ${button('add-playlist','＋ Playlist')} ${button('complete',l.completed?'✓ Completed':'Complete lesson')} ${button('reader-options','Aa')}<label><input type="checkbox" id="sentence-mode" ${sentenceMode?'checked':''}>Sentence view</label><label><input type="checkbox" id="show-translation" ${s.settings.autoTranslation?'checked':''}>Translation</label>${button('selected-phrase','Save selected phrase')}</div><div class="reader-grid"><article><div id="reader-text" class="reader-text" style="font:${s.settings.fontSize}px/${s.settings.lineHeight} ${E(s.settings.font)};max-width:${s.settings.pageWidth}px">${markup}</div><div class="row between"><button id="prev-sentence">← Previous</button><span>${position+1} / ${parts.length} sentences</span><button id="next-sentence">Next →</button></div><div id="translation" class="translation" ${s.settings.autoTranslation?'':'hidden'}>${E(l.translation||'No translation yet.')} ${button('translate','Translate locally')}</div><div class="row wrap" style="margin-top:18px">${button('attach-audio','Attach audio')}${button('attach-subtitles','Attach timed subtitles')}${button('transcribe','Transcribe audio')}${button('sentence-practice','Sentence practice')}${button('explain','Explain passage')}${l.sourceUrl?`<a href="${E(safeURL(l.sourceUrl))}" target="_blank" rel="noopener">Original source ↗</a>`:''}${l.youtubeId?button('embed-video','Open original video'):''}</div><div id="video-holder"></div><div id="assistant-result"></div><details><summary>Sentence audio & timing</summary><div class="cue-list">${(l.cues.length?l.cues:parts.map((p,i)=>({text:p.text,index:i}))).map((c,i)=>`<button data-cue="${i}">${c.start!==undefined?time(c.start)+' · ':''}${E(c.text)}</button>`).join('')}</div></details><p class="muted">Select a word, Shift-click a second word for a phrase, or select text and choose “Save selected phrase.”</p>${sentenceMode&&s.settings.showVocabulary?'<div class="row wrap">'+[...new Set(C.words(sent).map(C.norm))].map(k=>'<button data-sentence-word="'+E(k)+'">'+E(k)+(s.words[k]?.meaning?' · '+E(s.words[k].meaning):'')+'</button>').join('')+'</div>':''}<div class="phrase-list">${matches.map(p=>`<button data-phrase="${E(p.term)}">${E(p.term)}</button>`).join('')}</div></article><aside id="word-panel" class="word-panel"><h2>Make the words yours.</h2><p class="muted">Select a word or phrase to save meanings, notes and examples.</p></aside></div>`;
$$('[data-token]').forEach(el=>{const choose=ev=>{const i=Number(el.dataset.token);let term=ts[i][0];if(ev.shiftKey&&anchor!==null){const a=ts[Math.min(i,anchor)],b=ts[Math.max(i,anchor)];term=text.slice(a.index,b.index+b[0].length);}else anchor=i;const offset=sentenceMode?parts[position].start:0;const actualIndex=parts.findIndex(p=>mInside(p,ts[i].index+offset));const actual=parts[actualIndex]?.text||sent;s.positions[l.id]=Math.max(0,actualIndex);save();if(/[.!?\n]/.test(term))return toast('Choose a phrase within one sentence.');termPanel(term,actual);};el.onclick=choose;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(e);}};});$$('[data-sentence-word]').forEach(b=>b.onclick=()=>termPanel(b.dataset.sentenceWord,sent));$$('[data-phrase]').forEach(b=>b.onclick=()=>termPanel(b.dataset.phrase,sent));
bind('selected-phrase',()=>{const selection=window.getSelection();if(!selection||!$('#reader-text').contains(selection.anchorNode)||!$('#reader-text').contains(selection.focusNode))throw Error('Select text inside the lesson first.');termPanel(selection.toString(),sent);});
bind('listen',()=>playLesson(l.id));bind('prev-sentence',()=>moveSentence(-1));bind('next-sentence',()=>moveSentence(1));bind('sentence-mode',()=>{s.settings.sentenceMode=$('#sentence-mode').checked;save();reader(l);},'change');bind('show-translation',()=>{s.settings.autoTranslation=$('#show-translation').checked;save();reader(l);},'change');bind('translate',translateLesson);bind('edit-lesson',()=>lessonEditor(l));bind('reader-options',()=>{view='settings';render();});bind('add-playlist',()=>addToPlaylist(l.id));bind('complete',()=>{trackRead();l.completed=!l.completed;let added=0;if(l.completed){l.completedAt=Date.now();C.event(s,'complete',1,{lessonId:l.id});if(s.settings.autoKnown)C.words(l.text).forEach(w=>{if(!s.words[C.norm(w)]){C.term(s,w,{status:5,autoKnownLessonId:l.id});added++;}});}else{for(const [k,w] of Object.entries(s.words))if(w.status===5&&w.autoKnownLessonId===l.id)delete s.words[k];}save();reader(l);if(l.completed)modal('Lesson complete',`<h2>${E(l.title)}</h2><p>${C.words(l.text).length} words · ${Object.values(s.words).filter(w=>w.encounters?.some(e=>e.lessonId===l.id)&&w.status>0&&w.status<5).length} saved learning terms</p><p>${added} remaining blue words marked known. Completing again toggles this state; uncompleting reverses automatically added known words.</p>${button('completion-review','Review this lesson','primary')}${button('completion-done','Done')}`,()=>{bind('completion-done',()=>$('#dialog').close());bind('completion-review',()=>{const keys=Object.entries(s.words).filter(([,w])=>w.encounters?.some(e=>e.lessonId===l.id)).map(([k])=>k);$('#dialog').close();view='review';reviewPage(keys);});});});bind('attach-audio',()=>pickFile('audio/*,video/*',async f=>{l.media=(await uploadAudio(f)).media;l.cues=[];l.alignmentVersion=0;save();toast('Audio attached.');reader(l);}));bind('attach-subtitles',()=>pickFile('.vtt,.srt',async f=>{const parsed=C.subtitle(await f.text());if(!parsed.cues.length)throw Error('No subtitle timings were found.');l.text=parsed.text;l.cues=parsed.cues;l.alignmentVersion=0;save();reader(l);}));bind('transcribe',async()=>{if(!l.media)throw Error('Attach an audio file first.');const j=await api('/api/transcribe',{media:l.media,model:s.settings.whisperModel});toast('Transcription started. The first use downloads the selected speech model.');const result=await waitJob(j.id);modal('Transcript preview',`<textarea id="transcript-preview" rows="12">${E(result.text)}</textarea>${button('apply-transcript','Use transcript','primary')}`,()=>bind('apply-transcript',()=>{l.text=$('#transcript-preview').value;l.cues=result.cues;l.alignmentVersion=0;save();$('#dialog').close();reader(l);}));});bind('embed-video',()=>{$('#video-holder').innerHTML=`<iframe title="Original lesson video" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(l.youtubeId)}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;});$$('[data-cue]').forEach(b=>b.onclick=act(async()=>{const i=Number(b.dataset.cue);s.positions[l.id]=l.cues.length?cuePosition(l,i):Math.min(i,parts.length-1);if(playingLesson!==l.id)await playLesson(l.id);if((l.media||videoMode)&&l.cues[i])seekMedia(l.cues[i].start);else if(clips.length){clipIndex=i;await loadClip();}await playMedia();save();}));bind('sentence-practice',()=>{view='review';reviewPage(undefined,true);});bind('explain',async()=>{toast('Asking your local model…');const r=await api('/api/assist',{text:sent,mode:'explain',model:s.settings.ollamaModel});$('#assistant-result').innerHTML='<div class="translation">'+aiText(r.text)+'<p class="muted">Local AI draft · verify unfamiliar grammar against a dictionary.</p></div>';});if(chosen){const context=C.selectionContext(text,chosen);if(context)termPanel(chosen,context);else{chosen='';anchor=null;}}}
function safeURL(url){try{const u=new URL(url);return /^https?:$/.test(u.protocol)?u.href:'#';}catch{return '#';}}
function moveSentence(delta){navigateReaderSentence(delta).catch(e=>toast(e.message));}
async function translateLesson(){return requestReaderTranslation(current(),true);}
function legacyTermPanel(term,context=''){term=C.norm(term);if(!term||C.words(term).length>20)return toast('Choose a word or a phrase of up to 20 words.');const changed=chosen!==term;chosen=term;const w=s.words[term]||{status:1,meaning:'',meanings:[],tags:[],note:'',encounters:[]};const target=$('#word-panel')||$('#term-editor');if(!target)return;target.innerHTML=`<p class="eyebrow">WORD & PHRASE</p><h2>${E(term)}</h2><label>Meanings, one per line<textarea id="term-meaning" rows="4">${E(w.meanings?.length?w.meanings.map(m=>m.text).join('\n'):w.meaning)}</textarea></label><label>Familiarity<select id="term-status">${statusOptions(w.status)}</select></label><label>Tags, separated by commas<input id="term-tags" value="${E(w.tags.join(', '))}"></label><label>Personal note<textarea id="term-note">${E(w.note)}</textarea></label><div class="row wrap">${button('save-term','Save','primary')}${button('pronounce-term','▶')}${button('dictionary','Dictionary')}${button('term-context-meaning','Contextual meaning')}</div><div id="definitions"></div><h3>Seen in context</h3><p>${E(context||w.context||'')}</p>${(w.encounters||[]).slice(-8).map(e=>`<p class="example">${E(e.sentence)}<br><small>${E(s.lessons.find(l=>l.id===e.lessonId)?.title||'Imported example')}</small></p>`).join('')}`;
bind('save-term',()=>{C.term(s,term,{status:Number($('#term-status').value),autoKnownLessonId:null,meanings:$('#term-meaning').value.split('\n').filter(Boolean).map(text=>({text,language:'en',source:'personal'})),note:$('#term-note').value,tags:taglist($('#term-tags').value),context},view==='library'&&current()?{lessonId:lid,sentence:context}:undefined);save();toast('Saved '+term);if(view==='library')reader(current());else{vocabulary();termDialog(term);}});bind('pronounce-term',()=>speak(term));bind('term-context-meaning',async()=>{const r=await api('/api/assist',{text:'Explain the '+learningLanguage().name+' word or phrase '+term+' in this example: '+context,mode:'explain',model:s.settings.ollamaModel});$('#definitions').innerHTML='<p>'+aiText(r.text)+'</p><small>'+E(r.provider)+' · AI draft; verify unfamiliar grammar.</small>';});bind('dictionary',async()=>{const r=await api('/api/dictionary',{term});$('#definitions').innerHTML=`<p><a href="${E(safeURL(r.url))}" target="_blank" rel="noopener">${E(r.source)}</a></p>${r.definitions.map((d,i)=>`<p>${E(d)} <button data-definition="${i}">＋</button></p>`).join('')||'<p>No entries found. Try the base form.</p>'}`;$$('[data-definition]').forEach(b=>b.onclick=()=>{$('#term-meaning').value+=($('#term-meaning').value?'\n':'')+r.definitions[Number(b.dataset.definition)];});});if(changed&&s.settings.autoPronounce)speak(term).catch(e=>toast(e.message));if(s.settings.autoSave&&!s.words[term]){C.term(s,term,{meaning:w.meaning,context},view==='library'&&current()?{lessonId:lid,sentence:context}:undefined);save();}}
function termDialog(term){modal('Vocabulary entry','<div id="term-editor"></div>',()=>termPanel(term,s.words[term]?.context));}
function entries(){return Object.entries(s.words).filter(([k,w])=>(!filter.query||C.norm(k+' '+w.meaning+' '+w.note).includes(C.norm(filter.query)))&&(!filter.status||w.status===Number(filter.status))&&(!filter.tag||w.tags.includes(filter.tag))&&(!filter.due||wordReady(w))&&(!filter.phrases||k.includes(' '))&&(!filter.lesson||(w.encounters||[]).some(e=>e.lessonId===filter.lesson))&&(!filter.course||(w.encounters||[]).some(e=>s.lessons.find(l=>l.id===e.lessonId)?.course===filter.course))).sort((a,b)=>filter.sort==='level'?a[1].status-b[1].status:filter.sort==='due'?(a[1].due||Infinity)-(b[1].due||Infinity):a[0].localeCompare(b[0],'fi'));}
function legacyVocabulary(){const rows=entries();$('#main').innerHTML=`<div class="row between"><div><p class="eyebrow">YOUR GROWING FINNISH</p><h1>Words & phrases</h1></div>${button('new-term','＋ Add term','primary')}</div><div class="row wrap"><input id="word-query" placeholder="Search words, meanings, notes" value="${E(filter.query||'')}"><select id="word-status">${statusOptions(filter.status,true)}</select><select id="word-tag"><option value="">All tags</option>${[...new Set(Object.values(s.words).flatMap(w=>w.tags))].map(t=>`<option ${filter.tag===t?'selected':''}>${E(t)}</option>`).join('')}</select><select id="word-lesson"><option value="">All lessons</option>${s.lessons.map(l=>`<option value="${E(l.id)}" ${filter.lesson===l.id?'selected':''}>${E(l.title)}</option>`).join('')}</select><select id="word-course"><option value="">All courses</option>${[...new Set(s.lessons.map(l=>l.course).filter(Boolean))].map(c=>`<option ${filter.course===c?'selected':''}>${E(c)}</option>`).join('')}</select><select id="word-sort"><option value="alpha">Alphabetical</option><option value="level" ${filter.sort==='level'?'selected':''}>Familiarity</option><option value="due" ${filter.sort==='due'?'selected':''}>Review due</option></select><label><input id="word-due" type="checkbox" ${filter.due?'checked':''}>Due</label><label><input id="word-phrases" type="checkbox" ${filter.phrases?'checked':''}>Phrases only</label></div><div class="row wrap actions">${button('select-all','Select filtered')} ${button('clear-selection','Clear selection')}<span>${selected.size} selected / ${rows.length} shown</span>${button('bulk','More actions')}${button('review-selection','Review selected')}${button('csv-export','CSV export')}${button('csv-import','CSV import')}${button('anki-export','Anki deck')}${button('print-words','Print')}</div><div class="table-scroll"><table><thead><tr><th></th><th>Term</th><th>Meaning</th><th>Level</th><th>Tags</th><th>Next review</th></tr></thead><tbody>${rows.map(([k,w])=>`<tr><td><input type="checkbox" data-select="${E(k)}" ${selected.has(k)?'checked':''} aria-label="Select ${E(k)}"></td><td><button data-edit="${E(k)}">${E(k)}</button></td><td>${E(w.meaning)}</td><td>${statusName(w.status)}</td><td>${E(w.tags.join(', '))}</td><td>${w.due&&w.status>0&&w.status<5?new Date(w.due).toLocaleDateString():'—'}</td></tr>`).join('')}</tbody></table></div>`;
const change=()=>{filter={query:$('#word-query').value,status:$('#word-status').value,tag:$('#word-tag').value,lesson:$('#word-lesson').value,course:$('#word-course').value,sort:$('#word-sort').value,due:$('#word-due').checked,phrases:$('#word-phrases').checked};vocabulary();};['word-query','word-status','word-tag','word-lesson','word-course','word-sort','word-due','word-phrases'].forEach(id=>bind(id,change,'change'));$$('[data-select]').forEach(b=>b.onchange=()=>{b.checked?selected.add(b.dataset.select):selected.delete(b.dataset.select);vocabulary();});$$('[data-edit]').forEach(b=>b.onclick=()=>termDialog(b.dataset.edit));bind('new-term',()=>modal('Add a word or phrase','<input id="new-term-text" placeholder="Word or phrase">'+button('create-term','Continue','primary'),()=>bind('create-term',()=>{const term=$('#new-term-text').value;$('#dialog').close();termDialog(term);})));bind('select-all',()=>{rows.forEach(([k])=>selected.add(k));vocabulary();});bind('clear-selection',()=>{selected.clear();vocabulary();});bind('bulk',bulkDialog);bind('review-selection',()=>{view='review';reviewPage([...selected]);});bind('csv-export',()=>download(new Blob([C.exportCSV((selected.size?Object.entries(s.words).filter(([k])=>selected.has(k)):rows))],{type:'text/csv;charset=utf-8'}),'Oma-Lingo-vocabulary.csv'));bind('csv-import',()=>pickFile('.csv',async f=>{const count=C.importCSV(s,await f.text());save();vocabulary();toast(count+' entries imported.');}));bind('anki-export',()=>downloadAPI('/api/anki','Oma-Lingo-'+activeStudyLanguage+'.apkg',{terms:(selected.size?Object.entries(s.words).filter(([k])=>selected.has(k)):rows).map(([term,w])=>({...w,term}))}));bind('print-words',()=>{const rows=selected.size?Object.entries(s.words).filter(([k])=>selected.has(k)):entries();$('#print-sheet')?.remove();const sheet=document.createElement('section');sheet.id='print-sheet';sheet.innerHTML='<h1>O/L vocabulary</h1><table><thead><tr><th>Term</th><th>Meaning</th><th>Context & notes</th></tr></thead><tbody>'+rows.map(([k,w])=>'<tr><td>'+E(k)+'</td><td>'+E(w.meaning)+'</td><td>'+E((w.context||'')+' '+w.note)+'</td></tr>').join('')+'</tbody></table>';document.body.append(sheet);document.body.classList.add('printing-vocab');window.print();});}
function bulkDialog(){if(!selected.size)throw Error('Select terms first.');modal('Update '+selected.size+' selected terms',`<label>Action<select id="bulk-action"><option value="status">Set familiarity</option><option value="increase">Increase familiarity</option><option value="decrease">Decrease familiarity</option><option value="tag">Add tag</option><option value="untag">Remove tag</option><option value="reviewed">Mark reviewed today</option><option value="delete">Delete entries</option></select></label><label>Familiarity<select id="bulk-status">${statusOptions(1)}</select></label><label>Tag<input id="bulk-tag"></label>${button('apply-bulk','Apply','primary')}`,()=>bind('apply-bulk',()=>{const action=$('#bulk-action').value,tag=C.norm($('#bulk-tag').value);if(action==='delete'&&!confirm('Delete '+selected.size+' vocabulary entries?'))return;for(const k of selected){const w=s.words[k];if(!w)continue;if(action==='delete'){delete s.words[k];continue;}if(action==='status')C.term(s,k,{status:Number($('#bulk-status').value)});if(action==='increase'||action==='decrease')C.term(s,k,{status:Math.max(1,Math.min(5,w.status+(action==='increase'?1:-1)))});if(action==='tag'&&tag)C.term(s,k,{tags:[...w.tags,tag]});if(action==='untag')C.term(s,k,{tags:w.tags.filter(t=>t!==tag)});if(action==='reviewed'){w.lastReviewed=Date.now();w.due=Date.now()+86400000;}}save();$('#dialog').close();vocabulary();}));}
function legacyReviewPage(keys,sentenceMode=false){
 if(review)return reviewCard();
 $('#main').innerHTML=`<p class="eyebrow">A LITTLE PRACTICE</p><h1>Bring the words back.</h1><div class="panel narrow"><label>Material<select id="review-material"><option value="vocabulary">Saved words & phrases</option><option value="sentences" ${sentenceMode?'selected':''}>Lesson sentences</option></select></label><label>Activity<select id="review-type">${['flashcard','reverse','cloze','multiple-choice','dictation','matching','unscramble','speaking'].map(v=>`<option ${s.settings.activity===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Vocabulary<select id="review-scope"><option value="due">Due for review</option><option value="all">All learning words</option>${keys?.length?'<option value="selected" selected>Selected words</option>':''}</select></label><label>Session size<input type="number" id="review-size" min="1" max="100" value="${s.settings.sessionSize}"></label><label><input type="checkbox" id="review-reschedule" checked> Update next review dates</label><label><input type="checkbox" id="review-shuffle" checked> Shuffle</label><label><input type="checkbox" id="review-autospeak"> Speak each question automatically</label><fieldset><legend>Show on card back</legend><label><input type="checkbox" id="review-notes" checked> Notes</label><label><input type="checkbox" id="review-tags" checked> Tags</label><label><input type="checkbox" id="review-status"> Familiarity</label></fieldset><p class="muted">Two correct answers raise word familiarity. Mistakes return in 10 minutes. Successful word reviews are spaced over 1–90 days. Known and ignored words are excluded. Sentence practice uses the open lesson, or all lessons, with sentence translations where available.</p>${button('start-review','Start review','primary')}</div>`;
 bind('start-review',()=>{const scope=$('#review-scope').value,material=$('#review-material').value;let items=s.words;
 if(material==='sentences'){items={};for(const l of (current()?[current()]:s.lessons)){const texts=C.segments(l.text),translations=C.segments(l.translation||'');texts.forEach((p,i)=>items[p.text]={term:p.text,meaning:texts.length===translations.length?translations[i]?.text||'':l.sentenceTranslations?.[p.text]||'',context:p.text,status:1,due:0,lessonId:l.id});}}
 let terms=Object.entries(items).filter(([k,w])=>material==='sentences'||w.status>=1&&w.status<=4&&w.meaning&&(scope!=='due'||w.due<=Date.now())&&(scope!=='selected'||keys?.includes(k))).map(([k])=>k);
 if($('#review-shuffle').checked)terms.sort(()=>Math.random()-.5);terms=terms.slice(0,Math.max(1,Math.min(100,Number($('#review-size').value)||20)));
 if(!terms.length)throw Error('No eligible words. Save meanings and choose All learning words, or import a lesson for sentence practice.');s.settings.activity=$('#review-type').value;s.settings.sessionSize=Number($('#review-size').value);
 review={terms,items,index:0,type:s.settings.activity,material,reschedule:$('#review-reschedule').checked,autospeak:$('#review-autospeak').checked,cardFields:['notes','tags','status'].filter(k=>$('#review-'+k).checked),skips:0,results:[],retries:new Set(),graded:false};save();reviewCard();});}
function legacyReviewCard(){const r=review;if(r.index>=r.terms.length){$('#main').innerHTML=`<p class="eyebrow">SESSION COMPLETE</p><h1>${r.results.filter(x=>x.correct).length} / ${r.results.length} correct</h1><p>${r.skips||0} skipped</p><div class="panel">${r.results.map(x=>`<p>${x.correct?'✓':'↻'} ${E(x.term)}</p>`).join('')}</div>${button('finish-review','Finish','primary')}`;bind('finish-review',()=>{review=null;reviewPage();});return;}r.graded=false;const term=r.terms[r.index],w=r.items[term],type=r.type;const context=w.context||w.encounters?.[0]?.sentence||term;const cloze=context.replace(new RegExp('(?<![\\p{L}\\p{M}])'+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{M}])','giu'),'_____');$('#main').innerHTML=`<div class="row between"><p class="eyebrow">${E(type)} · ${r.index+1} / ${r.terms.length}</p>${button('exit-review','End session')}</div><div class="review-card"><h1>${E(['reverse','unscramble','speaking'].includes(type)?w.meaning||'Listen and rebuild or say the sentence.':type==='cloze'?cloze:type==='dictation'?'Listen and type what you hear':term)}</h1><p id="review-hint" class="muted"></p>${r.material==='sentences'&&!w.meaning?button('review-translate','Translate this sentence'):''}<div id="activity"></div><div id="review-feedback" role="status"></div><div class="row wrap">${button('review-audio','▶ Listen')}${button('skip-review','Skip')}</div></div>`;
bind('review-translate',async()=>{const translated=await api('/api/translate',{text:term,provider:s.settings.translationProvider,model:s.settings.ollamaModel});w.meaning=translated.text;const source=s.lessons.find(l=>l.id===w.lessonId);if(source){source.sentenceTranslations=source.sentenceTranslations||{};source.sentenceTranslations[term]=translated.text;}save();reviewCard();});const area=$('#activity');const answer=(correct,detail='')=>{if(r.graded)return;r.graded=true;if(r.material==='sentences')s.reviewHistory.push({id:C.uuid(),term,correct,activity:type,at:Date.now(),material:'sentence',lessonId:w.lessonId});else if(!ankiWordLinked(w))C.grade(s,term,correct,{reschedule:r.reschedule,activity:type});C.event(s,'review',1);r.results.push({term,correct});if(!correct&&!r.retries.has(term)){r.retries.add(term);r.terms.push(term);}save();$('#review-feedback').innerHTML=`<p class="${correct?'success':'error'}">${correct?'✓ Correct':'Keep practising'} · ${E(term)} — ${E(w.meaning)} ${E(detail)}</p>${button('next-review','Continue','primary')}`;bind('next-review',()=>{r.index++;reviewCard();});};
if(type==='flashcard'||type==='reverse'){area.innerHTML=`<div id="review-answer" hidden><h2>${E(type==='reverse'?term:w.meaning)}</h2><p>${E(context)}</p>${r.cardFields?.includes('notes')?'<p>'+E(w.note)+'</p>':''}${r.cardFields?.includes('tags')?'<p>'+E(w.tags?.join(', '))+'</p>':''}${r.cardFields?.includes('status')?'<p>'+E(statusName(w.status))+'</p>':''}</div>${button('reveal','Reveal answer','primary')}<div id="self-grade" hidden>${button('wrong','Again')}${button('correct','Got it','primary')}</div>`;bind('reveal',()=>{$('#review-answer').hidden=false;$('#self-grade').hidden=false;$('#reveal').hidden=true;});bind('wrong',()=>answer(false));bind('correct',()=>answer(true));}
else if(type==='multiple-choice'){const seenMeanings=new Set([w.meaning]);const others=Object.entries(r.items).filter(([k,v])=>{if(k===term||!v.meaning||seenMeanings.has(v.meaning))return false;seenMeanings.add(v.meaning);return true;}).sort(()=>Math.random()-.5).slice(0,3);if(!others.length){area.innerHTML='<p>Add at least one other word with a meaning to use multiple choice.</p>';}else{const options=[w.meaning,...others.map(([,v])=>v.meaning)].sort(()=>Math.random()-.5);area.innerHTML=options.map((v,i)=>button('choice-'+i,E(v))).join(' ');options.forEach((v,i)=>bind('choice-'+i,()=>answer(v===w.meaning)));}}
else if(type==='matching'){const seenMeanings=new Set([w.meaning]);const group=[term,...Object.keys(r.items).filter(k=>{const v=r.items[k];if(k===term||!v.meaning||v.status<1||v.status>4||seenMeanings.has(v.meaning))return false;seenMeanings.add(v.meaning);return true;}).sort(()=>Math.random()-.5).slice(0,3)];const meanings=[...group].sort(()=>Math.random()-.5);let left=null,matched=new Set(),mistakes=false;area.innerHTML=`<div class="match-grid"><div>${group.map((k,i)=>button('left-'+i,E(k))).join('')}</div><div>${meanings.map((k,i)=>button('right-'+i,E(r.items[k].meaning))).join('')}</div></div>`;group.forEach((k,i)=>bind('left-'+i,()=>{left=k;$$('.match-grid button').forEach(b=>b.classList.remove('picked'));$('#left-'+i).classList.add('picked');}));meanings.forEach((k,i)=>bind('right-'+i,()=>{if(!left||matched.has(left))return;if(left===k){matched.add(k);$('#right-'+i).disabled=true;$('#left-'+group.indexOf(k)).disabled=true;left=null;if(matched.size===group.length)answer(!mistakes);}else{mistakes=true;$('#review-hint').textContent='Try another meaning.';}}));}
else if(type==='unscramble'){const pieces=C.words(term).length>1?C.words(term):Array.from(term);let built=[];area.innerHTML=`<p id="built-answer"></p><div>${pieces.map((v,i)=>({v,i})).sort(()=>Math.random()-.5).map(({v,i})=>`<button data-piece="${i}">${E(v)}</button>`).join('')}</div>${button('reset-pieces','Reset')}${button('check-pieces','Check','primary')}`;$$('[data-piece]').forEach(b=>b.onclick=()=>{built.push(pieces[Number(b.dataset.piece)]);b.disabled=true;$('#built-answer').textContent=built.join(C.words(term).length>1?' ':'');});bind('reset-pieces',()=>{built=[];$('#built-answer').textContent='';$$('[data-piece]').forEach(b=>b.disabled=false);});bind('check-pieces',()=>answer(answerKey(built.join(C.words(term).length>1?' ':''))===answerKey(term)));}
else{area.innerHTML=`${type==='cloze'?`<p>${E(w.meaning)}</p>`:''}<input id="typed-answer" autocomplete="off" placeholder="Your answer">${button('check-answer','Check','primary')}${type==='speaking'?button('record-answer','🎙 Record answer'):''}`;bind('check-answer',()=>answer(answerKey($('#typed-answer').value)===answerKey(term)));bind('typed-answer',e=>{if(e.key==='Enter')$('#check-answer').click();},'keydown');if(type==='speaking')bind('record-answer',()=>{const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition)throw Error('Speech recognition is unavailable in this browser. Type your answer, or use Edge/Chrome with microphone access.');if(!confirm('Use this browser’s speech recognition? It may send microphone audio to its speech service.'))return;const recognition=new Recognition();recognition.lang='fi-FI';recognition.onresult=e=>{$('#typed-answer').value=e.results[0][0].transcript;};recognition.onerror=e=>toast('Speech recognition: '+e.error);recognition.start();});}
bind('review-audio',()=>speak(term));bind('skip-review',()=>{r.skips++;s.reviewHistory.push({id:C.uuid(),term,at:Date.now(),activity:type,skipped:true});save();r.index++;reviewCard();});bind('exit-review',()=>{review=null;reviewPage();});if(type==='dictation'||r.autospeak)speak(term).catch(e=>toast(e.message));}
function playlists(){const list=s.playlists;$('#main').innerHTML=`<div class="row between"><div><p class="eyebrow">YOUR LISTENING SPACE</p><h1>Playlists</h1></div>${button('new-playlist','＋ New playlist','primary')}</div><div id="playlists">${list.map(p=>`<section class="panel"><div class="row between"><h2>${E(p.name)}</h2><div><button data-playlist-play="${E(p.id)}">▶ Play</button><button data-playlist-edit="${E(p.id)}">Edit</button></div></div><ol>${p.lessons.map(id=>`<li>${E(s.lessons.find(l=>l.id===id)?.title||'Missing lesson')}</li>`).join('')}</ol></section>`).join('')||'<p>Create a playlist, then add lessons from the reader.</p>'}</div><label><input id="continuous" type="checkbox" ${continuous?'checked':''}> Continue to next lesson</label><label><input id="shuffle" type="checkbox" ${shuffle?'checked':''}> Shuffle when starting a playlist</label>`;bind('new-playlist',()=>playlistEditor());bind('continuous',()=>{continuous=$('#continuous').checked;s.settings.continuous=continuous;save();},'change');bind('shuffle',()=>{shuffle=$('#shuffle').checked;s.settings.shuffle=shuffle;save();},'change');$$('[data-playlist-edit]').forEach(b=>b.onclick=()=>playlistEditor(s.playlists.find(p=>p.id===b.dataset.playlistEdit)));$$('[data-playlist-play]').forEach(b=>b.onclick=act(async()=>{const p=s.playlists.find(p=>p.id===b.dataset.playlistPlay);queue=p.lessons.filter(id=>s.lessons.some(l=>l.id===id));if(shuffle)queue.sort(()=>Math.random()-.5);if(!queue.length)throw Error('This playlist is empty.');queueIndex=0;s.settings.queue=queue;save();await playLesson(queue[0],true);}));}
function playlistEditor(p,initialIds=[],suggestedName='My playlist'){const draft=p?structuredClone(p):{id:C.uuid(),name:suggestedName,lessons:[...new Set(initialIds)]};const draw=()=>modal('Edit playlist',`<label>Name<input id="playlist-name" value="${E(draft.name)}"></label><div>${draft.lessons.map((id,i)=>`<div class="row between"><span>${E(s.lessons.find(l=>l.id===id)?.title||id)}${s.lessons.some(l=>l.id===id&&l.archived)?' · Archived':''}</span><div><button data-up="${i}" aria-label="Move up">↑</button><button data-down="${i}" aria-label="Move down">↓</button><button data-remove="${i}">Remove</button></div></div>`).join('')}</div><label>Add lesson<select id="playlist-lesson">${s.lessons.filter(l=>!l.archived&&!draft.lessons.includes(l.id)).map(l=>`<option value="${E(l.id)}">${E(l.title)}</option>`).join('')}</select></label>${button('playlist-add','Add lesson')}${button('playlist-save','Save playlist','primary')}${p?button('playlist-delete','Delete playlist'):''}`,()=>{const capture=()=>draft.name=$('#playlist-name').value;$$('[data-up],[data-down],[data-remove]').forEach(b=>b.onclick=()=>{capture();const i=Number(b.dataset.up??b.dataset.down??b.dataset.remove);if(b.dataset.remove!==undefined)draft.lessons.splice(i,1);else{const j=i+(b.dataset.up!==undefined?-1:1);if(j>=0&&j<draft.lessons.length)[draft.lessons[i],draft.lessons[j]]=[draft.lessons[j],draft.lessons[i]];}draw();});bind('playlist-add',()=>{capture();const id=$('#playlist-lesson').value;if(id)draft.lessons.push(id);draw();});bind('playlist-save',()=>{capture();if(!draft.name.trim())throw Error('Enter a playlist name.');if(p)s.playlists=s.playlists.map(x=>x.id===p.id?draft:x);else s.playlists.push(draft);save();$('#dialog').close();playlists();});bind('playlist-delete',()=>{if(confirm('Delete this playlist? Lessons stay in your library.')){s.playlists=s.playlists.filter(x=>x.id!==p.id);save();$('#dialog').close();playlists();}});});draw();}
function addToPlaylist(id){if(!s.playlists.length)return playlistEditor(undefined,[id]);modal('Add to playlist',`<select id="choose-playlist">${s.playlists.map(p=>`<option value="${E(p.id)}">${E(p.name)}</option>`).join('')}</select>${button('confirm-playlist','Add','primary')}`,()=>bind('confirm-playlist',()=>{const p=s.playlists.find(p=>p.id===$('#choose-playlist').value);if(!p.lessons.includes(id))p.lessons.push(id);save();$('#dialog').close();toast('Added to '+p.name);}));}
let youtube=null,youtubePromise=null,videoMode=false,lessonPlaybackVersion=0,lessonQueuePlayback=false,lessonPlaybackSuspended=false,finishVideoStartup=null;
const mediaTime=()=>videoMode?youtube?.getCurrentTime?.()||0:player.currentTime;
const mediaDuration=()=>videoMode?youtube?.getDuration?.()||0:player.duration;
const mediaPlaying=()=>videoMode?youtube?.getPlayerState?.()===1:!player.paused&&!player.ended;
function pauseMedia(){if(videoMode)youtube?.pauseVideo?.();else player.pause();}
function playMedia(){if(document.hidden||lessonPlaybackSuspended||view!=='library'||!playingLesson||lid!==playingLesson)return Promise.resolve();if(videoMode){youtube?.playVideo?.();return Promise.resolve();}const version=lessonPlaybackVersion;return playAudioElement(player,()=>version===lessonPlaybackVersion&&!document.hidden&&!lessonPlaybackSuspended&&view==='library'&&lid===playingLesson);}
function seekMedia(n){if(videoMode)youtube?.seekTo?.(Math.max(0,n),true);else player.currentTime=Math.max(0,n);}
async function youtubeAPI(){if(window.YT?.Player)return;if(!youtubePromise)youtubePromise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{youtubePromise=null;reject(Error('YouTube could not load. Turn off original-video playback in Settings to use local Harri speech.'));},15000);window.onYouTubeIframeAPIReady=()=>{clearTimeout(timer);resolve();};const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{clearTimeout(timer);youtubePromise=null;reject(Error('YouTube is unavailable. Use local speech instead.'));};document.head.append(script);});await youtubePromise;}
async function startVideo(lesson,version){
 try{await youtubeAPI();}catch(error){if(version===lessonPlaybackVersion)throw error;return;}
 if(version!==lessonPlaybackVersion)return;
 const dock=document.createElement('section');
 dock.id='youtube-dock';
 dock.innerHTML='<div class="row between"><strong>Original YouTube video</strong><button id="close-video" aria-label="Close video">×</button></div><div id="youtube-frame"></div>';
 document.body.append(dock);
 bind('close-video',()=>{stopLessonPlayback();syncAdaptiveUI();});
 videoMode=true;
 clips=[];
 layoutReaderVideo();
 $('#player-title').textContent=lesson.title;
 $('#player-source').textContent='Original video · '+(lesson.publisher||'YouTube');
 await new Promise((resolve,reject)=>{
  const finish=error=>{clearTimeout(timer);if(finishVideoStartup===finish)finishVideoStartup=null;error?reject(error):resolve();};
  const timer=setTimeout(()=>finish(Error('The video is not ready. Try its on-screen Play button or use local speech in Settings.')),20000);
  finishVideoStartup=finish;
  youtube=new YT.Player('youtube-frame',{width:'100%',height:203,videoId:lesson.youtubeId,playerVars:{origin:location.origin,playsinline:1,rel:0},events:{
   onReady:e=>{
    if(version!==lessonPlaybackVersion)return;
    e.target.setPlaybackRate(s.settings.rate);
    e.target.seekTo(s.audioPositions[lesson.id]||0,true);
    if(!document.hidden&&!lessonPlaybackSuspended)e.target.playVideo();
    finish();
   },
   onStateChange:e=>{
    if(version!==lessonPlaybackVersion)return;
    if(e.data===1&&document.hidden){e.target.pauseVideo();return;}
    $('#player-play').textContent=e.data===1?'Ⅱ':'▶';
    if(e.data===0){if(player.loop){e.target.seekTo(0,true);e.target.playVideo();}else player.onended();}
   },
   onError:()=>finish(Error('The source video cannot be embedded. Open its original link or turn off original-video playback to use local speech.'))
  }});
 });
}
const pronunciation=new Audio();
function clearAudioPlaybackPrompt(){document.getElementById('audio-playback-prompt')?.remove();}
function playAudioElement(audio,isCurrent=()=>true){
 return OmaAudio.play(audio,{isCurrent,onBlocked:retry=>{
  clearAudioPlaybackPrompt();
  const box=document.createElement('section');box.id='audio-playback-prompt';box.setAttribute('role','status');
  box.style.cssText='position:fixed;z-index:10000;left:16px;right:16px;bottom:calc(90px + env(safe-area-inset-bottom));max-width:390px;margin:auto;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--focused-panel,#fff);color:var(--ink);box-shadow:0 8px 30px #0003';
  box.innerHTML='<p style="margin:0 0 12px">Audio is ready. Tap to play.</p><div class="row wrap"><button class="primary" data-audio-retry>Play audio</button><button data-audio-dismiss>Dismiss</button></div>';
  (document.querySelector('dialog[open]')||document.body).append(box);
  box.querySelector('[data-audio-dismiss]').onclick=()=>box.remove();
  box.querySelector('[data-audio-retry]').onclick=async()=>{
   const button=box.querySelector('[data-audio-retry]');button.disabled=true;
   try{await retry();box.remove();}
   catch{box.querySelector('p').textContent='Audio could not start. Tap Play audio to try again.';button.disabled=false;}
  };
  audio.addEventListener('playing',()=>box.remove(),{once:true});
 }});
}
let pronunciationRequest=0;
function pauseBackgroundPlayback(){
 lessonPlaybackSuspended=true;
 ++pronunciationRequest;
 if(pronunciation){pronunciation.onended=null;pronunciation.pause();}
 if(!playingLesson)return;
 if(!clips.length&&mediaDuration()>0)s.audioPositions[playingLesson]=mediaTime();
 pauseMedia();
 save();
}
async function speak(text){
 clearAudioPlaybackPrompt();
 const request=++pronunciationRequest;
 if(pronunciation){pronunciation.onended=null;pronunciation.pause();}
 const resume=mediaPlaying();pauseMedia();
 OmaAudio.prime(pronunciation);
 const rate=Number(s.settings.rate)||1;
 const r=await api('/api/tts',{text:text.slice(0,20000),speed:rate});
 if(request!==pronunciationRequest)return;
 pronunciation.src=languageURL(r.url);
 pronunciation.generatedRate=r.nativeRate||1;
 pronunciation.defaultPlaybackRate=rate/pronunciation.generatedRate;
 pronunciation.playbackRate=rate/pronunciation.generatedRate;
 pronunciation.preservesPitch=true;
 pronunciation.onended=()=>{if(request===pronunciationRequest&&resume)playMedia().catch(e=>toast(e.message));};
 await playAudioElement(pronunciation,()=>request===pronunciationRequest&&!document.hidden);
}

function stopLessonPlayback(){
 clearAudioPlaybackPrompt();
 ++lessonPlaybackVersion;
 ++pronunciationRequest;
 player.paceRequest=(player.paceRequest||0)+1;
 if(pronunciation){pronunciation.onended=null;pronunciation.pause();}
 finishVideoStartup?.();
 if(playingLesson&&!clips.length&&mediaDuration()>0){
  const ended=videoMode?youtube?.getPlayerState?.()===0:player.ended;
  const position=ended?0:mediaTime();
  if(s.audioPositions[playingLesson]!==position){s.audioPositions[playingLesson]=position;save();}
 }
 pauseMedia();
 youtube?.destroy?.();
 youtube=null;
 videoMode=false;
 playingLesson=null;
 lessonQueuePlayback=false;
 clips=[];
 readerSentenceRange=null;
 $('#youtube-dock')?.remove();
 player.onloadedmetadata=null;
 if(player.hasAttribute('src')){player.removeAttribute('src');player.load();}
 if($('#player-play'))$('#player-play').textContent='▶';
}
async function playLesson(id,keepQueue=false){
 const lesson=s.lessons.find(item=>item.id===id);
 if(!lesson)throw Error('Lesson not found.');
 if(view!=='library'||lid!==id)openLesson(id);
 stopLessonPlayback();
 OmaAudio.prime(player);
 const version=lessonPlaybackVersion;
 playingLesson=id;
 lessonPlaybackSuspended=false;
 lessonQueuePlayback=keepQueue;
 player.generatedRate=1;
 player.generatedProvider='';
 syncAdaptiveUI();
 lastCue=-1;
 clipIndex=0;
 if(!keepQueue){queue=[id];queueIndex=0;}
 const originalVideo=lesson.youtubeId&&s.settings.preferSourceVideo!==false;
 if((lesson.media||originalVideo)&&lesson.alignmentVersion!==1)await ensureLessonAlignment(lesson);
 if(version!==lessonPlaybackVersion)return;
 if(originalVideo&&!lesson.media)return startVideo(lesson,version);
 $('#player-title').textContent=lesson.title;
 $('#player-source').textContent=lesson.media?'Original attached audio':'Preparing speech…';
 if(lesson.media){
  player.onloadedmetadata=()=>{if(version===lessonPlaybackVersion)player.currentTime=Math.min(s.audioPositions[id]||0,Math.max(0,player.duration-1));};
  player.src=base+'/media/'+lesson.media;
 }else{
  clips=C.segments(lesson.text).map(x=>x.text);
  if(!clips.length)throw Error('This lesson has no text.');
  clipIndex=Math.min(Number(s.positions[id]||0),clips.length-1);
  await loadClip();
 }
 if(version!==lessonPlaybackVersion)return;
 applyPlaybackSpeed();
 await playMedia();
}
async function loadClip(){const version=lessonPlaybackVersion,index=clipIndex;const r=await api('/api/tts',{text:clips[index].slice(0,20000),speed:s.settings.rate});if(version!==lessonPlaybackVersion||clipIndex!==index)return;player.generatedRate=r.nativeRate||1;player.generatedProvider=r.provider;player.src=languageURL(r.url);applyPlaybackSpeed();$('#player-source').textContent=`${r.provider||'Piper'} · ${r.voice||'Harri'} · AI voice · sentence ${clipIndex+1}/${clips.length}`;if(playingLesson===lid){s.positions[lid]=clipIndex;if(view==='library'){if(s.settings.sentenceMode||!$('#reader-text'))reader(current());const progress=$('.reading-progress i');if(progress)progress.style.width=(100*(clipIndex+1)/clips.length)+'%';const part=C.segments(current().text)[clipIndex];$$('.token').forEach(el=>{if(s.settings.sentenceMode||mInside(part,Number(el.dataset.start)))el.classList.add('sounding');});const active=$('#reader-text .sounding');if(active)followReaderPlayback(active,current(),part?.start||0);}}}
player.onended=act(async()=>{if(player.loop||lessonPlaybackSuspended||!playingLesson||view!=='library'||playingLesson!==lid)return;const version=lessonPlaybackVersion;if(!lessonQueuePlayback&&s.settings.sentenceMode){pauseMedia();return;}if(playingLesson&&!clips.length)s.audioPositions[playingLesson]=0;if(clips.length&&clipIndex<clips.length-1){clipIndex++;await loadClip();if(version===lessonPlaybackVersion)await playMedia();return;}if(continuous&&queueIndex<queue.length-1){queueIndex++;await playLesson(queue[queueIndex],true);}});
player.onplay=()=>{if(document.hidden||lessonPlaybackSuspended||view!=='library'||!playingLesson||playingLesson!==lid){player.pause();return;}$('#player-play').textContent='Ⅱ';lastTick=Date.now();};player.onpause=()=>{$('#player-play').textContent='▶';save();};player.onerror=()=>toast('Audio could not be played. Reattach the file or restart O/L.');
setInterval(()=>{if(!authReady||!$('#player-time'))return;const now=Date.now(),elapsed=Math.min(2,(now-lastTick)/1000);lastTick=now;if(mediaPlaying()){const recent=s.events.at(-1);if(recent?.kind==='listen'&&recent.lessonId===playingLesson&&now-recent.at<60000){recent.amount+=elapsed;recent.coins+=elapsed/12;}else C.event(s,'listen',elapsed,{lessonId:playingLesson});if(playingLesson)s.audioPositions[playingLesson]=mediaTime();if(sleepAt&&now>=sleepAt){pauseMedia();sleepAt=0;toast('Sleep timer finished.');}const l=s.lessons.find(l=>l.id===playingLesson);if(Math.floor(now/1000)%15===0)save();}$('#player-time').textContent=playingLesson?(clips.length?'Sentence '+(clipIndex+1)+'/'+clips.length+' · ':'')+time(readerTimelineTime())+' / '+time(readerTimelineDuration()):'Ready to play';$('#player-seek').value=Number.isFinite(readerTimelineDuration())&&readerTimelineDuration()?readerTimelineTime()/readerTimelineDuration()*1000:0;},1000);
let lastPlaybackMark='';
function syncPlaybackHighlight(){
 if(clips.length){syncLocalSpeechFollow();return;}
 const l=s.lessons.find(l=>l.id===playingLesson);if(!l||lid!==playingLesson||view!=='library'||!l.cues?.length)return;
 const t=mediaTime(),index=l.cues.findIndex(c=>t>=c.start&&t<c.end);const cue=l.cues[index];
 if(!cue){$$('#reader-text .sounding').forEach(el=>el.classList.remove('sounding'));return;}
 const start=cue.charStart??l.cues.slice(0,index).reduce((n,c)=>n+c.text.length+1,0),end=cue.charEnd??start+cue.text.length;
 const word=cue.words?.findLast(w=>t>=w.start&&t<w.end&&Number.isFinite(w.charStart));if(cue.words?.some(w=>Number.isFinite(w.charStart))&&!word){$$('#reader-text .sounding').forEach(el=>el.classList.remove('sounding'));return;}
 const rangeStart=word?.charStart??start,rangeEnd=word?.charEnd??end;
 const parts=C.segments(l.text),position=Math.max(0,parts.findIndex(p=>mInside(p,start)));
 if(Number(s.positions[l.id]||0)!==position){s.positions[l.id]=position;if(s.settings.sentenceMode)reader(l);}
 const offset=s.settings.sentenceMode?(parts[position]?.start||0)+(parts[position]?.text?l.text.slice(parts[position].start,parts[position].end).indexOf(parts[position].text):0):0;
 let active;$$('#reader-text .token').forEach(el=>{const a=Number(el.dataset.start)+offset,b=Number(el.dataset.end)+offset;const on=a<rangeEnd&&b>rangeStart;el.classList.toggle('sounding',on);if(on&&!active)active=el;});
 const mark=l.id+':'+rangeStart;if(mark!==lastPlaybackMark){lastPlaybackMark=mark;if(active&&mediaPlaying())followReaderPlayback(active,l,rangeStart);}
}
setInterval(syncPlaybackHighlight,250);
function playerSetup(){installPlayerLabels();bind('player-play',async()=>{lessonPlaybackSuspended=false;if(view==='library'&&current()&&s.settings.sentenceMode&&!lessonQueuePlayback){if(mediaPlaying()&&playingLesson===lid)pauseMedia();else await playSelectedReaderSentence();return;}if((view==='library'&&current()&&current().id!==playingLesson)||(!player.src&&!videoMode)){const l=current()||s.lessons[0];if(l)await playLesson(l.id);}else if(!mediaPlaying())await playMedia();else pauseMedia();});bind('player-back',()=>seekMedia(mediaTime()-5));bind('player-forward',()=>{if(Number.isFinite(mediaDuration()))seekMedia(Math.min(mediaDuration(),mediaTime()+5));});bind('player-prev',async()=>{if(view==='library'&&current()){await navigateReaderSentence(-1);return;}if(clips.length&&clipIndex>0){clipIndex--;await loadClip();if(playingLesson)await playMedia();}else if(queueIndex>0){queueIndex--;await playLesson(queue[queueIndex],true);}});bind('player-next',async()=>{if(view==='library'&&current()){await navigateReaderSentence(1);return;}if(clips.length&&clipIndex<clips.length-1){clipIndex++;await loadClip();if(playingLesson)await playMedia();}else if(queueIndex<queue.length-1){queueIndex++;await playLesson(queue[queueIndex],true);}});bind('player-seek',()=>{if(Number.isFinite(mediaDuration()))seekReaderTimeline(Number($('#player-seek').value)/1000);},'input');bind('player-rate',()=>{setPlaybackSpeed($('#player-rate').value);},'change');bind('player-loop',()=>{player.loop=!player.loop;$('#player-loop').classList.toggle('active',player.loop);$('#player-loop').setAttribute('aria-pressed',String(player.loop));});bind('player-sleep',()=>modal('Sleep timer',`<input id="sleep-minutes" type="number" min="0" max="240" value="20"><p>Minutes until playback stops. Use 0 to cancel.</p>${button('sleep-save','Set timer','primary')}`,()=>bind('sleep-save',()=>{const n=Math.max(0,Math.min(240,Number($('#sleep-minutes').value)||0));sleepAt=n?Date.now()+n*60000:0;$('#dialog').close();toast(n?'Playback stops in '+n+' minutes.':'Sleep timer cancelled.');})));}
function pickFile(accept,fn){const input=document.createElement('input');input.type='file';input.accept=accept;input.onchange=act(async()=>{if(input.files[0])await fn(input.files[0]);});input.click();}
async function uploadAudio(file){const r=await languageFetch(base+'/api/media',{credentials:'include',method:'POST',headers:{'X-File-Name':encodeURIComponent(file.name)},body:file});if(!r.ok)throw Error((await r.json()).error);return r.json();}
async function waitJob(id){for(;;){const j=await api('/api/jobs/'+id);if(j.status==='ready')return j.result;if(j.status==='failed')throw Error(j.error);if(j.progress){const status=$('#transcription-status')||$('#import-status')||$('#audio-import-status');if(status)status.textContent=j.progress;}await new Promise(r=>setTimeout(r,1800));}}
function importDialog(){modal('Import into your library',`<div class="notice">Text, EPUB, unencrypted MOBI/Kindle, PDF with selectable text, DOCX, HTML, SRT, VTT, TTML and ASS. Public articles and YouTube audio can be imported by URL. YouTube imports are transcribed by OpenAI using your saved key (API charges apply).</div><label>Title<input id="import-title" placeholder="A new lesson"></label><label>Course<input id="import-course"></label><label>${E(learningLanguage().name)} text<textarea id="import-text" rows="7"></textarea></label><label>English translation (optional)<textarea id="import-translation" rows="3"></textarea></label><label>Original source URL<input id="import-url" type="url" placeholder="https://…"></label><div class="row wrap">${button('import-file','Choose document')}${button('import-web','Fetch source')}${button('import-save','Save lesson','primary')}</div><p id="import-status" role="status"></p>`,()=>{bind('import-file',()=>pickFile('.txt,.epub,.pdf,.docx,.html,.htm,.srt,.vtt,.ttml,.ass,.mobi,.azw,.azw3',async f=>{if(f.size>22*1024*1024)throw Error('Choose a document smaller than 22 MB.');$('#import-status').textContent='Extracting document…';const bytes=new Uint8Array(await f.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const j=await api('/api/import',{name:f.name,data:btoa(binary)});importPreview(await waitJob(j.id),$('#import-course')?.value||'');}));bind('import-web',async()=>{$('#import-status').textContent='Fetching the original source…';const url=$('#import-url').value;const j=await api('/api/import',{url});importPreview(await waitJob(j.id),$('#import-course')?.value||'');});bind('import-save',()=>{const text=$('#import-text').value.trim();if(!text)throw Error('Add lesson text first.');const l=newLesson({title:$('#import-title').value||'Untitled lesson',text,translation:$('#import-translation').value,course:$('#import-course').value,sourceUrl:$('#import-url').value});s.lessons.push(l);save();$('#dialog').close();openLesson(l.id);});});}
const newLesson=data=>({id:C.uuid(),title:data.title||'Imported lesson',text:data.text||'',translation:'',course:'',tags:[],cues:[],completed:false,created:Date.now(),...data});
function importPreview(result,course=''){modal('Review imported content',`<label>Title<input id="preview-title" value="${E(result.title||'Imported lesson')}"></label><label>Course<input id="preview-course" value="${E(course)}"></label><textarea id="preview-text" rows="12">${E(result.text)}</textarea>${result.chapters?.length>1?'<label><input type="checkbox" id="split-chapters" checked> Create a lesson per chapter/page</label>':''}<p class="muted">${E(result.provider||'')} · ${result.cues?.length||0} timed segments${result.automaticCaptions?' · Automatic captions may contain errors.':''}</p>${button('save-preview','Add to library','primary')}`,()=>bind('save-preview',async()=>{const finalText=$('#preview-text').value;if(result.provider?.startsWith('OpenAI'))result={...result,...await ensureTranscriptTiming(result,finalText)};const title=$('#preview-title').value,course=$('#preview-course').value,split=$('#split-chapters')?.checked;const items=split?result.chapters.map((c,i)=>newLesson({...c,title:c.title||title+' '+(i+1),course:course||title,sourceUrl:result.sourceUrl})): [newLesson({...result,chapters:undefined,title,course,text:finalText})];if(!items.some(l=>l.text.trim()))throw Error('No readable text was extracted.');s.lessons.push(...items.filter(l=>l.text.trim()));save();$('#dialog').close();lid=null;view='library';render();toast(items.length+' lesson(s) imported.');}));}
function lessonManagementActions(lesson){
 return [
  {label:lesson.archived?'Restore lesson':'Archive lesson',run:()=>manageLesson(lesson.id,lesson.archived?'restore':'archive')},
  {label:'Delete lesson…',run:()=>confirmLessonDeletion(lesson)}
 ];
}
function confirmLessonDeletion(lesson){
 modal('Delete lesson?',`<p><strong>${E(lesson.title)}</strong> will be removed from your library and playlists. Its reading position will be deleted. Your saved words will stay in O/L Words.</p><div class="row wrap lesson-confirm-actions"><button id="cancel-lesson-delete" autofocus>Cancel</button><button id="confirm-lesson-delete" class="lesson-delete-action">Delete lesson</button></div>`,()=>{
  bind('cancel-lesson-delete',()=>$('#dialog').close());
  bind('confirm-lesson-delete',()=>manageLesson(lesson.id,'delete'));
 });
}
function manageLesson(id,action){
 const lesson=s.lessons.find(item=>item.id===id);
 if(!lesson)return;
 if(action==='restore')lesson.archived=false;
 else{
  if(lid===id)trackRead();
  if(playingLesson===id)stopLessonPlayback();
  const previous=queue[queueIndex];
  queue=queue.filter(item=>item!==id);
  queueIndex=Math.max(0,queue.indexOf(previous));
  s.settings.queue=(s.settings.queue||[]).filter(item=>item!==id);
  s.settings.recentLessons=(s.settings.recentLessons||[]).filter(item=>item!==id);
  if(action==='delete'){
   s.lessons=s.lessons.filter(item=>item.id!==id);
   for(const playlist of s.playlists)playlist.lessons=playlist.lessons.filter(item=>item!==id);
   delete s.positions[id];
   delete s.audioPositions[id];
  }else lesson.archived=true;
 }
 lid=null;
 chosen='';
 anchor=null;
 view='library';
 libraryDiscoveryMode='focused-library';
 if(action==='archive')focusedLibraryTab='archived';
 save();
 if($('#dialog').open)$('#dialog').close();
 render();
 updateImportWidgets();
 toast(action==='archive'?'Lesson archived.':action==='restore'?'Lesson restored.':'Lesson deleted.');
}
function lessonEditor(lesson){
 modal('Edit lesson',`
  <label>Title<input id="edit-title" value="${E(lesson.title)}"></label>
  <label>Course<input id="edit-course" value="${E(lesson.course)}"></label>
  <label>Tags<input id="edit-tags" value="${E(lesson.tags.join(', '))}"></label>
  <label>${E(learningLanguage().name)} text<textarea id="edit-text" rows="10">${E(lesson.text)}</textarea></label>
  <label>Translation<textarea id="edit-translation" rows="5">${E(lesson.translation)}</textarea></label>
  <label>Source URL<input id="edit-source" value="${E(lesson.sourceUrl)}"></label>
  <div class="row wrap">${button('save-lesson','Save','primary')}${button('archive-lesson',lesson.archived?'Restore lesson':'Archive lesson')}${button('delete-lesson','Delete lesson…')}</div>`,()=>{
   bind('save-lesson',()=>{
    const text=$('#edit-text').value;
    if(!text.trim())throw Error('A lesson needs text.');
    if(lesson.text!==text){lesson.cues=[];lesson.alignmentVersion=0;}
    Object.assign(lesson,{title:$('#edit-title').value,course:$('#edit-course').value,tags:taglist($('#edit-tags').value),text,translation:$('#edit-translation').value,sourceUrl:$('#edit-source').value});
    save();
    $('#dialog').close();
    reader(lesson);
   });
   bind('archive-lesson',()=>manageLesson(lesson.id,lesson.archived?'restore':'archive'));
   bind('delete-lesson',()=>confirmLessonDeletion(lesson));
  });
}
function sources(){$('#main').innerHTML=`<p class="eyebrow">REAL FINNISH, REAL VOICES</p><h1>Follow your curiosity.</h1><section class="panel"><h2>Finnish Language Nuggets</h2><p>Finnish vlogs and everyday language from the original creator. Import a video URL to transcribe its original audio with OpenAI.</p><div class="row wrap"><a class="button primary" href="https://www.youtube.com/channel/UCmhZu3jWkW4xF3nBxlkJ84A" target="_blank" rel="noopener">Open channel ↗</a><a class="button" href="https://www.youtube.com/watch?v=P6czEoc3b_4" target="_blank" rel="noopener">Hanko vlog ↗</a><a class="button" href="https://www.patreon.com/languagenuggets" target="_blank" rel="noopener">Creator’s transcripts ↗</a></div></section><section class="panel"><h2>Bring your own sources</h2><p>Import public articles, videos, books, subtitle files or your own recordings. Attached original audio plays in the bottom player; local Harri speech reads lessons without recordings.</p>${button('source-import','Import a source','primary')}${button('hanko-import','Import Hanko vlog audio')}<p class="muted">Creator-only transcripts and LingQ’s hosted catalog require the publisher’s own access. YouTube may block audio retrieval; attach permitted original audio to transcribe it with OpenAI instead.</p></section><h2>Recent import & model jobs</h2>${button('refresh-jobs','Refresh')}<div id="jobs-list">Loading…</div>`;bind('refresh-jobs',sources);bind('source-import',importDialog);bind('hanko-import',async()=>{toast('Transcribing the original Finnish audio with OpenAI…');const j=await api('/api/import',{url:'https://www.youtube.com/watch?v=P6czEoc3b_4'});importPreview(await waitJob(j.id),'Finnish Language Nuggets');});api('/api/jobs').then(jobs=>{$('#jobs-list').innerHTML=jobs.map(j=>`<div class="panel"><strong>${E(j.kind)} · ${E(j.status)}</strong><p>${E(j.error||j.progress||j.result?.title||'')}</p>${j.status==='failed'?`<button data-retry-job="${E(j.id)}">Retry</button>`:''}${j.status==='ready'&&['file','web','transcribe','openai-transcribe'].includes(j.kind)?`<button data-job="${E(j.id)}">Open result</button>`:''}</div>`).join('')||'<p>No jobs yet.</p>';$$('[data-retry-job]').forEach(b=>b.onclick=act(async()=>{await api('/api/jobs/'+b.dataset.retryJob+'/retry',{});sources();toast('Import restarted.');}));$$('[data-job]').forEach(b=>b.onclick=act(async()=>importPreview((await api('/api/jobs/'+b.dataset.job)).result)));}).catch(e=>toast(e.message));}
function legacyProgress(){const st=C.stats(s),days=Object.entries(st.days).sort().slice(-30);$('#main').innerHTML=`<p class="eyebrow">YOUR SMALL DAILY WINS</p><h1>Keep the thread going.</h1><div class="stats-grid">${[['Known words',st.known],['Learning',st.learning],['Due today',st.due],['Day streak',st.streak],['Today’s coins',Math.floor(st.today.coins)+' / '+s.settings.dailyGoal],['Listening today',time(st.today.listening)],['Words read today',st.today.read],['Reviews today',st.today.reviews]].map(([label,value])=>`<div class="panel"><h2>${E(value)}</h2><p>${label}</p></div>`).join('')}</div><h2>Recent activity</h2><div class="activity-chart">${days.map(([day,d])=>`<div class="bar-col" title="${day}: ${Math.floor(d.coins)} coins"><div style="height:${Math.min(180,Math.max(2,d.coins*3))}px"></div><small>${E(day.slice(5))}</small></div>`).join('')||'<p>Your reading, listening and reviews will appear here.</p>'}</div><p class="muted">One coin per 10 words read, 12 seconds listened or completed review. Reading is counted after at least 5 seconds on a sentence or visible page. Streaks use your selected time zone and daily coin goal.</p>${button('manual-activity','Add outside activity')}<h2>Review history</h2><div class="panel">${s.reviewHistory.slice(-20).reverse().map(r=>`<p>${new Date(r.at).toLocaleString()} · ${E(r.term)} · ${r.correct?'correct':'again'} · ${E(r.activity)}</p>`).join('')||'No reviews yet.'}</div>`;bind('manual-activity',()=>modal('Add outside activity',`<label>Activity<select id="manual-kind"><option value="listen">Listening minutes</option><option value="read">Words read</option></select></label><label>Amount<input id="manual-amount" type="number" min="1" max="100000" value="10"></label>${button('manual-save','Add activity','primary')}`,()=>bind('manual-save',()=>{const kind=$('#manual-kind').value,n=Number($('#manual-amount').value);if(!Number.isFinite(n)||n<=0||n>100000)throw Error('Enter an amount from 1 to 100,000.');C.event(s,kind,kind==='listen'?n*60:n,{manual:true});save();$('#dialog').close();progress();})));}
function legacySettings(){const set=s.settings;$('#main').innerHTML=`<p class="eyebrow">MAKE IT YOURS</p><h1>Reading & local tools</h1><div class="settings-grid"><section class="panel"><h2>Reader</h2><label>Font size<input id="set-fontSize" type="number" min="14" max="48" value="${set.fontSize}"></label><label>Line spacing<input id="set-lineHeight" type="number" min="1.2" max="3" step=".1" value="${set.lineHeight}"></label><label>Reading width<input id="set-pageWidth" type="number" min="320" max="1400" value="${set.pageWidth}"></label><label>Font<select id="set-font">${['Georgia','Arial','Verdana'].map(v=>`<option ${set.font===v?'selected':''}>${v}</option>`).join('')}</select></label>${[['autoKnown','Mark remaining blue words known when completing a lesson'],['autoSave','Save selected words automatically'],['autoPronounce','Pronounce a selected word automatically'],['showVocabulary','Show sentence vocabulary below the reader'],['autoSentence','Speak when moving to the next sentence'],['autoTranslation','Show lesson translation automatically'],['preferSourceVideo','Use original YouTube video in the player when available']].map(([key,label])=>`<label><input type="checkbox" id="set-${key}" ${set[key]?'checked':''}>${label}</label>`).join('')}<label>Daily coin goal<input id="set-dailyGoal" type="number" min="1" max="10000" value="${set.dailyGoal}"></label><label>Time zone<input id="set-timezone" value="${E(set.timezone)}"></label>${button('save-settings','Save preferences','primary')}</section><section class="panel"><h2>Generated speech</h2><p>Generated speech uses the voice selected in AI &amp; Connections. OpenAI voices use your saved key and incur API charges; repeat recordings are cached locally. Piper Harri is the free local option. Original lesson recordings play as recorded.</p><p class="muted">Generated voices are AI-generated.</p>${button('test-voice','▶ Preview selected voice')}<h2>Local translation</h2><label>Provider<select id="translation-provider"><option value="ollama" ${set.translationProvider==='ollama'?'selected':''}>Ollama (local installed model)</option><option value="argos" ${set.translationProvider==='argos'?'selected':''}>Argos Finnish → English (local)</option></select></label><label>Ollama model<input id="ollama-model" value="${E(set.ollamaModel)}" placeholder="Choose an installed model name"></label>${button('list-models','List installed models')}${button('install-argos','Download Finnish translation model')}<p id="model-status" role="status"></p><h2>Audio transcription</h2><label>Whisper model<select id="whisper-model">${['tiny','base','small'].map(v=>`<option ${set.whisperModel===v?'selected':''}>${v}</option>`).join('')}</select></label><p class="muted">Runs locally on the CPU. First transcription downloads its model; base is about 150 MB. Small takes longer. Captions should be checked for recognition errors.</p>${button('save-tools','Save tool choices','primary')}</section></div>`;
bind('save-settings',()=>{for(const key of ['fontSize','lineHeight','pageWidth','dailyGoal'])set[key]=Number($('#set-'+key).value);if(set.fontSize<14||set.fontSize>48||set.lineHeight<1.2||set.lineHeight>3||set.pageWidth<320||set.pageWidth>1400||set.dailyGoal<1||set.dailyGoal>10000)throw Error('Keep settings within the displayed ranges.');new Intl.DateTimeFormat('en',{timeZone:$('#set-timezone').value}).format();set.timezone=$('#set-timezone').value;set.font=$('#set-font').value;['autoKnown','autoSave','autoSentence','autoTranslation','preferSourceVideo','autoPronounce','showVocabulary'].forEach(k=>set[k]=$('#set-'+k).checked);save();toast('Preferences saved.');});bind('save-tools',()=>{set.translationProvider=$('#translation-provider').value;set.ollamaModel=$('#ollama-model').value;set.whisperModel=$('#whisper-model').value;save();toast('Local tool choices saved.');});bind('test-voice',()=>speak(learningPreviewText()));bind('list-models',async()=>{const r=await api('/api/ollama-models');$('#model-status').textContent=r.error||r.models.map(m=>m.name).join(', ')||'No models installed.';});bind('install-argos',async()=>{$('#model-status').textContent='Downloading Finnish → English model…';const j=await api('/api/install-translation',{});await waitJob(j.id);set.translationProvider='argos';save();$('#model-status').textContent='Finnish → English is installed. Select Argos and save tool choices.';});}
function legacyBackup(){$('#main').innerHTML=`<p class="eyebrow">YOURS TO KEEP</p><h1>Your library, safely saved.</h1><section class="panel narrow"><h2>Complete backup</h2><p>The ZIP archive includes lessons, word meanings, review schedules, playlists, history, settings, attached audio and cached Harri recordings. Voice/software models stay with the app installation.</p>${button('full-backup','Download complete backup','primary')}<h2>Restore</h2><p>Restore replaces the library. A safety backup is saved locally before a ZIP restore. Old O/L JSON files can also be imported.</p>${button('restore','Choose ZIP or JSON backup')}<h2>Portable data</h2>${button('json-backup','Download text data as JSON')}${accountStorage.getItem('oma-browser-recovery')?button('browser-recovery','Download previous browser copy'):''}<p class="muted">This language’s library is stored locally in your account workspace. Keep a separate ZIP backup if you move computers.</p></section>`;bind('full-backup',()=>downloadAPI('/api/backup','Oma-Lingo-complete-backup.zip'));bind('browser-recovery',()=>download(new Blob([JSON.stringify(C.withoutChat(JSON.parse(accountStorage.getItem('oma-browser-recovery'))))],{type:'application/json'}),'Oma-Lingo-browser-recovery.json'));bind('json-backup',()=>download(new Blob([JSON.stringify(s,null,2)],{type:'application/json'}),'Oma-Lingo-data.json'));bind('restore',()=>pickFile('.zip,.json',async f=>{if(!confirm('Replace your current O/L library with this backup?'))return;await flush();if(f.name.toLowerCase().endsWith('.json')){const value=JSON.parse(await f.text());if(!C.validate(value))throw Error('This is not a valid O/L backup.');download(new Blob([JSON.stringify(s)],{type:'application/json'}),'Oma-Lingo-before-restore.json');s=C.migrate(value);ankiRestorePending=true;save();await flush();}else{const r=await api('/api/restore',f);s=C.migrate(r.state);revision=r.revision;ankiDurableWords=structuredClone(s.words);accountStorage.setItem('oma-reader-v2',JSON.stringify(s));queueAnkiSync();}lid=null;toast('Backup restored.');render();}));}
async function migrateAudio(){if(!authUser?.legacy||activeStudyLanguage!=='fi')return;let db;try{db=await new Promise((resolve,reject)=>{const r=indexedDB.open('oma-audio');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(!db.objectStoreNames.contains('audio'))return;for(const l of s.lessons){if(l.media)continue;const blob=await new Promise((resolve,reject)=>{const r=db.transaction('audio').objectStore('audio').get(l.legacyId||l.id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(blob instanceof Blob){const ext=blob.type.includes('wav')?'wav':blob.type.includes('ogg')?'ogg':blob.type.includes('mp4')?'m4a':blob.type.includes('webm')?'webm':blob.type.includes('flac')?'flac':'mp3';l.media=(await uploadAudio(new File([blob],l.id+'.'+ext,{type:blob.type}))).media;}}}catch(e){toast('Legacy audio remains in this browser: '+e.message);}finally{db?.close();}}
async function init(){document.body.innerHTML=`<div class="shell"><nav aria-label="Main navigation"><div class="brand">${omaBrandMark}<span>${OMA_BRAND_NAME}</span></div>${[['library','▤','Library'],['words','◈','Words'],['review','↻','Review'],['playlists','♫','Playlists'],['sources','◎','Sources'],['progress','▥','Progress'],['settings','⚙','Settings'],['backup','⇅','Backup']].map(([v,icon,label])=>`<button data-nav="${v}"><b>${icon}</b>${label}</button>`).join('')}</nav><div class="workspace"><header><div id="breadcrumb"></div><div class="row"><span class="language">🇫🇮 Finnish → English</span><small id="storage-state">Connecting…</small></div></header><main id="main"><h1>Opening your learning space…</h1></main></div></div><section class="persistent-player" aria-label="Audio player"><div class="persistent-inner"><div class="persistent-info"><strong id="player-title">Your listening space</strong><small id="player-source">Generated voice</small></div><div class="persistent-controls">${button('player-prev','|◀')}${button('player-back','↶ 5')}${button('player-play','▶','primary')}${button('player-forward','5 ↷')}${button('player-next','▶|')}</div><div class="persistent-timeline"><input id="player-seek" type="range" min="0" max="1000" value="0" aria-label="Playback position"><small id="player-time">0:00 / 0:00</small></div><select id="player-rate" aria-label="Playback speed">${[.5,.7,.85,1,1.2,1.5,2].map(v=>`<option value="${v}" ${v===1?'selected':''}>${v}×</option>`).join('')}</select>${button('player-loop','↻')}${button('player-sleep','☾')}</div></section><dialog id="dialog"></dialog><div id="toast" class="toast" role="status" hidden></div>`;
let remote;for(const candidate of omaServiceCandidates())try{const r=await fetch(candidate+'/api/health',{credentials:'include',signal:AbortSignal.timeout(1800)});if(r.ok&&((health)=>health.authentication===true&&health.resourceCatalogVersion>=2)(await r.json())){base=candidate;connected=true;remote=await api('/api/state');break;}}catch{}
if(!connected)throw Error('The local service disconnected. Refresh O/L to sign in again.');
const legacy=JSON.parse(accountStorage.getItem('oma-reader-v2')||accountStorage.getItem('oma-reader-v1')||'null');const oldBrowser=JSON.parse(accountStorage.getItem('oma-reader-v1')||'null');const pending=JSON.parse(accountStorage.getItem('oma-pending-v2')||'null');if(remote&&pending&&C.validate(pending.state)){if(pending.revision===remote.revision){remote.state=pending.state;}else if(JSON.stringify(remote.state)!==JSON.stringify(pending.state))accountStorage.setItem('oma-browser-recovery',JSON.stringify(pending.state));}if(remote?.state&&legacy&&JSON.stringify(remote.state)!==JSON.stringify(legacy))accountStorage.setItem('oma-browser-recovery',JSON.stringify(legacy));s=C.migrate(remote?.state||legacy||{version:1,lessons:authUser.legacy&&activeStudyLanguage==='fi'?structuredClone(demo):[],words:{}});if(s.settings.interfaceVersion!==4){s.settings.interfaceVersion=4;s.settings.font='Arial';s.settings.fontSize=24;s.settings.lineHeight=1.8;}revision=remote?.revision||0;ankiDurableWords=structuredClone(s.words);if(connected){if(pending?.revision===revision&&C.validate(pending.state)){ankiRestorePending=pending.ankiRestore===true;await flush();}if(remote.state&&oldBrowser&&!accountStorage.getItem('oma-migrated-v2')){const old=C.migrate(oldBrowser);for(const l of old.lessons){const existing=s.lessons.find(x=>x.id===l.id);if(!existing)s.lessons.push(l);else if(existing.text!==l.text||existing.title!==l.title){s.lessons.push({...l,id:C.uuid(),legacyId:l.id,title:l.title+' (previous library)'});}}for(const [k,w]of Object.entries(old.words)){if(!s.words[k])s.words[k]=w;else{const existing=s.words[k];for(const meaning of w.meanings)if(!existing.meanings.some(m=>m.text===meaning.text))existing.meanings.push(meaning);existing.meaning=existing.meanings.map(m=>m.text).join('; ');existing.tags=[...new Set([...existing.tags,...w.tags])];if(w.note&&!existing.note.includes(w.note))existing.note+=(existing.note?'\n':'')+w.note;}}await migrateAudio();await flush();accountStorage.setItem('oma-migrated-v2','1');}if(!remote.state){await migrateAudio();await flush();accountStorage.setItem('oma-migrated-v2','1');}$('#storage-state').textContent='Saved locally';}else{$('#storage-state').textContent='Browser copy · open the launcher';toast('Open O/L with Open-Oma.cmd to enable imports, database saves and local speech.');}queue=s.settings.queue||[];continuous=s.settings.continuous!==false;shuffle=!!s.settings.shuffle;$('#player-rate').value=String(s.settings.rate);$$('[data-nav]').forEach(b=>b.onclick=()=>{trackRead();go(b.dataset.nav);});setupParityShell();installSidebarControls();playerSetup();if(!s.settings.playbackSpeedVersion){s.settings.rate=s.settings.rate===1?.85:s.settings.rate;s.settings.playbackSpeedVersion=1;applyPlaybackSpeed();save();}render();void startAnkiSync();}
window.addEventListener('afterprint',()=>{document.body.classList.remove('printing-vocab');$('#print-sheet')?.remove();});
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,button')||document.querySelector('dialog[open]'))return;if(view==='library'&&current()){if(e.key==='ArrowRight'){e.preventDefault();moveSentence(1);}if(e.key==='ArrowLeft'){e.preventDefault();moveSentence(-1);}if(e.code==='Space'){e.preventDefault();$('#player-play').click();}}});document.addEventListener('visibilitychange',()=>{if(document.hidden){if(authReady)pauseBackgroundPlayback();trackRead();}else readSince=Date.now();});window.addEventListener('blur',()=>setTimeout(()=>{if(authReady&&!document.hasFocus())pauseBackgroundPlayback();},0));window.addEventListener('pagehide',()=>{if(!authReady)return;pauseBackgroundPlayback();accountStorage.setItem('oma-reader-v2',JSON.stringify(s));if(connected&&accountStorage.getItem('oma-pending-v2'))languageFetch(base+'/api/state',{method:'POST',credentials:'include',keepalive:true,headers:{'Content-Type':'application/json','X-Oma-User':authUser.id},body:JSON.stringify({state:s,revision,ankiRestore:ankiRestorePending})}).catch(()=>{});});
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
 bind('reader-more',e=>floatingMenu(e.currentTarget,[...menuNodes.filter(el=>!['transcribe','attach-subtitles'].includes(el.id)).map(el=>({label:el.textContent,run:()=>el.click()})),{label:'Translation…',run:()=>translationPreferences()},{label:'Transcript…',run:()=>transcriptOptionsDialog(l)},{label:'Review Lesson',run:()=>{view='review';reviewPage(Object.entries(s.words).filter(([,w])=>w.encounters?.some(e=>e.lessonId===l.id)).map(([k])=>k));}},{label:'Sentence Audio & Timing',run:()=>showLessonTimings(l)},{label:'Reader settings',run:()=>readerSettings()}]));bind('reader-aa',readerSettings);bind('sentence-listen',async()=>{if(l.media||l.youtubeId){await playLesson(l.id);const index=Number(s.positions[l.id]||0);const cue=l.cues.find(c=>c.text.includes(C.segments(l.text)[index]?.text||'!'));if(cue)seekMedia(cue.start);}else if(s.settings.sentenceMode)await speak(C.segments(l.text)[Number(s.positions[l.id]||0)]?.text||l.text);else await playLesson(l.id);});bind('reader-panel-toggle',()=>{const panel=$('#word-panel');if(!panel)return;if(!chosen){toast('Select a word in the text to see its meaning.');return;}if(innerWidth<=1100){delete panel.dataset.mobileDismissed;panel.dataset.mobileRequested='true';syncAdaptiveUI();}else document.body.classList.toggle('hide-word-panel');});
 const controls=document.createElement('div');controls.className='reading-bottom';controls.innerHTML=`<button id="reader-page-view">▥ ${s.settings.sentenceMode?'Page View':'Sentence View'}</button><button id="reader-review-sentence">▱ Review Sentence</button>`;$('.persistent-player').append(controls);bind('reader-page-view',toggleReaderSentenceView);bind('reader-review-sentence',startReaderSentenceReview);
 const translation=$('#translation');setupReaderTranslation(l);
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

/* Insert inside Oma Lingo's application IIFE. Uses the existing working vocabulary actions. */
let pvPage=0,pvLevels=new Set(),pvDate='',pvActive=0,pvSearchOpen=false,pvKeyboardBound=false;
function pvRows(){return entries().filter(([,w])=>(!pvLevels.size||pvLevels.has(w.status))&&(!pvDate||w.due&&w.due<=new Date(pvDate+'T23:59:59').getTime()));}
function pvPicked(){return selected.size?Object.entries(s.words).filter(([k])=>selected.has(k)):pvRows();}
function pvStyle(){if($('#pv-vocabulary-style'))return;const style=document.createElement('style');style.id='pv-vocabulary-style';style.textContent=`
.pv-vocabulary{color:#0b2035}.pv-vocabulary h1{font-size:24px}.pv-vocabulary button{color:#0b2035}.pv-topline{display:flex;justify-content:flex-end;gap:10px;margin:0 0 20px}.pv-topline #review-selection{background:#081d31;color:white;border:1px solid #081d31;border-radius:10px;padding:12px 23px}.pv-topline #csv-import{background:white;border:1px solid #e0e3e7;border-radius:10px;font-size:17px;padding:12px 20px}.pv-control-line{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid #d2d6dc;gap:15px}.pv-tabs{display:flex;align-self:stretch}.pv-tabs button{min-width:150px;padding:17px 22px;background:transparent;border:1px solid #d5d9df;border-bottom:0;border-radius:12px 12px 0 0;font-weight:400}.pv-tabs button.active{background:white;color:#0b2035}.pv-count{display:inline-block;margin-left:8px;border-radius:14px;background:#f0f2f5;padding:2px 9px;font-size:12px}.pv-tools{display:flex;align-items:center;gap:12px;padding-bottom:10px}.pv-tools>button,.pv-popover-root>button{border:0;background:transparent;padding:8px 10px;font-size:15px;white-space:nowrap}.pv-popover-root{position:relative}.pv-more-menu{position:absolute;right:0;top:calc(100% + 5px);z-index:10;background:#fff;border:1px solid #e0e4e8;border-radius:20px;box-shadow:0 5px 16px #12233a22;width:250px;padding:8px 0}.pv-more-menu button{display:block;width:100%;text-align:left;border:0;border-radius:0;padding:12px 19px;background:white;font-size:14px}.pv-more-menu button:hover{background:#f1f3f6}.pv-search-box{margin:12px 0}.pv-search-box input{width:100%;max-width:480px}.pv-vocabulary table{border:0;border-collapse:separate;border-spacing:0 5px;background:transparent;min-width:950px}.pv-vocabulary thead th{font-size:12px;font-weight:400;letter-spacing:0;background:transparent;border:0;padding:10px 15px;color:#52677c}.pv-vocabulary tbody td{background:white;border-top:1px solid #e3e6eb;border-bottom:1px solid #e3e6eb;padding:21px 15px;vertical-align:top;font-size:15px}.pv-vocabulary tbody td:first-child{border-left:1px solid #e3e6eb;border-radius:11px 0 0 11px;width:26px}.pv-vocabulary tbody td:last-child{border-right:1px solid #e3e6eb;border-radius:0 11px 11px 0}.pv-vocabulary [data-edit]{padding:0;background:transparent;border:0;font-size:18px;font-weight:500}.pv-vocabulary .pv-source{font-style:italic;color:#577087;max-width:350px;font-size:14px;line-height:1.6}.pv-vocabulary .pv-source button{background:none;border:0;text-align:left;padding:0;color:inherit;font:inherit}.pv-statuses{display:flex;gap:8px;white-space:nowrap}.pv-statuses button{width:42px;height:42px;padding:0;border:1px solid #cfd5db;border-radius:50%;background:white;font-size:16px}.pv-statuses button.pv-chosen{background:#ffe994;border-color:#d9c37a}.pv-statuses button[data-row-status="-1"]{font-size:21px}.pv-page-footer{display:flex;align-items:center;justify-content:space-between;margin:22px 0;gap:15px;flex-wrap:wrap}.pv-shortcuts{padding:18px 25px;border-radius:20px;background:#f0f2f5;color:#31485f;font-size:13px;margin-top:20px}.pv-shortcuts kbd{background:white;border:1px solid #cbd3dc;padding:3px 6px;border-radius:4px}.pv-empty{padding:45px;text-align:center;background:white;border-radius:12px;margin-top:10px}.pv-filter-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pv-filter-fields label{margin:0}.pv-status-checks{display:flex;flex-wrap:wrap;gap:10px 18px;margin:20px 0}.pv-status-checks label{font-size:14px}.pv-filter-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}.pv-active-row td{border-color:#9caabb!important}@media(max-width:1000px){.pv-control-line{display:block}.pv-tools{justify-content:flex-end;padding-top:10px}.pv-tabs button{min-width:100px;padding:14px 12px}.pv-filter-fields{grid-template-columns:1fr}}@media(max-width:600px){.pv-tabs button{font-size:12px;min-width:0;padding:13px 10px}.pv-tools{gap:0}.pv-tools>button,.pv-popover-root>button{font-size:13px}.pv-topline{margin-top:10px}.pv-topline #csv-import{font-size:14px}.pv-page-footer{font-size:12px}}
`;document.head.append(style);}
function pvFresh(el){const next=el.cloneNode(true);el.replaceWith(next);return next;}
function pvCloseMenus(){const menu=$('#pv-more-menu');if(menu)menu.hidden=true;$('#bulk')?.setAttribute('aria-expanded','false');}
function pvExport(){download(new Blob([C.exportCSV(pvPicked())],{type:'text/csv;charset=utf-8'}),'Oma-Lingo-vocabulary.csv');}
async function pvAnki(){await downloadAPI('/api/anki','Oma-Lingo-'+learningLanguage().name+'.apkg',{terms:pvPicked().map(([term,w])=>({...w,term}))});}
function pvPrint(){const rows=pvPicked();$('#print-sheet')?.remove();const sheet=document.createElement('section');sheet.id='print-sheet';sheet.innerHTML='<h1>Vocabulary</h1><table><thead><tr><th>Term</th><th>Meaning</th><th>Source text</th></tr></thead><tbody>'+rows.map(([k,w])=>'<tr><td>'+E(k)+'</td><td>'+E(w.meaning)+'</td><td>'+E(w.context||w.encounters?.[0]?.sentence||'')+'</td></tr>').join('')+'</tbody></table>';document.body.append(sheet);document.body.classList.add('printing-vocab');window.print();}
function pvBulk(action){pvCloseMenus();if(!selected.size&&!['print','anki-sync'].includes(action))throw Error('Select vocabulary first.');if(action==='print')return pvPrint();if(action==='export')return pvExport();if(action==='anki')return pvAnki();if(action==='tags')return pvTags();if(action==='anki-sync')return openSettings('anki');if(action==='remove'&&[...selected].some(key=>ankiWordLinked(s.words[key])))throw Error('Delete linked words in Anki. O/L will pick up the change on the next sync.');if(action==='remove'&&!confirm('Remove '+selected.size+' selected vocabulary entries?'))return;for(const key of selected){const w=s.words[key];if(!w)continue;if(action==='up')C.term(s,key,{status:Math.min(5,Math.max(1,w.status+1))});if(action==='down')C.term(s,key,{status:Math.max(1,w.status-1)});if(action==='known')C.term(s,key,{status:5});if(action==='reviewed'&&!ankiWordLinked(w)){w.lastReviewed=Date.now();if(w.status>=1&&w.status<=4)w.due=Date.now()+86400000;}if(action==='remove')delete s.words[key];}if(action==='remove')selected.clear();save();vocabulary();}
function pvTags(){modal('Add/Remove tags',`<label>Tags, separated by commas<input id="pv-tags-input"></label><label>Action<select id="pv-tags-mode"><option value="add">Add tags</option><option value="remove">Remove tags</option></select></label><div class="pv-filter-actions">${button('pv-tags-apply','Apply','primary')}</div>`,()=>bind('pv-tags-apply',()=>{const tags=taglist($('#pv-tags-input').value).map(C.norm);if(!tags.length)throw Error('Enter at least one tag.');for(const key of selected){const w=s.words[key];if(w)C.term(s,key,{tags:$('#pv-tags-mode').value==='add'?[...w.tags,...tags]:w.tags.filter(t=>!tags.includes(t))});}save();$('#dialog').close();vocabulary();}));}
function pvFilters(){const tags=[...new Set(Object.values(s.words).flatMap(w=>w.tags))],courses=[...new Set(s.lessons.map(l=>l.course).filter(Boolean))];modal('Filters',`<div class="pv-filter-fields"><label>Tags<select id="pv-filter-tag"><option value="">All</option>${tags.map(t=>`<option ${filter.tag===t?'selected':''}>${E(t)}</option>`).join('')}</select></label><label>Course<select id="pv-filter-course"><option value="">All</option>${courses.map(c=>`<option ${filter.course===c?'selected':''}>${E(c)}</option>`).join('')}</select></label><label>Lesson<select id="pv-filter-lesson"><option value="">All</option>${s.lessons.map(l=>`<option value="${E(l.id)}" ${filter.lesson===l.id?'selected':''}>${E(l.title)}</option>`).join('')}</select></label><label>SRS Date — due on or before<input id="pv-filter-date" type="date" value="${E(pvDate)}" aria-label="Choose date..."></label><label>Sort<select id="pv-filter-sort"><option value="alpha">A-Z</option><option value="level" ${filter.sort==='level'?'selected':''}>Status</option><option value="due" ${filter.sort==='due'?'selected':''}>SRS Date</option></select></label></div><div class="pv-status-checks">${[[1,'1-New'],[2,"2-Can't Remember"],[3,'3-Not Sure'],[4,'4-Learned'],[5,'✓-Known words'],[-1,'Ignored']].map(([n,label])=>`<label><input type="checkbox" data-pv-filter-status="${n}" ${pvLevels.has(n)?'checked':''}>${label}</label>`).join('')}</div><div class="pv-filter-actions">${button('pv-clear-filters','Clear filters')}${button('pv-apply-filters','Apply','primary')}</div>`,()=>{bind('pv-clear-filters',()=>{pvLevels.clear();pvDate='';filter={query:filter.query,phrases:filter.phrases,due:filter.due};pvPage=0;$('#dialog').close();vocabulary();});bind('pv-apply-filters',()=>{filter.tag=$('#pv-filter-tag').value;filter.course=$('#pv-filter-course').value;filter.lesson=$('#pv-filter-lesson').value;filter.sort=$('#pv-filter-sort').value;filter.status='';pvDate=$('#pv-filter-date').value;pvLevels=new Set($$('[data-pv-filter-status]:checked').map(el=>Number(el.dataset.pvFilterStatus)));pvPage=0;$('#dialog').close();vocabulary();});});}
function vocabulary(){
 if(filter.status&&!pvLevels.size)pvLevels.add(Number(filter.status));filter.status='';
 $('#pv-topline')?.remove();pvStyle();legacyVocabulary();
 const main=$('#main'),originalTable=main.querySelector('table'),tableBox=main.querySelector('.table-scroll');
 const importButton=$('#csv-import'),reviewButton=$('#review-selection'),moreButton=$('#bulk'),searchInput=$('#word-query');
 const bridge=document.createElement('div');bridge.hidden=true;bridge.id='pv-legacy-controls';
 for(const id of ['new-term','select-all','clear-selection','csv-export','anki-export','print-words','word-status','word-tag','word-lesson','word-course','word-sort','word-due','word-phrases']){const el=$('#'+id);if(el)bridge.append(el);}
 main.replaceChildren();const root=document.createElement('section');root.className='pv-vocabulary';root.innerHTML=`<div class="pv-topline" id="pv-topline"></div><div class="pv-control-line"><div class="pv-tabs" role="tablist" aria-label="Vocabulary lists"><button id="pv-all-tab" role="tab" class="${!filter.phrases&&!filter.due?'active':''}" aria-selected="${!filter.phrases&&!filter.due}">All <span class="pv-count">${Object.keys(s.words).length}</span></button><button id="pv-phrases-tab" role="tab" class="${filter.phrases?'active':''}" aria-selected="${!!filter.phrases}">Phrases <span class="pv-count">${Object.keys(s.words).filter(k=>k.includes(' ')).length}</span></button><button id="pv-due-tab" role="tab" class="${filter.due?'active':''}" aria-selected="${!!filter.due}">Due for Review(SRS) <span class="pv-count">${Object.values(s.words).filter(wordReady).length}</span></button></div><div class="pv-tools"><button id="pv-search-toggle">⌕ &nbsp; Search</button><button id="pv-filters-toggle">☷ &nbsp; Filters</button><div class="pv-popover-root" id="pv-more-root"></div></div></div><div id="pv-search-box" class="pv-search-box" ${pvSearchOpen||filter.query?'':'hidden'}></div><div id="pv-table-holder"></div><div class="pv-page-footer"><div id="pv-page-count"></div><div class="row"><button id="pv-page-prev" aria-label="Previous vocabulary page">‹</button><span id="pv-page-label"></span><button id="pv-page-next" aria-label="Next vocabulary page">›</button><label>Show: <select id="pv-page-size" aria-label="Vocabulary per page">${[25,50,100].map(n=>`<option value="${n}" ${Number(s.settings.vocabularyPageSize||25)===n?'selected':''}>${n}</option>`).join('')}</select></label></div></div><div class="pv-shortcuts">Press <kbd>Option/Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> for next/previous term, <kbd>Option/Alt</kbd> + <kbd>↵</kbd> to open term editor</div>`;main.append(root,bridge);
 importButton.textContent='⇥  Import Vocabulary';reviewButton.textContent='Review';$('#pv-topline').append(importButton,reviewButton);$('#library-top').append($('#pv-topline'));document.body.classList.add('vocabulary-view');$('#pv-more-root').append(moreButton);moreButton.textContent='More Actions  ⌄';moreButton.setAttribute('aria-haspopup','menu');moreButton.setAttribute('aria-expanded','false');$('#pv-search-box').append(searchInput);searchInput.placeholder='Search vocabulary';$('#pv-table-holder').append(tableBox);
 const rows=pvRows(),pageSize=Number(s.settings.vocabularyPageSize||25),pages=Math.max(1,Math.ceil(rows.length/pageSize));pvPage=Math.max(0,Math.min(pvPage,pages-1));const pageRows=rows.slice(pvPage*pageSize,(pvPage+1)*pageSize),keys=new Set(pageRows.map(([k])=>k));
 const head=originalTable.querySelector('thead tr');head.innerHTML='<th><input id="pv-select-page" type="checkbox" aria-label="Select all on this page"></th><th>TERM</th><th>MEANING</th><th>SOURCE TEXT</th><th>STATUS</th>';
 for(const tr of [...originalTable.querySelectorAll('tbody tr')]){const edit=tr.querySelector('[data-edit]'),key=edit?.dataset.edit;if(!keys.has(key)){tr.remove();continue;}const w=s.words[key];while(tr.cells.length>3)tr.deleteCell(3);const source=tr.insertCell(),status=tr.insertCell();source.className='pv-source';const encounter=w.encounters?.find(e=>e.lessonId===filter.lesson)||w.encounters?.[0];const context=w.context||encounter?.sentence||'';source.innerHTML=context?`<button data-pv-source="${E(encounter?.lessonId||'')}" title="Open source lesson">“${E(context)}”</button>`:'—';status.innerHTML=`<div class="pv-statuses">${[-1,1,2,3,4,5].map(n=>`<button data-row-term="${E(key)}" data-row-status="${n}" class="${w.status===n?'pv-chosen':''}" aria-label="${n===-1?'Ignore':n===5?'Known':n}" aria-pressed="${w.status===n}" title="${E(n===2?"Can't Remember":n===3?'Not Sure':statusName(n))}">${n===-1?'<svg class="ignore-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="m6.3 6.3 11.4 11.4"/></svg>':n===5?'✓':n}</button>`).join('')}</div>`;tr.dataset.pvTerm=key;tr.onclick=()=>{pvActive=pageRows.findIndex(([k])=>k===key);};}
 if(!pageRows.length){const empty=document.createElement('p');empty.className='pv-empty';empty.textContent='No vocabulary matches these filters.';$('#pv-table-holder').append(empty);}
 const pageCheckbox=$('#pv-select-page');pageCheckbox.checked=pageRows.length>0&&pageRows.every(([k])=>selected.has(k));pageCheckbox.indeterminate=pageRows.some(([k])=>selected.has(k))&&!pageCheckbox.checked;pageCheckbox.onchange=()=>{pageRows.forEach(([k])=>pageCheckbox.checked?selected.add(k):selected.delete(k));vocabulary();};
 $$('[data-row-status]').forEach(el=>el.onclick=act(()=>{C.term(s,el.dataset.rowTerm,{status:Number(el.dataset.rowStatus),autoKnownLessonId:null});save();vocabulary();}));$$('[data-pv-source]').forEach(el=>el.onclick=()=>{if(s.lessons.some(l=>l.id===el.dataset.pvSource))openLesson(el.dataset.pvSource);else termDialog(el.closest('tr').dataset.pvTerm);});
 $('#pv-page-count').textContent=(rows.length?`${pvPage*pageSize+1}–${Math.min(rows.length,(pvPage+1)*pageSize)} of ${rows.length}`:'0 vocabulary')+(selected.size?` · ${selected.size} selected`:'');$('#pv-page-label').textContent=(pvPage+1)+' / '+pages;$('#pv-page-prev').disabled=pvPage===0;$('#pv-page-next').disabled=pvPage===pages-1;bind('pv-page-prev',()=>{pvPage--;vocabulary();});bind('pv-page-next',()=>{pvPage++;vocabulary();});bind('pv-page-size',()=>{s.settings.vocabularyPageSize=Number($('#pv-page-size').value);pvPage=0;save();vocabulary();},'change');
 bind('pv-all-tab',()=>{filter.phrases=false;filter.due=false;pvPage=0;vocabulary();});bind('pv-phrases-tab',()=>{filter.phrases=true;filter.due=false;pvPage=0;vocabulary();});bind('pv-due-tab',()=>{filter.phrases=false;filter.due=true;pvPage=0;vocabulary();});bind('pv-search-toggle',()=>{pvSearchOpen=!pvSearchOpen;$('#pv-search-box').hidden=!pvSearchOpen;if(pvSearchOpen)$('#word-query').focus();});bind('pv-filters-toggle',pvFilters);
 pvFresh(searchInput).addEventListener('change',()=>{filter.query=$('#word-query').value;pvPage=0;vocabulary();});pvFresh(reviewButton).addEventListener('click',act(()=>{if(ankiDesktopEnabled())return practiseInAnki();view='review';reviewPage((selected.size?Object.entries(s.words).filter(([k])=>selected.has(k)):rows).map(([k])=>k));}));
 const menu=document.createElement('div');menu.id='pv-more-menu';menu.className='pv-more-menu';menu.setAttribute('role','menu');menu.hidden=true;menu.innerHTML=[['up','Status +1'],['down','Status -1'],['reviewed','Mark Reviewed'],['known','Make Known'],['print','Print'],['export','Export Selected'],['anki','Export Selected for Anki'],['anki-sync','Anki sync settings'],['remove','Remove'],['tags','Add/Remove tags']].map(([action,label])=>`<button role="menuitem" data-pv-action="${action}" ${!selected.size&&action!=='print'?'disabled':''}>${label}${['print','tags','anki-sync'].includes(action)?'':' ('+selected.size+')'}</button>`).join('');$('#pv-more-root').append(menu);pvFresh(moreButton).addEventListener('click',()=>{menu.hidden=!menu.hidden;$('#bulk').setAttribute('aria-expanded',String(!menu.hidden));});$$('[data-pv-action]').forEach(el=>el.onclick=act(()=>pvBulk(el.dataset.pvAction)));
 if(!pvKeyboardBound){pvKeyboardBound=true;document.addEventListener('click',e=>{if(!e.target.closest('.pv-popover-root'))pvCloseMenus();});document.addEventListener('keydown',e=>{if(e.key==='Escape')pvCloseMenus();if(view!=='words'||!e.altKey||e.target.closest('input,textarea,select')||$('#dialog')?.open)return;const available=$$('[data-pv-term]');if(!available.length)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();pvActive=Math.max(0,Math.min(available.length-1,pvActive+(e.key==='ArrowDown'?1:-1)));available.forEach(tr=>tr.classList.remove('pv-active-row'));available[pvActive].classList.add('pv-active-row');available[pvActive].querySelector('[data-edit]').focus();}if(e.key==='Enter'){e.preventDefault();termDialog(available[Math.min(pvActive,available.length-1)].dataset.pvTerm);}});}
}

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

let libraryDiscoveryMode='home',libraryDiscoveryCategory='News Feed';
const mediaFeedMemory=new Map(),mediaFeedFetchedAt=new Map();
const discoveryCategories=['Learning Sources','Reading','Videos','News Feed','Local News','Guided Courses','Mini Stories','Trending',"What's New",'Entertainment','Grammar','Travel','Podcasts','Sports','Technology'];
function discoverySources(){const all=[...sharedLanguageSources,...(s.settings.customSources||[])],seen=new Set();return all.filter(v=>{if(!v.url||retiredSourceIds.has(v.id)||seen.has(v.url))return false;seen.add(v.url);return true;});}
function followedSourceIds(){const interests=learningData.profile.interests?.[activeStudyLanguage];if(!s.settings.followedSources&&interests?.length)return discoverySources().filter(source=>interests.some(category=>sourceMatchesCategory(source,category))).map(source=>source.id);return s.settings.followedSources||(activeStudyLanguage==='fi'?['yle-selkouutiset','yle-uutiset','fi-yle-supisuomea']:discoverySources().slice(0,3).map(s=>s.id));}
function sourceMatchesCategory(source,category){if(category==='Learning Sources')return source.mode==='website';if(['Trending',"What's New"].includes(category))return true;if(category==='Videos'&&source.kind==='video')return true;if(category==='News Feed')return source.category==='News Feed'||(source.categories||[]).includes('News Feed');if(category==='Guided Courses')return source.publicCourse===true;if(category==='Podcasts'&&source.kind==='podcast')return true;return source.category===category||(source.categories||[]).includes(category);}
function openMediaFeed(category='News Feed'){libraryDiscoveryMode='feed';libraryDiscoveryCategory=category;lid=null;view='library';render();window.scrollTo(0,0);}
function replaceSourceButton(id,fn){const old=$('#'+id);if(!old)return;const b=old.cloneNode(true);old.replaceWith(b);b.onclick=act(fn);}
function library(){
 $('#main').classList.remove('discovery-page');
 if(current())return personalLibrary();
 if(libraryDiscoveryMode==='feed')return mediaFeedPage(libraryDiscoveryCategory);
 personalLibrary();
 const categories=document.createElement('div');categories.className='discovery-categories';categories.innerHTML='<button id="library-interests">Your interests</button>'+discoveryCategories.map(c=>`<button data-discovery-category="${E(c)}">${E(c)}</button>`).join('');$('.source-pickers')?.after(categories);
 bind('library-interests',()=>showInterestPicker(activeStudyLanguage,()=>render()));categories.querySelectorAll('[data-discovery-category]').forEach(b=>b.onclick=()=>openMediaFeed(b.dataset.discoveryCategory));
 replaceSourceButton('all-sources',()=>openMediaFeed());replaceSourceButton('youtube-source',()=>openMediaFeed('Videos'));
 const hasInterests=!!learningData.profile.interests?.[activeStudyLanguage]?.length;const followed=new Set(followedSourceIds());const resources=discoverySources().filter(v=>v.mode==='website'&&(!hasInterests||followed.has(v.id)));if(resources.length){const section=document.createElement('section');section.className='library-shelf learning-home-shelf';section.innerHTML='<div class="row between"><h2>Learning Sources</h2><button id="learning-sources-all">View all ›</button></div><p class="muted">Stories, listening, videos and grammar for your selected language.</p><div class="learning-resource-grid">'+resources.slice(0,3).map(learningResourceCard).join('')+'</div>';$('#library-content').after(section);bind('learning-sources-all',()=>openMediaFeed('Learning Sources'));wireResourceFeeds(section);}
 const shelf=document.createElement('section');shelf.className='library-shelf discovery-home-shelf';shelf.innerHTML='<div class="row between"><h2>'+(hasInterests?'For you':'News Feed')+'</h2><button id="news-feed-all">View all ›</button></div><div id="discovery-home-items" class="discovery-home-items"><p class="muted">Loading source previews…</p></div>';$('#library-content').after(shelf);bind('news-feed-all',()=>openMediaFeed(hasInterests?"What's New":'News Feed'));
 const providers=discoverySources().filter(v=>(hasInterests?(v.mode!=='website'||v.feedUrl):sourceMatchesCategory(v,'News Feed'))&&followedSourceIds().includes(v.id)).slice(0,3);
 loadDiscoveryItems(providers).then(({items,errors})=>{if(!shelf.isConnected)return;const area=shelf.querySelector('#discovery-home-items');area.innerHTML=items.length?items.slice(0,4).map(discoveryCard).join(''):`<p class="muted">${E(errors.length?'Sources could not be loaded. Open News Feed to retry or add a source.':providers.length?'No recent items are available. Browse your learning sources below.':'Choose interests or follow a source to see its recent items.')}</p>`;wireDiscoveryCards(area,items);});
}
function sources(){openMediaFeed();}
async function loadDiscoveryItems(providers,refresh=false){
 providers=providers.filter(v=>v.mode!=='website'||v.feedUrl);const responses=await Promise.allSettled(providers.map(async source=>{let result=mediaFeedMemory.get(source.url);if(!result||refresh||Date.now()-(mediaFeedFetchedAt.get(source.url)||0)>600000){result=await api('/api/feed',{url:source.feedUrl||source.url,refresh});mediaFeedMemory.set(source.url,result);mediaFeedFetchedAt.set(source.url,Date.now());}return (result.items||[]).map(item=>({...item,browseOnly:!!(item.browseOnly||source.browseOnly),sourceId:source.id,sourceTitle:item.sourceTitle||result.title||source.name,sourceCategory:source.category,sourceKind:source.kind,sourceAccess:source.access||''}));}));
 const items=[],errors=[];responses.forEach((r,i)=>r.status==='fulfilled'?items.push(...r.value):errors.push(providers[i].name+': '+r.reason.message));const seen=new Set();return {items:items.filter(v=>{const key=v.url||v.id;if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>(Date.parse(b.published)||0)-(Date.parse(a.published)||0)),errors};
}
function discoveryExisting(item){if(item.lessonId)return s.lessons.find(l=>l.id===item.lessonId);return s.lessons.find(l=>l.sourceUrl===item.url||(item.youtubeId&&l.youtubeId===item.youtubeId));}
function discoveryCard(item){
 const existing=discoveryExisting(item),pending=typeof sourceImportJob==='function'?sourceImportJob(item):null,summary=item.summary||'',types=[...new Set(C.words(summary).map(C.norm))],unknown=types.filter(k=>!s.words[k]).length;const img=item.image?safeURL(item.image):'';
 return `<article class="discovery-card"><button class="discovery-art" data-art-item="${E(item.id)}" data-preview-source="${E(item.id)}" aria-label="Preview ${E(item.title)}">${img?`<img src="${E(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span>▤</span>'}</button><div class="discovery-card-body"><button class="discovery-title" data-preview-source="${E(item.id)}">${E(item.title)}</button><div class="row between wrap"><span class="discovery-provider">${E(item.sourceTitle)}</span><button class="source-more" data-more-source="${E(item.sourceId)}">More from this source ›</button></div><div class="row between wrap"><small class="muted" title="Counts are based on the feed preview, not the full lesson">${types.length?unknown+' new / '+types.length+' preview words':'Preview available'}${item.duration?' · '+time(item.duration):''}${item.published?' · '+new Date(item.published).toLocaleDateString():''}</small><div class="row"><button class="primary" data-import-source="${E(item.id)}" ${pending&&['queued','processing'].includes(pending.status)?'disabled':''}>${existing?'Imported · Open':pending?importJobLabel(pending):item.browseOnly?'Open on publisher ↗':'Import ＋'}</button>${pending&&!existing?importJobProgress(pending):''}<button class="discovery-menu" data-source-actions="${E(item.id)}" aria-label="Item actions">⋮</button></div></div></div></article>`;
}
function wireDiscoveryCards(root,items){
 wireDiscoveryArtwork(root,items);
 if(typeof updateImportWidgets==='function')queueMicrotask(updateImportWidgets);
 const find=id=>items.find(v=>String(v.id)===id);
 root.querySelectorAll('[data-preview-source]').forEach(b=>b.onclick=()=>previewDiscoveryItem(find(b.dataset.previewSource)));
 root.querySelectorAll('[data-import-source]').forEach(b=>b.onclick=act(async()=>{b.disabled=true;try{await importDiscoveryItem(find(b.dataset.importSource));}finally{if(b.isConnected)b.disabled=false;}}));
 root.querySelectorAll('[data-more-source]').forEach(b=>b.onclick=()=>{openMediaFeed(discoverySources().find(v=>v.id===b.dataset.moreSource)?.category||'News Feed');const sel=$('#feed-provider');if(sel){sel.value=b.dataset.moreSource;sel.dispatchEvent(new Event('change'));}});
 root.querySelectorAll('[data-source-actions]').forEach(button=>button.onclick=()=>{
  const item=find(button.dataset.sourceActions);
  const lesson=discoveryExisting(item);
  const actions=[
   {label:'Preview',run:()=>previewDiscoveryItem(item)},
   {label:'Open original source',run:()=>window.open(safeURL(item.url),'_blank','noopener')}
  ];
  if(lesson)actions.push(null,...lessonManagementActions(lesson));
  else actions.push({label:(s.settings.archivedFeedItems||[]).includes(item.id)?'Restore item':'Archive item',run:()=>{
   const ids=new Set(s.settings.archivedFeedItems||[]);
   if(ids.has(item.id))ids.delete(item.id);
   else ids.add(item.id);
   s.settings.archivedFeedItems=[...ids];
   save();
   openMediaFeed(libraryDiscoveryCategory);
  }});
  floatingMenu(button,actions);
 });
}
function previewDiscoveryItem(item){if(!item)return;modal('Source preview',`<h2>${E(item.title)}</h2><p class="muted">${E(item.sourceTitle)}${item.published?' · '+new Date(item.published).toLocaleDateString():''}</p>${item.sourceAccess?`<p class="muted">${E(item.sourceAccess)}</p>`:''}<p style="white-space:pre-wrap">${E(item.summary||'Open the original source to read its description.')}</p><div class="row wrap"><a class="button" href="${E(safeURL(item.url))}" target="_blank" rel="noopener noreferrer">Original source ↗</a>${button('import-preview-source',discoveryExisting(item)?'Open lesson':item.browseOnly?'Open on publisher ↗':'Import lesson','primary')}</div>`,()=>{const b=$('#import-preview-source');b.dataset.importSource=item.id;const pending=typeof sourceImportJob==='function'?sourceImportJob(item):null;if(pending)b.dataset.importJob=pending.id;bind('import-preview-source',()=>importDiscoveryItem(item));if(typeof updateImportWidgets==='function')updateImportWidgets();});}
async function importDiscoveryItem(item){
 const existing=discoveryExisting(item);const pending=typeof sourceImportJob==='function'?sourceImportJob(item):null;if(!existing&&pending){showImportJobs();return;}if(existing){$('#dialog').close();openLesson(existing.id);return;}
 if(item.browseOnly){window.open(safeURL(item.url),'_blank','noopener');return;}
 if(item.youtubeId){importDialog({source:'youtube',url:item.url,title:item.title,item});return;}
 toast(item.audioUrl||item.youtubeId?'Preparing original audio and transcript…':'Fetching the original article…');
 const job=await api(item.audioUrl?'/api/import-audio-url':'/api/import',item.audioUrl?{url:item.audioUrl,importMetadata:importItemMetadata(item)}:{url:item.url,importMetadata:importItemMetadata(item)});trackBrowserImport(job);return;
}
function discoveryLocalItems(category){
 let lessons=s.lessons.filter(l=>!l.archived);const q=C.norm(category);
 if(category==='Mini Stories')lessons=lessons.filter(l=>['morning','forest'].includes(l.id)||C.norm(l.category+' '+l.course+' '+l.tags.join(' ')).includes('mini stor'));
 else if(category==='Guided Courses')lessons=lessons.filter(l=>l.course);
 else if(category==='Trending'){const active=new Set(s.events.slice(-100).map(e=>e.lessonId));lessons=lessons.filter(l=>active.has(l.id));}
 else if(category!=="What's New")lessons=lessons.filter(l=>C.norm(l.category+' '+l.course+' '+l.tags.join(' ')).includes(q));
 return lessons.map(l=>({id:'lesson-'+l.id,lessonId:l.id,title:l.title,url:l.sourceUrl||'',summary:l.text.slice(0,250),image:l.imageUrl||l.image||'',published:new Date(l.created||0).toISOString(),level:l.level,tags:l.tags,sourceId:'oma-library',sourceTitle:l.course||'My Library',sourceCategory:category,duration:l.cues?.at(-1)?.end||0}));
}
function mediaFeedPage(category){
 if(category==='Learning Sources')return learningSourcesPage();
 $('#main').classList.add('discovery-page');
 const locals=discoveryLocalItems(category),all=discoverySources(),available=all.filter(v=>sourceMatchesCategory(v,category));let providers=available.filter(v=>followedSourceIds().includes(v.id));if(!providers.length)providers=available.filter(v=>v.availability==='verified').slice(0,3);
 $('#main').innerHTML=`<button id="feed-back" class="quiet">‹ Library</button><div class="discovery-layout"><section><h1 class="discovery-results-title">Search Results – ${E(category)}</h1>${category==='Trending'?'<p class="muted">Suggestions based on your interests and recent study activity; no public popularity ranking.</p>':category==="What's New"?'<p class="muted">Recent items from followed publishers, newest first.</p>':''}<input id="feed-query" aria-label="Search Library" placeholder="Search Library"><div id="feed-status" role="status" class="muted">Loading source previews…</div><div id="media-feed-items"></div></section><aside class="discovery-filters"><label>Sort by<select id="feed-sort"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">Title</option><option value="newwords">Fewest new preview words</option></select></label><label>Lessons / Courses<select id="feed-mode"><option value="lessons">Lessons</option><option value="courses">Courses</option></select></label><label>Provider search<select id="feed-provider"><option value="">All</option>${locals.length?'<option value="oma-library">My Library</option>':''}${all.map(v=>`<option value="${E(v.id)}">${E(v.name)}</option>`).join('')}</select></label><h3>Level</h3><div class="feed-levels">${['Beginner 1','Beginner 2','Intermediate 1','Intermediate 2','Advanced 1','Advanced 2'].map(v=>`<label><input type="checkbox" data-feed-level="${E(v)}">${v}</label>`).join('')}</div><small class="muted">Unlabelled publisher items are included.</small><label>Content Type<select id="feed-type"><option value="all">All</option><option value="external">External</option><option value="imported">My Imports</option></select></label><label>Lesson Length<select id="feed-length"><option value="">All lengths</option><option value="short">Short · under 5 min</option><option value="medium">Medium · 5–15 min</option><option value="long">Long · over 15 min</option></select></label><label>Tags<input id="feed-tag" placeholder="Enter Tag"></label><label><input type="checkbox" id="feed-archived"> Archived</label><div class="row wrap">${button('feed-sources','Manage sources')}${button('feed-refresh','Refresh')}</div><div class="discovery-category-links">${discoveryCategories.map(c=>`<button data-feed-category="${E(c)}">${E(c)}</button>`).join('')}</div></aside></div>`;
 bind('feed-back',()=>{libraryDiscoveryMode='home';render();});bind('feed-sources',manageDiscoverySources);$$('[data-feed-category]').forEach(b=>b.onclick=()=>openMediaFeed(b.dataset.feedCategory));
 let loaded=[],errors=[];const root=$('#media-feed-items'),status=$('#feed-status');
 const draw=()=>{if(!root.isConnected)return;const q=C.norm($('#feed-query').value),provider=$('#feed-provider').value,type=$('#feed-type').value,length=$('#feed-length').value,tag=C.norm($('#feed-tag').value),archived=$('#feed-archived').checked,levels=$$('[data-feed-level]:checked').map(b=>b.dataset.feedLevel);let items=loaded.filter(v=>(!q||C.norm(v.title+' '+v.summary+' '+v.sourceTitle).includes(q))&&(!provider||v.sourceId===provider)&&(type!=='imported'||discoveryExisting(v))&&(type!=='external'||!discoveryExisting(v))&&(!levels.length||!v.level||levels.includes(v.level))&&(!tag||C.norm((v.tags||[]).join(' ')+' '+v.title+' '+v.summary).includes(tag))&&((s.settings.archivedFeedItems||[]).includes(v.id)===archived)&&(!length||!v.duration||(length==='short'?v.duration<300:length==='medium'?v.duration>=300&&v.duration<=900:v.duration>900)));
 const resources=all.filter(v=>v.mode==='website'&&(provider?v.id===provider:sourceMatchesCategory(v,category))&&(!q||C.norm(v.name+' '+v.description).includes(q))&&type!=='imported'&&!archived);
 const sort=$('#feed-sort').value;items.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'fi'):sort==='oldest'?(Date.parse(a.published)||0)-(Date.parse(b.published)||0):sort==='newwords'?C.words(a.summary||'').filter(w=>!s.words[C.norm(w)]).length-C.words(b.summary||'').filter(w=>!s.words[C.norm(w)]).length:(Date.parse(b.published)||0)-(Date.parse(a.published)||0));
 if($('#feed-mode').value==='courses'){const sources=[...new Set(items.map(v=>v.sourceId))];root.innerHTML=resources.map(learningResourceCard).join('')+sources.map(id=>{const v=all.find(v=>v.id===id);return `<article class="panel"><h2>${E(v?.name||id)}</h2><p>${items.filter(v=>v.sourceId===id).length} available items</p><button data-provider-course="${E(id)}">View lessons ›</button></article>`;}).join('');root.querySelectorAll('[data-provider-course]').forEach(b=>b.onclick=()=>{$('#feed-provider').value=b.dataset.providerCourse;$('#feed-mode').value='lessons';draw();});wireResourceFeeds(root);}
 else{root.innerHTML=(resources.length?'<div class="learning-resource-grid">'+resources.map(learningResourceCard).join('')+'</div>':'')+items.map(discoveryCard).join('')||'<div class="panel"><p>No matching source items. Change filters, follow a source, or import your own content.</p><button id="feed-empty-import">Import content</button></div>';wireDiscoveryCards(root,items);wireResourceFeeds(root);bind('feed-empty-import',importDialog);}
 status.textContent=items.length+' items'+(resources.length?' · '+resources.length+' learning source'+(resources.length===1?'':'s'):'')+(errors.length?' · '+errors.length+' source(s) unavailable':'');if(errors.length){const details=document.createElement('details');details.innerHTML='<summary>Source availability</summary><p>'+errors.map(E).join('<br>')+'</p>';status.append(details);}
 };
 const load=async(refresh=false)=>{status.textContent='Loading source previews…';const choice=$('#feed-provider').value;const list=choice?all.filter(v=>v.id===choice):providers;const result=await loadDiscoveryItems(list,refresh);if(!root.isConnected)return;loaded=[...locals,...result.items];errors=result.errors;draw();};
 for(const id of ['feed-query','feed-tag'])bind(id,draw,'input');for(const id of ['feed-sort','feed-type','feed-length','feed-mode','feed-archived'])bind(id,draw,'change');$$('[data-feed-level]').forEach(b=>b.onchange=draw);bind('feed-provider',()=>load(),'change');bind('feed-refresh',()=>load(true));load();
}
function manageDiscoverySources(){
 const all=discoverySources(),followed=new Set(followedSourceIds());
 modal('Manage sources',`<p>Choose publishers and channels for your Library feeds.</p><div class="discovery-source-list">${all.map(v=>`<label><input type="checkbox" data-follow-source="${E(v.id)}" ${followed.has(v.id)?'checked':''}><span><strong>${E(v.name)}</strong><small>${E(v.kind)} · ${E(v.category)}</small></span><a href="${E(safeURL(v.siteUrl||v.url))}" target="_blank" rel="noopener">↗</a></label>`).join('')}</div><h3>Add a source</h3>${authUser.role==='admin'?'<label><input type="checkbox" id="share-new-source" checked> Make available to everyone learning this language</label>':'<p class="muted">New sources you add are personal. The administrator can add shared sources.</p>'}<label>RSS, podcast feed, website or YouTube channel<input id="new-source-url" type="url" placeholder="https://…"></label><label>Category<select id="new-source-category">${['News Feed','Reading','Videos','Guided Courses','Mini Stories','Entertainment','Grammar','Travel','Podcasts','Sports','Technology'].map(v=>`<option>${v}</option>`).join('')}</select></label>${button('add-youtube-channel','Add YouTube channel')}${button('add-discovery-source','Add source')}${button('save-discovery-sources','Done','primary')}<p id="new-source-status" role="status"></p>`,()=>{
 bind('add-youtube-channel',()=>addYouTubeChannel());
 bind('save-discovery-sources',()=>{s.settings.followedSources=$$('[data-follow-source]:checked').map(b=>b.dataset.followSource);save();$('#dialog').close();render();});
 bind('add-discovery-source',async()=>{const url=$('#new-source-url').value.trim();$('#new-source-status').textContent='Checking source…';const result=await api('/api/feed',{url});const category=$('#new-source-category').value,id='custom-'+C.uuid();s.settings.customSources=s.settings.customSources||[];const source={id,name:result.title||new URL(url).hostname,url:result.url||url,siteUrl:url,category,kind:category==='Podcasts'?'podcast':result.items?.some(v=>v.youtubeId)?'video':'news',availability:'verified'};if($('#share-new-source')?.checked){const shared=await api('/api/shared-sources',source);sharedLanguageSources=(await api('/api/shared-sources')).sources;source.id=shared.source.id;}else s.settings.customSources.push(source);s.settings.followedSources=[...$$('[data-follow-source]:checked').map(b=>b.dataset.followSource),source.id];save();manageDiscoverySources();});
 });
}

const discoveryArtworkRequests=new Map();let discoveryArtworkActive=0;const discoveryArtworkQueue=[];
function runArtworkQueue(){while(discoveryArtworkActive<3&&discoveryArtworkQueue.length){const task=discoveryArtworkQueue.shift();discoveryArtworkActive++;task().finally(()=>{discoveryArtworkActive--;runArtworkQueue();});}}
function wireDiscoveryArtwork(root,items){
 const load=element=>{const item=items.find(v=>String(v.id)===element.dataset.artItem);if(!item||!/^https?:/.test(item.url||''))return;
 const request=()=>{if(!element.isConnected)return;let pending=discoveryArtworkRequests.get(item.url);if(!pending){pending=api('/api/source-metadata',{url:item.url}).catch(()=>({image:''}));discoveryArtworkRequests.set(item.url,pending);}return pending.then(meta=>{if(!element.isConnected||!meta.image)return;item.image=meta.image;const img=document.createElement('img');img.src=safeURL(meta.image);img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>{element.innerHTML='<span>▤</span>';};element.replaceChildren(img);});};
 const existing=element.querySelector('img');if(existing){existing.onerror=()=>{element.innerHTML='<span>▤</span>';discoveryArtworkQueue.push(async()=>request());runArtworkQueue();};return;}
 discoveryArtworkQueue.push(async()=>request());runArtworkQueue();
 };
 if(!('IntersectionObserver' in window)){root.querySelectorAll('[data-art-item]').forEach(load);return;}
 const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){observer.unobserve(entry.target);load(entry.target);}});},{rootMargin:'150px'});root.querySelectorAll('[data-art-item]').forEach(el=>observer.observe(el));
}

function learningResourceCard(source){return `<article class="learning-resource-card"><div class="row wrap"><small class="resource-kind">${E(source.category)}</small><small class="muted">${E(source.level||'Mixed levels')}</small></div><h2>${E(source.name)}</h2><p>${E(source.description||'Browse learning materials from this publisher.')}</p><small class="resource-access">${E(source.access||'Check publisher access')}</small>${(source.mode!=='website'||source.feedUrl||source.kind==='video')?`<button class="primary" data-resource-feed="${E(source.id)}">${source.kind==='podcast'?'View episodes':source.kind==='video'?'View videos':'View lessons'}</button>`:'<small class="muted">Open the publisher to choose a short lesson.</small>'}<a class="button" href="${E(safeURL(source.url))}" target="_blank" rel="noopener noreferrer">Browse source ↗</a></article>`;}
function learningSourcesPage(){
 $('#main').classList.add('discovery-page');const all=discoverySources();
 $('#main').innerHTML=`<button id="resources-back" class="quiet">‹ Library</button><h1>Learning Sources</h1><p class="muted">Explore stories, conversations, videos and grammar. These sources are shared with everyone learning this language.</p><div class="discovery-categories" id="resource-types">${['All',...discoveryCategories.filter(c=>!['Learning Sources','Trending',"What's New"].includes(c))].map(v=>`<button data-resource-type="${v}" aria-pressed="${v==='All'}">${v}</button>`).join('')}</div><input id="resource-search" aria-label="Search learning sources" placeholder="Search sources"><div id="resource-results" class="learning-resource-grid"></div><div class="panel resource-import-help"><h2>Bring a lesson into O/L</h2><p>Browse a source first, then import an individual article or video URL. You can also upload a short document or paste your own text. Publisher exercises stay on their website; paid material requires your own access.</p><button id="resource-import" class="primary">Import content</button></div>`;
 let type='All';const draw=()=>{const q=C.norm($('#resource-search').value);$('#resource-results').innerHTML=all.filter(v=>(type==='All'||sourceMatchesCategory(v,type))&&(!q||C.norm(v.name+' '+v.description).includes(q))).map(learningResourceCard).join('')||'<p class="muted">No sources match this filter.</p>';wireResourceFeeds($('#resource-results'));};
 bind('resources-back',()=>{libraryDiscoveryMode='home';render();});bind('resource-import',()=>importDialog());bind('resource-search',draw,'input');$$('[data-resource-type]').forEach(b=>b.onclick=()=>{type=b.dataset.resourceType;$$('[data-resource-type]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw();});draw();
}

function youtubeChannelURL(value){
 let url;try{url=new URL(value.trim());}catch{throw Error('Paste a YouTube channel URL, such as https://www.youtube.com/@channel.');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname))throw Error('Use a YouTube channel URL.');
 if(!/^\/(?:@[A-Za-z0-9_.%\-]+|channel\/UC[A-Za-z0-9_-]{20,30}|c\/[^/]+|user\/[^/]+)(?:\/(?:videos|shorts|streams|featured))?\/?$/.test(url.pathname))throw Error('Use a channel link, not an individual video or playlist.');
 url.protocol='https:';url.hostname='www.youtube.com';url.search='';url.hash='';url.pathname=url.pathname.replace(/\/(videos|shorts|streams|featured)\/?$/,'').replace(/\/$/,'');return url.href;
}
function addYouTubeChannel(initialUrl=''){
 const language=activeStudyLanguage;let checked=null;
 modal('Add YouTube channel',`<p>Follow a channel to browse its recent public videos. Adding a channel does not import or transcribe videos.</p><label>YouTube channel URL<input id="channel-url" type="url" placeholder="https://www.youtube.com/@channel"></label>${authUser.role==='admin'?'<label><input id="channel-shared" type="checkbox" checked> Share with everyone learning this language</label>':'<p class="muted">This channel will be saved for your account and selected language.</p>'}<div class="row wrap">${button('channel-check','Preview channel')}${button('channel-save','Add channel','primary')}</div><p id="channel-status" role="status"></p><div id="channel-preview"></div>`,()=>{
 $('#channel-url').value=initialUrl;$('#channel-save').disabled=true;
 bind('channel-url',()=>{checked=null;$('#channel-save').disabled=true;$('#channel-preview').innerHTML='';$('#channel-status').textContent='';},'input');
 bind('channel-check',async()=>{const status=$('#channel-status');$('#channel-check').disabled=true;$('#channel-save').disabled=true;checked=null;try{const url=youtubeChannelURL($('#channel-url').value);status.textContent='Loading recent videos…';const result=await api('/api/feed',{url});if(!$('#channel-preview')||activeStudyLanguage!==language)return;if(youtubeChannelURL($('#channel-url').value)!==url)return;const items=(result.items||[]).filter(v=>v.youtubeId);if(!items.length)throw Error('No public videos were found. Check the channel link or try again later.');checked={input:url,result,items};$('#channel-preview').innerHTML=`<h3>${E(result.title||'YouTube channel')}</h3><p class="muted">${items.length} recent videos available</p>`+items.slice(0,3).map(v=>`<p>${E(v.title)}</p>`).join('');status.textContent='Choose Add channel to save it.';$('#channel-save').disabled=false;}catch(e){status.textContent=e.message;}finally{if($('#channel-check'))$('#channel-check').disabled=false;}});
 bind('channel-save',async()=>{if(!checked)return;const status=$('#channel-status');$('#channel-save').disabled=true;try{if(activeStudyLanguage!==language)throw Error('The learning language changed. Open Add channel again.');const {input,result}=checked;let source=discoverySources().find(v=>v.url===input||v.url===result.url||v.feedUrl===result.url);if(!source){source={id:'channel-'+C.uuid(),name:result.title||'YouTube channel',url:result.url||input,siteUrl:input,kind:'video',category:'Videos',availability:'verified'};if($('#channel-shared')?.checked){source=(await api('/api/shared-sources',source)).source;sharedLanguageSources=(await api('/api/shared-sources')).sources;}else{s.settings.customSources=s.settings.customSources||[];s.settings.customSources.push(source);}}s.settings.followedSources=[...new Set([...followedSourceIds(),source.id])];mediaFeedMemory.set(source.url,result);save();$('#dialog').close();openMediaFeed('Videos');const select=$('#feed-provider');if(select){select.value=source.id;select.dispatchEvent(new Event('change'));}toast('Channel added. Choose a video to preview or import.');}catch(e){status.textContent=e.message;if($('#channel-save'))$('#channel-save').disabled=false;}});
 });
}

function wireResourceFeeds(root){root.querySelectorAll('[data-resource-feed]').forEach(button=>button.onclick=()=>{const source=discoverySources().find(s=>s.id===button.dataset.resourceFeed);if(!source)return;openMediaFeed(source.category||'Podcasts');const select=$('#feed-provider');if(select){select.value=source.id;select.dispatchEvent(new Event('change'));}});}

/* Personal source import: selection, content, review. Inject after the base UI. */
const omaImportSources=[
 ['paste','Type or Paste','Aa','Create a lesson from your own text.'],
 ['web','Web Links','↗','Articles and public web pages.'],
 ['audio','Audio Transcription','♫','Recordings, podcasts and audiobooks.'],
 ['file','Text Files & Ebooks','▤','Books, documents and subtitle files.'],
 ['scan','Scan','▣','Import text exported from your scanner.'],
 ['youtube','YouTube','▶','Choose publisher captions, automatic captions or OpenAI transcription.'],
 ['netflix','Netflix','N','Bring an exported transcript or subtitles.'],
 ['prime','Prime Video','▷','Bring an exported transcript or subtitles.'],
 ['tiktok','TikTok','♪','Bring a recording or transcript you can use.'],
 ['instagram','Instagram','◎','Bring a recording or transcript you can use.']
];
const omaImportLevels=['Beginner 1','Beginner 2','Intermediate 1','Intermediate 2','Advanced 1','Advanced 2'];
function omaImportSteps(step){return '<ol class="oma-import-steps" aria-label="Import progress">'+['Select Source','Add Content','Review & Import'].map((label,i)=>`<li ${i===step?'aria-current="step"':''} class="${i<=step?'reached':''}"><span>${i+1}</span>${label}</li>`).join('')+'</ol>';}
function omaImportSafeImage(value){if(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value||''))return value;return safeURL(value)==='#'?'':safeURL(value);}
function omaImportSourceKey(value){try{const u=new URL(value);const video=u.hostname==='youtu.be'?u.pathname.slice(1).split('/')[0]:/^(?:www\.|m\.)?youtube\.com$/.test(u.hostname)?u.searchParams.get('v')||u.pathname.match(/\/(?:shorts|embed|live)\/([^/]+)/)?.[1]:null;if(video)return 'youtube:'+video;u.hash='';for(const key of [...u.searchParams.keys()])if(key.startsWith('utm_')||['fbclid','t','feature'].includes(key))u.searchParams.delete(key);return u.href;}catch{return '';}}
function importDialog(initialSource){
 const initial=initialSource&&typeof initialSource==='object'?initialSource:{};
 const draft={title:initial.title||'',text:'',url:initial.url||'',transcriptSource:'publisher',source:typeof initialSource==='string'?initialSource:initial.source||''};
 const choose=()=>modal('Import',omaImportSteps(0)+`<p class="oma-import-intro">Choose what you want to learn from.</p><h3>Your content</h3><div class="oma-import-source-grid">${omaImportSources.slice(0,5).map(sourceCard).join('')}</div><h3>Streaming platforms</h3><div class="oma-import-source-grid">${omaImportSources.slice(5,8).map(sourceCard).join('')}${sourceCard(['youtube-channel','YouTube Channel','▶','Follow a channel and choose videos to import.'])}</div><h3>Socials</h3><div class="oma-import-source-grid">${omaImportSources.slice(8).map(sourceCard).join('')}</div>`,()=>$$('[data-oma-import-source]').forEach(b=>b.onclick=()=>{draft.source=b.dataset.omaImportSource;content();}));
 function sourceCard([id,name,icon,caption]){return `<button class="oma-import-source" data-oma-import-source="${id}"><span class="oma-import-source-icon">${icon}</span><strong>${name}</strong><small>${caption}</small></button>`;}
 function content(){
  if(draft.source==='youtube-channel')return addYouTubeChannel();
  const source=omaImportSources.find(v=>v[0]===draft.source)||omaImportSources[0],external=['netflix','prime','tiktok','instagram'].includes(source[0]),isFile=['file','scan'].includes(source[0]);
  const guidance=source[0]==='scan'?'O/L does not scan images yet. Use your scanner’s text recognition, then upload a searchable PDF or text file, or paste the extracted text.':external?'Open this source in your browser and bring a transcript, subtitle file or original recording you are allowed to use. Account-only streams are not downloaded by this importer.':'';
  modal('Import · '+source[1],omaImportSteps(1)+`<button id="oma-import-back" class="quiet">‹ Select another source</button>${guidance?'<p class="oma-import-notice">'+E(guidance)+'</p>':''}<label>Title<input id="import-title" value="${E(draft.title)}" placeholder="Lesson title (optional for files)"></label>${['web','youtube'].includes(source[0])?`<label>${source[0]==='youtube'?'YouTube video URL':'Web page URL'}<input id="import-url" type="url" value="${E(draft.url)}" placeholder="https://…"></label><div id="youtube-transcript-choice" ${source[0]==='youtube'?'':'hidden'}><label>Transcript source<select id="youtube-transcript-source"><option value="">Choose a transcript source</option>${[['openai','OpenAI · new transcription (API usage)'],['publisher','Publisher captions · if available'],['automatic','YouTube automatic captions · if available']].map(([value,label])=>`<option value="${value}" ${draft.transcriptSource===value?'selected':''}>${label}</option>`).join('')}</select></label><p class="muted">Captions keep YouTube’s original timing and do not use transcription credits. Automatic captions may contain errors. Unavailable captions won’t silently switch to a paid transcription.</p></div><p class="muted">${source[0]==='youtube'?'Choose the transcript you want to study.':'Public articles are extracted into editable lesson text. Audio links use OpenAI transcription.'}</p>${button('oma-import-fetch','Continue','primary')}`:source[0]==='audio'?`<p>Upload original audio or paste a direct audio URL. OpenAI creates the transcript and O/L aligns it for playback. API usage applies.</p><input id="oma-import-audio" type="file" accept="audio/*,video/*"><label>Or direct audio URL<input id="oma-import-audio-url" type="url" placeholder="https://…/episode.mp3"></label>${button('oma-import-fetch-audio','Continue','primary')}`:isFile?`<div id="oma-import-drop" class="oma-import-drop" tabindex="0" role="button" aria-label="Choose or drop documents"><strong>Drop files here or choose files</strong><p>TXT, PDF with text, EPUB, DOCX, MOBI, HTML, SRT, VTT, TTML or ASS</p><input id="oma-import-files" type="file" multiple accept=".txt,.pdf,.epub,.docx,.mobi,.azw,.azw3,.html,.htm,.srt,.vtt,.ttml,.ass"></div><button id="oma-import-paste-instead">Paste text instead</button>`:`<label>${E(learningLanguage().name)} text<textarea id="import-text" rows="10" placeholder="Type or paste the text you want to study">${E(draft.text)}</textarea></label>${external?'<div class="row wrap">'+button('oma-import-export-file','Choose exported subtitles or document')+button('oma-import-recording','Choose recording')+'</div>':''}${button('oma-import-text-next','Continue','primary')}`}<p id="import-status" role="status"></p>`,()=>{
   bind('import-url',()=>{const el=$('#youtube-transcript-choice');if(el)el.hidden=!omaImportSourceKey($('#import-url').value).startsWith('youtube:');},'input');
   bind('oma-import-back',()=>{capture();choose();});bind('oma-import-paste-instead',()=>{capture();draft.source='paste';content();});
   bind('oma-import-text-next',()=>{capture();if(!draft.text.trim())throw Error('Add the text you want to study.');review({title:draft.title||'Untitled lesson',text:draft.text,sourceType:source[0],cues:[]});});
   bind('oma-import-fetch',()=>busy(async()=>{capture();if(!draft.url||safeURL(draft.url)==='#')throw Error('Enter a public web or video URL.');if(omaImportSourceKey(draft.url).startsWith('youtube:')&&!['publisher','automatic','openai'].includes(draft.transcriptSource))throw Error('Choose available captions or OpenAI transcription first.');const form=$('#import-url');const job=await api('/api/import',{url:draft.url,transcriptSource:draft.transcriptSource,importMetadata:initial.item?importItemMetadata(initial.item):{sourceUrl:draft.url,title:draft.title}});trackBrowserImport(job,{show:!!form?.isConnected&&$('#dialog').open});}));
   bind('oma-import-fetch-audio',()=>busy(async()=>{capture();const file=$('#oma-import-audio').files[0],url=$('#oma-import-audio-url').value.trim();if(file)return recording(file);if(!url||safeURL(url)==='#')throw Error('Choose a recording or enter its direct audio URL.');const form=$('#oma-import-audio-url');const job=await api('/api/import-audio-url',{url});trackBrowserImport({...job,input:{...job.input,importMetadata:{sourceUrl:url,title:draft.title||'Audio import',sourceType:'audio'}}},{show:!!form?.isConnected&&$('#dialog').open});}));
   bind('oma-import-export-file',()=>pickFile('.srt,.vtt,.ttml,.ass,.txt,.pdf,.docx,.epub',file=>documents([file])));bind('oma-import-recording',()=>pickFile('audio/*,video/*',recording));
   const files=$('#oma-import-files'),drop=$('#oma-import-drop');if(files)files.onchange=act(()=>documents([...files.files]));if(drop){drop.onclick=e=>{if(e.target!==files)files.click();};drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();files.click();}};drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragover');};drop.ondragleave=()=>drop.classList.remove('dragover');drop.ondrop=act(e=>{e.preventDefault();drop.classList.remove('dragover');return documents([...e.dataTransfer.files]);});}
 const captionSelect=$('#youtube-transcript-source');if(captionSelect){const check=document.createElement('button');check.type='button';check.textContent='Check available subtitles';captionSelect.closest('label').after(check);const status=document.createElement('p');status.className='muted';status.setAttribute('role','status');check.after(status);check.onclick=()=>checkCaptionChoices(captionSelect,$('#import-url').value.trim(),status,true);$('#import-url').addEventListener('input',()=>{captionSelect.captionCheckRequest=(captionSelect.captionCheckRequest||0)+1;for(const option of captionSelect.options)if(['publisher','automatic'].includes(option.value)){option.disabled=true;option.textContent=(option.value==='publisher'?'Publisher':'Automatic')+' captions · check availability';}if(captionSelect.selectedOptions[0]?.disabled)captionSelect.value='';status.textContent='Check subtitles for this video before choosing captions.';});if(draft.url)checkCaptionChoices(captionSelect,draft.url,status);}
  });
 }

 function capture(){draft.transcriptSource=$('#youtube-transcript-source')?.value??draft.transcriptSource;draft.title=$('#import-title')?.value||draft.title;draft.text=$('#import-text')?.value??draft.text;draft.url=$('#import-url')?.value??draft.url;}
 async function busy(fn){const dialog=$('#dialog'),buttons=[...dialog.querySelectorAll('button:not(#close-dialog)')];buttons.forEach(b=>b.disabled=true);const status=$('#import-status');if(status)status.textContent='Preparing your content…';try{await fn();}catch(e){if(status?.isConnected)status.textContent=e.message;throw e;}finally{buttons.forEach(b=>{if(b.isConnected)b.disabled=false;});}}
 async function documents(files){if(!files.length)return;return busy(async()=>{capture();const origin=$('#dialog').firstElementChild;const results=[],ids=[];for(const file of files){if(file.size>22*1024*1024)throw Error(file.name+' exceeds the 22 MB document limit.');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const job=await api('/api/import',{name:file.name,data:btoa(binary)});ids.push(job.id);if(files.length===1){trackBrowserImport({...job,input:{...job.input,importMetadata:{title:draft.title||file.name.replace(/\.[^.]+$/,''),sourceType:'file'}}},{show:!!origin?.isConnected&&$('#dialog').open});return;}results.push(await waitJob(job.id));}const result=results.length===1?results[0]:{title:draft.title||'Imported documents',text:results.map(r=>r.text).join('\n\n'),chapters:results.flatMap(r=>r.chapters?.length?r.chapters:[{title:r.title,text:r.text}]),cues:[]};if(origin?.isConnected&&$('#dialog').open)review({...result,importJobIds:ids,title:draft.title||result.title,sourceType:draft.source||'file'});});}
 async function recording(file){capture();if(file.size>200*1024*1024)throw Error('Choose a recording smaller than 200 MB.');const form=$('#dialog').firstElementChild;const uploaded=await uploadAudio(file);const job=await api('/api/transcribe/openai',{media:uploaded.media});trackBrowserImport({...job,input:{...job.input,importMetadata:{title:draft.title||file.name.replace(/\.[^.]+$/,''),media:uploaded.media,sourceType:'audio'}}},{show:!!form?.isConnected&&$('#dialog').open});}
 function review(result){const item=initial.item;importPreview(item?{...result,publisher:item.sourceTitle,sourceSummary:item.summary||'',imageUrl:item.image||result.imageUrl,category:item.sourceCategory,feedItemId:item.id}:result,item?.sourceTitle||'',{back:()=>{draft.text=result.text;content();}});}
 if(draft.source&&omaImportSources.some(v=>v[0]===draft.source))content();else choose();
}
function omaImportTextChunks(text,limit){const tokens=[...text.matchAll(/\S+/g)];if(tokens.length<=limit)return [text];const chunks=[];let start=0,index=limit;while(index<tokens.length){const proposed=tokens[index].index;const after=text.slice(proposed,Math.min(text.length,proposed+500));const boundary=after.search(/[.!?](?:\s|$)|\n\n/);const end=boundary>=0?proposed+boundary+1:proposed;chunks.push(text.slice(start,end).trim());start=end;while(index<tokens.length&&tokens[index].index<end)index++;index+=limit;}if(text.slice(start).trim())chunks.push(text.slice(start).trim());return chunks;}
function importPreview(result,course='',options={}){
 let image=omaImportSafeImage(result.imageUrl||result.image||result.artwork||''),attached=result.media||'',working=false;
 const timed=!!(result.media||result.youtubeId||result.alignmentMedia),key=omaImportSourceKey(result.sourceUrl),existing=key?s.lessons.find(l=>omaImportSourceKey(l.sourceUrl)===key):null;
 const courses=[...new Set(s.lessons.map(l=>l.course).filter(Boolean))];
 modal('Import',omaImportSteps(2)+`${options.back?'<button id="oma-review-back" class="quiet">‹ Add Content</button>':''}<div id="oma-duplicate-info" class="oma-import-notice" ${existing?'':'hidden'}><strong>This source is already in your library.</strong><p id="oma-duplicate-title">${E(existing?.title||'')}</p><button id="oma-open-existing">Open existing lesson</button></div><div class="oma-import-review-grid"><div><label>Title<input id="preview-title" value="${E(result.title||'Imported lesson')}"></label><div class="oma-import-two"><label>Language<select id="preview-language"><option value="${E(activeStudyLanguage)}">${E(learningLanguage().name)}</option></select></label><label>Level<select id="preview-level"><option value="">Not specified</option>${omaImportLevels.map(v=>`<option ${result.level===v?'selected':''}>${v}</option>`).join('')}</select></label></div><label>Tags<input id="preview-tags" value="${E((result.tags||[]).join(', '))}" placeholder="Separate tags with commas"></label><label>Course<input id="preview-course" list="oma-course-options" value="${E(course||result.course||'')}" placeholder="Choose a course or type a new name"></label><datalist id="oma-course-options">${courses.map(v=>`<option value="${E(v)}"></option>`).join('')}</datalist></div><div class="oma-import-artwork"><div id="oma-artwork-preview">${image?`<img src="${E(image)}" alt="Lesson artwork">`:'<span>▤</span>'}</div><label>Image URL<input id="preview-image-url" type="url" value="${image.startsWith('http')?E(image):''}" placeholder="https://…"></label><div class="row wrap">${button('oma-image-upload','Upload image')}${button('oma-image-remove','Remove image')}</div><small>PNG, JPEG or WebP · up to 1 MB</small></div></div><label>Lesson text<textarea id="preview-text" rows="12">${E(result.text||'')}</textarea></label><p class="muted">${E(result.provider||'')} ${result.cues?.length?'· '+result.cues.length+' timed sentences':''}</p><details class="oma-import-extras"><summary>Audio, source and splitting</summary><p id="oma-attached-audio">${attached?'Original audio attached.':result.youtubeId?'Original YouTube video linked.':'No recording attached. O/L can read the lesson with its local voice.'}</p><div class="row wrap">${button('oma-review-audio','Attach or replace audio')}${button('oma-review-remove-audio','Remove attached audio')}</div><label>Or direct audio URL<input id="preview-audio-url" type="url" placeholder="https://…/recording.mp3"></label>${button('oma-review-audio-url','Attach audio URL')}<p class="muted">Attaching audio keeps your lesson text and aligns it automatically.</p><label>Original source URL<input id="preview-source" type="url" value="${E(result.sourceUrl||'')}" placeholder="https://…"></label><label>Split into lessons<select id="preview-split" ${timed?'disabled':''}><option value="none">Keep as one lesson</option>${result.chapters?.length>1?'<option value="chapters" selected>One lesson per chapter or file</option>':''}<option value="500">About 500 words</option><option value="1000">About 1,000 words</option><option value="2000">About 2,000 words</option></select></label>${timed?'<p class="muted">Audio lessons stay together so their playback timings remain accurate.</p>':''}</details><p id="import-status" role="status"></p><div class="oma-import-footer">${button('save-preview','Save','')}${button('oma-save-open','Save and Open','primary')}</div>`,()=>{
  bind('oma-review-back',options.back);bind('oma-open-existing',()=>{const source=omaImportSourceKey($('#preview-source').value);const match=s.lessons.find(l=>omaImportSourceKey(l.sourceUrl)===source);if(!match)throw Error('This source is not in the library.');$('#dialog').close();openLesson(match.id);});
  const showImage=()=>{$('#oma-artwork-preview').innerHTML=image?`<img src="${E(image)}" alt="Lesson artwork">`:'<span>▤</span>';};
  bind('preview-image-url',()=>{const value=$('#preview-image-url').value.trim();if(value&&safeURL(value)==='#')throw Error('Use an http or https image URL.');image=omaImportSafeImage(value);showImage();},'change');
  bind('oma-image-remove',()=>{image='';$('#preview-image-url').value='';showImage();});bind('oma-image-upload',()=>pickFile('image/png,image/jpeg,image/webp',async file=>{if(file.size>1024*1024)throw Error('Choose an image smaller than 1 MB.');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose PNG, JPEG or WebP.');image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('The image could not be read.'));reader.readAsDataURL(file);});$('#preview-image-url').value='';showImage();}));
  const updateAudio=()=>{$('#oma-attached-audio').textContent=attached?'Original audio attached.':'No recording attached.';$('#preview-split').disabled=!!(attached||result.youtubeId||result.alignmentMedia);};
  bind('oma-review-audio',()=>pickFile('audio/*,video/*',async file=>{attached=(await uploadAudio(file)).media;result={...result,cues:[],alignmentVersion:0};updateAudio();}));bind('oma-review-remove-audio',()=>{attached='';result={...result,media:undefined,alignmentMedia:result.youtubeId?result.alignmentMedia:undefined,cues:[],alignmentVersion:0};updateAudio();});
  bind('oma-review-audio-url',async()=>{const url=$('#preview-audio-url').value.trim();if(!url||safeURL(url)==='#')throw Error('Enter a direct audio URL.');$('#import-status').textContent='Downloading original audio…';const response=await api('/api/media-url',{url});const media=response.id?(await waitJob(response.id)):response;attached=media.media;result={...result,cues:[],alignmentVersion:0};updateAudio();$('#import-status').textContent='Audio attached.';});
  async function commit(open){
   if(working)return;const title=$('#preview-title').value.trim(),text=$('#preview-text').value,sourceUrl=$('#preview-source').value.trim();if(!title)throw Error('Enter a lesson title.');if(!text.trim())throw Error('Add readable lesson text.');if(sourceUrl&&safeURL(sourceUrl)==='#')throw Error('Use an http or https source URL.');
   const duplicate=s.lessons.find(l=>omaImportSourceKey(l.sourceUrl)&&omaImportSourceKey(l.sourceUrl)===omaImportSourceKey(sourceUrl));if(duplicate){$('#oma-duplicate-info').hidden=false;$('#oma-duplicate-title').textContent=duplicate.title;throw Error('This source is already imported. Open the existing lesson instead.');}
   const snapshot={title,text,importJobId:result.importJobId||undefined,importJobIds:result.importJobIds||undefined,course:$('#preview-course').value.trim(),tags:taglist($('#preview-tags').value),level:$('#preview-level').value,language:typeof activeStudyLanguage==='string'?activeStudyLanguage:'fi',imageUrl:image,image,sourceUrl,sourceType:result.sourceType||'personal',media:attached||undefined};const split=$('#preview-split').value;if(split==='chapters'&&text!==result.text)throw Error('To use edited text, choose Keep as one lesson or split by word count.');
   working=true;$('#save-preview').disabled=true;$('#oma-save-open').disabled=true;$('#import-status').textContent='Preparing your lesson…';
   try{
    let prepared={...result,...snapshot};if(attached||result.youtubeId||result.alignmentMedia)prepared={...prepared,...await ensureTranscriptTiming({...prepared,text:result.text,cues:attached!==result.media?[]:result.cues},text),...snapshot};
    const parts=!timed&&!attached&&split==='chapters'&&result.chapters?.length>1?result.chapters.map(c=>({title:c.title||title,text:c.text})):!timed&&!attached&&/^\d+$/.test(split)?omaImportTextChunks(text,Number(split)).map((text,i)=>({title:title+' · '+(i+1),text})):null;
    const items=parts?parts.filter(p=>p.text?.trim()).map(p=>newLesson({...snapshot,...p,course:snapshot.course||title,cues:[],chapters:undefined,alignmentVersion:0})): [newLesson({...prepared,chapters:undefined})];if(!items.length)throw Error('No readable text was found.');s.lessons.push(...items);save();$('#dialog').close();if(open)openLesson(items[0].id);else{lid=null;view='library';render();}toast(items.length===1?'Lesson imported.':items.length+' lessons imported into '+(snapshot.course||title)+'.');
   }catch(e){working=false;if($('#save-preview'))$('#save-preview').disabled=false;if($('#oma-save-open'))$('#oma-save-open').disabled=false;if($('#import-status'))$('#import-status').textContent=e.message;throw e;}
  }
  bind('save-preview',()=>commit(false));bind('oma-save-open',()=>commit(true));
 });
}

function importAudioLesson(){importDialog('audio');}

function readerSourceHeader(l){
 const source=safeURL(l.sourceUrl||'');let domain='';try{domain=new URL(l.sourceUrl).hostname.replace(/^www\./,'');}catch{}
 const publisher=l.publisher||domain||l.course||'Personal lesson';
 const image=omaImportSafeImage(l.imageUrl||l.image||'')||(l.youtubeId?'https://i.ytimg.com/vi/'+encodeURIComponent(l.youtubeId)+'/hqdefault.jpg':'');
 const count=C.words(l.text).length,duration=l.cues?.at(-1)?.end;
 const summary=String(l.sourceSummary||l.description||'').trim();
 return `<div class="reader-source-art">${image?`<img src="${E(image)}" alt="" referrerpolicy="no-referrer">`:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 15c8-2 15 0 22 5 7-5 14-7 22-5v34c-8-2-15 0-22 5-7-5-14-7-22-5Z M32 20v34" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>'}</div><div class="reader-source-copy"><div class="reader-source-publisher">${E(publisher)}</div><h1>${E(l.title)}</h1><div class="reader-source-facts"><span>${E(learningLanguage().name)}</span><span>${count.toLocaleString()} words</span><span>${duration?time(duration)+' audio':'About '+Math.max(1,Math.ceil(count/180))+' min read'}</span>${l.level?`<span>${E(l.level)}</span>`:''}</div>${summary?`<p class="reader-source-summary">${E(summary.slice(0,300))}${summary.length>300?'…':''}</p>`:''}${source&&source!=='#'?`<a class="reader-source-link" href="${E(source)}" target="_blank" rel="noopener noreferrer">Original source ↗</a>`:''}</div>`;
}
let readerManualScrollUntil=0;
const readerFollowState=new WeakMap();
for(const event of ['touchstart','touchmove','wheel','pointerdown'])document.addEventListener(event,e=>{
 if(e.target.closest?.('.reader-grid>article'))readerManualScrollUntil=performance.now()+3500;
},{passive:true,capture:true});
function followReaderPlayback(active,lesson,charStart){
 const article=active.closest('.reader-grid>article');if(!article||performance.now()<readerManualScrollUntil)return;
 const now=performance.now(),previous=readerFollowState.get(article);
 if(previous&&now-previous.at<800)return;
 const rect=active.getBoundingClientRect(),internal=article.scrollHeight>article.clientHeight+2;
 const bounds=internal?article.getBoundingClientRect():{top:0,bottom:innerHeight-115};
 const height=bounds.bottom-bounds.top;
 // Leave the lower third free on phones so the next lines stay visible ahead of speech.
 const lookAhead=matchMedia('(max-width:800px)').matches?Math.max(48,height*.35):48;
 if(rect.top>=bounds.top+24&&rect.bottom<=bounds.bottom-lookAhead)return;
 const delta=rect.top-(bounds.top+height*.3);
 const current=internal?article.scrollTop:window.scrollY;
 const limit=internal?article.scrollHeight-article.clientHeight:document.documentElement.scrollHeight-innerHeight;
 const target=Math.max(0,Math.min(limit,current+delta));
 if(Math.abs(target-current)<24)return;
 readerFollowState.set(article,{at:now});
 const behavior=matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
 if(internal)article.scrollTo({top:target,left:0,behavior});
 else window.scrollTo({top:target,left:0,behavior});
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

function installPlayerLabels(){
 player.addEventListener('loadedmetadata',applyPlaybackSpeed);
 for(const [id,label]of [['player-play','Play or pause the open lesson'],['player-prev','Previous sentence'],['player-next','Next sentence'],['player-back','Rewind 5 seconds'],['player-forward','Forward 5 seconds'],['player-loop','Repeat audio'],['player-sleep','Sleep timer']]){const el=$('#'+id);if(el){el.title=label;el.setAttribute('aria-label',label);}}
 $('#player-seek').title='Position within the current recording or spoken sentence';
}
function applyPlaybackSpeed(){
 const rate=Number(s.settings.rate)||.85;
 const effective=rate/(player.generatedRate||1);
 player.defaultPlaybackRate=effective;player.playbackRate=effective;player.preservesPitch=true;
 if(pronunciation){const pronunciationRate=rate/(pronunciation.generatedRate||1);pronunciation.defaultPlaybackRate=pronunciationRate;pronunciation.playbackRate=pronunciationRate;pronunciation.preservesPitch=true;}
 if(videoMode)youtube?.setPlaybackRate?.(rate);
 const select=$('#player-rate');if(select)select.value=String(rate);
}
async function setPlaybackSpeed(value){
 const rate=Number(value);if(![.5,.7,.85,1,1.2,1.5,2].includes(rate))return;
 s.settings.rate=rate;s.settings.playbackSpeedVersion=1;save();
 if(!['ElevenLabs via OpenRouter','Piper'].includes(player.generatedProvider)||!clips.length||!playingLesson){applyPlaybackSpeed();return;}
 const lesson=playingLesson,index=clipIndex,wasPlaying=mediaPlaying(),fraction=Number.isFinite(player.duration)&&player.duration>0?player.currentTime/player.duration:0;
 const request=player.paceRequest=(player.paceRequest||0)+1;pauseMedia();$('#player-source').textContent='Preparing natural speech at '+rate+'×…';
 try{const r=await api('/api/tts',{text:clips[index].slice(0,20000),speed:rate});if(request!==player.paceRequest||playingLesson!==lesson||clipIndex!==index)return;player.generatedRate=r.nativeRate||1;player.generatedProvider=r.provider;player.addEventListener('loadedmetadata',()=>{if(request===player.paceRequest&&Number.isFinite(player.duration))player.currentTime=Math.min(fraction*player.duration,Math.max(0,player.duration-.01));},{once:true});player.src=languageURL(r.url);applyPlaybackSpeed();$('#player-source').textContent=r.provider+' · '+r.voice+' · natural '+(r.nativeRate||1)+'×';if(wasPlaying&&!lessonPlaybackSuspended)await playMedia();}
 catch(e){applyPlaybackSpeed();throw e;}
}
function toggleReaderSentenceView(){
 const l=current();if(!l)return;
 pauseMedia();readerSentenceRange=null;s.settings.sentenceMode=!s.settings.sentenceMode;chosen='';anchor=null;save();reader(l);
 const article=$('#reader-text')?.closest('article');if(article)article.scrollTop=0;
 if(!s.settings.sentenceMode){const p=C.segments(l.text)[s.positions[l.id]||0];const active=$$('#reader-text .token').find(el=>Number(el.dataset.start)>=p?.start);if(active)followReaderPlayback(active,l,p.start);}
}
async function navigateReaderSentence(delta){
 trackRead();const l=current();if(!l)return;
 const parts=C.segments(l.text),wasPlaying=mediaPlaying();pauseMedia();
 s.positions[l.id]=Math.max(0,Math.min(parts.length-1,Number(s.positions[l.id]||0)+delta));chosen='';anchor=null;save();reader(l);
 const sentence=parts[s.positions[l.id]];if(!sentence)return;
 if(playingLesson===l.id){
  if(clips.length){clipIndex=s.positions[l.id];await loadClip();if(wasPlaying&&playingLesson===l.id)await playMedia();}
  else{const cue=l.cues.find(c=>Number.isFinite(c.charStart)?c.charStart>=sentence.start&&c.charStart<sentence.end:c.text===sentence.text);if(cue){readerSentenceRange=s.settings.sentenceMode?{start:cue.start,end:cue.end}:null;seekMedia(cue.start);syncPlaybackHighlight();if(wasPlaying)await playMedia();}}
 }else if(s.settings.autoSentence)await speak(sentence.text);
 const el=$$('#reader-text .token').find(el=>s.settings.sentenceMode||Number(el.dataset.start)>=sentence.start);if(el)followReaderPlayback(el,l,sentence.start);
}
function startReaderSentenceReview(){
 const l=current();if(!l)return;pauseMedia();
 const sentence=C.segments(l.text)[Number(s.positions[l.id]||0)]?.text;if(!sentence)return;
 paritySentenceOnly=true;review={terms:[sentence],items:{[sentence]:{term:sentence,meaning:l.sentenceTranslations?.[sentence]||'',context:sentence,status:1,due:0,lessonId:l.id}},index:0,type:'unscramble',material:'sentences',reschedule:false,autospeak:false,cardFields:[],skips:0,results:[],retries:new Set(),graded:false};
 view='review';reviewCard();
}
function closeReaderSentenceReview(){review=null;paritySentenceOnly=false;view='library';render();}

let readerSentenceRange=null;
function readerTimelineTime(){return readerSentenceRange?Math.max(0,mediaTime()-readerSentenceRange.start):mediaTime();}
function readerTimelineDuration(){return readerSentenceRange?readerSentenceRange.end-readerSentenceRange.start:mediaDuration();}
function seekReaderTimeline(fraction){seekMedia((readerSentenceRange?.start||0)+fraction*readerTimelineDuration());syncPlaybackHighlight();}
async function playSelectedReaderSentence(){
 const l=current();if(!l)return;const index=Number(s.positions[l.id]||0),part=C.segments(l.text)[index];if(!part)return;
 if(playingLesson!==l.id||(!player.src&&!videoMode))await playLesson(l.id);
 if(view!=='library'||lid!==l.id||playingLesson!==l.id)return;
 if(clips.length){if(clipIndex!==index){clipIndex=index;await loadClip();}else if(player.ended)seekMedia(0);readerSentenceRange=null;}
 else{const cue=l.cues.find(c=>Number.isFinite(c.charStart)?c.charStart>=part.start&&c.charStart<part.end:c.text===part.text);if(!cue)throw Error('This sentence has no audio timing.');readerSentenceRange={start:cue.start,end:cue.end};seekMedia(cue.start);$('#player-source').textContent='Original audio · sentence '+(index+1)+'/'+C.segments(l.text).length;}
 await playMedia();
}
setInterval(()=>{if(readerSentenceRange&&mediaPlaying()&&mediaTime()>=readerSentenceRange.end){if(player.loop)seekMedia(readerSentenceRange.start);else pauseMedia();}},100);

function syncLocalSpeechFollow(){
 if(view!=='library'||playingLesson!==lid||!clips.length)return;
 const l=current(),part=C.segments(l?.text||'')[clipIndex];if(!l||!part)return;
 // Restore the sentence immediately, including time zero and after a redraw.
 const offset=s.settings.sentenceMode?part.start+l.text.slice(part.start,part.end).indexOf(part.text):0;
 const root=$('#reader-text'),mark=l.id+':'+clipIndex+':'+s.settings.sentenceMode;let active=syncLocalSpeechFollow.active;
 if(syncLocalSpeechFollow.root!==root||syncLocalSpeechFollow.mark!==mark||!active?.isConnected){
 active=null;for(const el of $$('#reader-text .token')){const start=Number(el.dataset.start)+offset,end=Number(el.dataset.end)+offset;const on=start<part.end&&end>part.start;el.classList.toggle('sounding',on);if(on&&!active)active=el;}
 syncLocalSpeechFollow.root=root;syncLocalSpeechFollow.mark=mark;syncLocalSpeechFollow.active=active;
 }
 if(active&&!player.paused){
  const progress=Number.isFinite(player.duration)&&player.duration>0?Math.min(.99,player.currentTime/player.duration):0;
  const relative=Math.floor(part.text.length*progress),start=part.start+l.text.slice(part.start,part.end).indexOf(part.text);
  const target=$$('#reader-text .sounding').find(el=>Number(el.dataset.end)+offset>=start+relative)||active;
  followReaderPlayback(target,l,part.start+relative);
 }
}

function refreshSentenceVocabulary(){
 const section=$('.reader-vocabulary-list'),l=current();if(!section||!l)return;
 const sentence=C.segments(l.text)[Number(s.positions[l.id]||0)]?.text||'';
 const words=[...new Set([...C.words(sentence).map(C.norm),...C.matches(s,sentence).map(p=>p.term)])];
 const learning=k=>s.words[k]&&s.words[k].status>=1&&s.words[k].status<=4;
 const groups={saved:words.filter(learning),new:words.filter(k=>!s.words[k]||s.words[k].status===0),all:words};
 const tab=groups[parityReaderList]?parityReaderList:'saved';
 section.innerHTML='<div class="reader-list-tabs" role="tablist" aria-label="Sentence vocabulary">'+[['saved','O/L Words'],['new','New Words'],['all','All Words']].map(([id,label])=>`<button role="tab" aria-selected="${tab===id}" data-reader-list="${id}" class="${tab===id?'active':''}">${label} <small>${groups[id].length}</small></button>`).join('')+'</div><div class="sentence-vocabulary-entries">'+(groups[tab].map(k=>{const w=s.words[k];return `<div class="reader-vocab-entry"><span class="status-circle level-${w?.status||0}" title="${w?statusName(w.status):'New word'}">${w?.status===5?'✓':w?.status===-1?'−':w?.status||'＋'}</span><button class="reader-vocab-meaning" data-reader-term="${E(k)}"><strong>${E(k)}</strong><small>${E(w?.meaning||'Choose a meaning')}</small></button><button class="reader-vocab-pronounce" data-reader-speak="${E(k)}" aria-label="Pronounce ${E(k)}">${speakerIcon()}</button></div>`;}).join('')||`<p class="muted">${tab==='saved'?'No O/L Words in this sentence yet. Choose New Words to save a meaning.':'No new words in this sentence.'}</p>` )+'</div>';
 section.querySelectorAll('[data-reader-list]').forEach(b=>b.onclick=()=>{parityReaderList=b.dataset.readerList;refreshSentenceVocabulary();});
 section.querySelectorAll('[data-reader-term]').forEach(b=>b.onclick=()=>termPanel(b.dataset.readerTerm,sentence));
 section.querySelectorAll('[data-reader-speak]').forEach(b=>b.onclick=act(()=>speak(b.dataset.readerSpeak)));
 $$('#reader-text .token').forEach(el=>{const w=s.words[C.norm(el.textContent)];for(const name of [...el.classList])if(name.startsWith('level-'))el.classList.remove(name);el.classList.add('level-'+(w?.status||0));});
}

function reviewCard(){reviewCardBase();decorateSentenceReview();}
function decorateSentenceReview(){
 const active=view==='review'&&paritySentenceOnly;document.body.classList.toggle('sentence-review-mode',active);$('#main').classList.toggle('sentence-review-page',active);if(!active)return;
 const top=$('.review-topline'),back=$('#review-close'),options=$('#review-options');
 if(top&&back){back.textContent='← Back to lesson';back.setAttribute('aria-label','Back to lesson');back.className='sentence-review-back';const context=document.createElement('div');context.className='sentence-review-context';const label=document.createElement('small');label.textContent='Sentence practice';const title=document.createElement('strong');title.textContent=current()?.title||'Your lesson';context.append(label,title);top.replaceChildren(back,context);if(options)top.append(options);}
 const card=$('.review-card');if(!card)return;const actions=document.createElement('div');actions.className='sentence-review-actions';actions.setAttribute('role','group');actions.setAttribute('aria-label','Sentence practice controls');
 for(const id of ['review-audio','reset-pieces','skip-review','check-pieces','next-review','finish-review']){const button=$('#'+id);if(button){if(id==='finish-review')button.textContent='Back to lesson';actions.append(button);}}
 card.querySelectorAll('.row.wrap').forEach(row=>{if(!row.children.length)row.remove();});if(actions.children.length)card.append(actions);
}

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

function openRouterSettings(){
 modal('OpenRouter · Speech',`<p>Connect your OpenRouter account for ElevenLabs speech.</p><label>OpenRouter API key<input id="openrouter-key" type="password" autocomplete="off" spellcheck="false" autocapitalize="none" placeholder="sk-or-v1-…"></label><p class="muted">Stored securely on this computer with Windows encryption. The saved key is never returned to the browser or included in library backups.</p><div class="row wrap"><button id="openrouter-save" class="primary">Save key</button><button id="openrouter-test">Test connection</button><button id="openrouter-forget">Remove key</button></div><p id="openrouter-status" role="status">Checking connection settings…</p><section class="panel"><strong>Next: choose your voice</strong><p>Eleven Multilingual v2 is the planned speech model. Saving a key does not switch playback yet; we’ll choose and test one fixed Finnish voice first.</p></section><a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">Create an OpenRouter key ↗</a>`,()=>{
  const status=text=>{const el=$('#openrouter-status');if(el)el.textContent=text;};
  api('/api/openrouter/config').then(c=>status(c.keyConfigured?'A key is saved securely.':'No OpenRouter key saved yet.')).catch(e=>status(e.message));
  bind('openrouter-save',async()=>{const input=$('#openrouter-key'),key=input.value;const button=$('#openrouter-save');button.disabled=true;try{await api('/api/openrouter/config',{apiKey:key});input.value='';status('Key saved securely. You can now test the connection.');}catch(e){status(e.message);}finally{button.disabled=false;}});
  bind('openrouter-test',async()=>{const button=$('#openrouter-test');button.disabled=true;status('Testing the saved key…');try{const result=await api('/api/openrouter/test',{});status(result.message);}catch(e){status(e.message);}finally{button.disabled=false;}});
  bind('openrouter-forget',async()=>{await api('/api/openrouter/config',undefined,'DELETE');$('#openrouter-key').value='';status('OpenRouter key removed.');});
 });
}

function openRouterSettings(){aiConnectionSettings();}
function aiConnectionSettings({embedded=false}={}){
 if(!embedded){openSettings('connections');return;}
 const dialog=$('#settings-content');const present=(title,html,setup)=>{dialog.innerHTML=html;setup?.();};present('AI & Connections','<p id="connections-loading" role="status">Loading your connections…</p>');dialog.classList.add('connections-dialog');
 const status=text=>{const el=$('#connections-status');if(el)el.textContent=text;};
 Promise.all([api('/api/openai/config'),api('/api/openrouter/config'),api('/api/openrouter/voices')]).then(([ai,router,catalog])=>{
 if(!dialog.isConnected||view!=='settings'||settingsTab!=='connections'||!$('#connections-loading'))return;
 const title=voice=>voice.charAt(0).toUpperCase()+voice.slice(1);
 present('AI & Connections',`<p class="muted">Choose services for learning assistance and generated speech. Original recordings play as recorded.</p><section class="connection-section"><h3>Learning assistance</h3><label>AI provider<select id="ai-provider"><option value="openai" ${s.settings.aiProvider==='openai'?'selected':''}>OpenAI</option><option value="ollama" ${s.settings.aiProvider!=='openai'?'selected':''}>Ollama · local</option></select></label><label>OpenAI text model<input id="openai-model" value="${E(ai.textModel||ai.model||'gpt-4.1-mini')}"></label><small>Used for chat, translation and explanations. Imports use OpenAI gpt-transcribe separately.</small></section><section class="connection-section"><h3>Generated speech</h3>${router.keyConfigured&&ai.speechProvider!=='openrouter'?'<p class="connection-notice">Your OpenRouter key is saved. Choose ElevenLabs below to use it.</p>':''}<label>Speech provider<select id="speech-provider"><option value="openrouter" ${ai.speechProvider==='openrouter'?'selected':''}>ElevenLabs via OpenRouter</option><option value="openai" ${ai.speechProvider==='openai'?'selected':''}>OpenAI</option><option value="piper" ${ai.speechProvider==='piper'?'selected':''}>Piper Harri · local, free</option></select></label><div id="eleven-voice-fields"><p>Eleven Multilingual v2 · ${E(learningLanguage().name)} narration</p><label>Narrator voice<select id="openrouter-voice"><option value="">Choose a voice…</option>${(catalog.voices||[]).map(v=>`<option value="${E(v)}" ${router.voice===v?'selected':''}>${E(title(v))}</option>`).join('')}</select></label><button id="preview-eleven">▶ Preview voice · API usage</button><audio id="voice-preview" controls hidden preload="none" aria-label="Voice preview"></audio><small>Preview before choosing. One fixed voice is used for words and sentences; recordings are cached locally.</small></div><div id="openai-voice-fields"><label>OpenAI voice<select id="speech-voice"><option value="marin" ${ai.speechVoice==='marin'?'selected':''}>Marin</option><option value="cedar" ${ai.speechVoice==='cedar'?'selected':''}>Cedar</option></select></label><small>GPT Realtime 2.1 Mini</small></div><p class="muted">Cloud speech is AI-generated and incurs provider usage charges.</p></section><section class="connection-section"><h3>API keys</h3><details id="router-credentials"><summary>OpenRouter <span>${router.keyConfigured?'Key saved':'Not connected'}</span></summary><label>OpenRouter API key<input id="openrouter-key" type="password" autocomplete="off" spellcheck="false" placeholder="${router.keyConfigured?'Saved securely · enter only to replace':'sk-or-v1-…'}"></label><div class="row wrap"><button id="openrouter-test">Test saved key</button><button id="openrouter-forget">Remove key</button></div></details><details><summary>OpenAI <span>${ai.keyConfigured?'Key saved':'Not connected'}</span></summary><label>OpenAI API key<input id="openai-key" type="password" autocomplete="off" spellcheck="false" placeholder="${ai.keyConfigured?'Saved securely · enter only to replace':'sk-…'}"></label><div class="row wrap"><button id="openai-test">Test saved key</button><button id="openai-forget">Remove key</button></div></details><small>Keys stay encrypted on this computer and are excluded from library backups. Leave a key field empty to keep its saved value.</small></section><p id="connections-status" role="status"></p><div class="connections-footer"><button id="connections-save" class="primary">Save settings</button></div>`,()=>{
  dialog.classList.add('connections-dialog');
  let previewSequence=0;
  const showVoice=()=>{const provider=$('#speech-provider').value;$('#eleven-voice-fields').hidden=provider!=='openrouter';$('#openai-voice-fields').hidden=provider!=='openai';const voice=$('#openrouter-voice').value;$('#preview-eleven').disabled=!voice;$('#preview-eleven').textContent=voice?'▶ Preview '+title(voice)+' in '+learningLanguage().name+' · API usage':'▶ Choose a narrator to preview';};
  const resetPreview=()=>{previewSequence++;const audio=$('#voice-preview');audio.pause();audio.removeAttribute('src');audio.removeAttribute('data-voice');audio.load();audio.hidden=true;showVoice();const voice=$('#openrouter-voice').value;status(voice?'Selected '+title(voice)+'. Press Preview to hear this narrator.':'Choose a narrator to preview.');};
  showVoice();bind('speech-provider',resetPreview,'change');bind('openrouter-voice',resetPreview,'change');
  const saveRouterKey=async()=>{const key=$('#openrouter-key').value.trim();if(key){await api('/api/openrouter/config',{apiKey:key});$('#openrouter-key').value='';router.keyConfigured=true;}};
  bind('connections-save',async()=>{const button=$('#connections-save');button.disabled=true;status('Saving…');try{const provider=$('#speech-provider').value,voice=$('#openrouter-voice').value;if(provider==='openrouter'&&!voice)throw Error('Choose a narrator voice first.');await saveRouterKey();if(provider==='openrouter')await api('/api/openrouter/config',{voice});const key=$('#openai-key').value.trim(),model=$('#openai-model').value.trim();await api('/api/openai/config',{...(key?{apiKey:key}:{}),model,speechProvider:provider,speechVoice:$('#speech-voice').value,enabled:ai.enabled||$('#ai-provider').value==='openai'||provider==='openai'});$('#openai-key').value='';s.settings.aiProvider=$('#ai-provider').value;s.settings.openaiModel=model;s.settings.ollamaModel=$('#ollama-model').value.trim();s.settings.whisperModel=$('#whisper-model').value;save();status('Saved. '+(provider==='openrouter'?'ElevenLabs · '+title(voice):provider==='openai'?'OpenAI · '+title($('#speech-voice').value):'Piper Harri')+' is selected for generated speech.');}catch(e){status(e.message);}finally{button.disabled=false;}});
  bind('preview-eleven',async()=>{OmaAudio.prime($('#voice-preview'));const button=$('#preview-eleven'),voice=$('#openrouter-voice').value,sequence=++previewSequence;const stillCurrent=()=>sequence===previewSequence&&button.isConnected&&dialog.isConnected&&view==='settings'&&settingsTab==='connections'&&$('#openrouter-voice')?.value===voice;button.disabled=true;button.textContent='Preparing '+title(voice)+'…';pauseMedia();if(pronunciation)pronunciation.pause();status('Preparing '+title(voice)+' in '+learningLanguage().name+'…');try{await saveRouterKey();const r=await api('/api/openrouter/preview',{voice,speed:s.settings.rate});if(!stillCurrent())return;if(r.voice!==voice)throw Error('The preview returned another narrator. Please try again.');const audio=$('#voice-preview');audio.pause();audio.src=languageURL(r.url);audio.dataset.voice=voice;audio.setAttribute('aria-label',title(voice)+' · '+learningLanguage().name+' voice preview');audio.load();audio.hidden=false;audio.playbackRate=(Number(s.settings.rate)||.85)/(r.nativeRate||1);const started=await playAudioElement(audio,stillCurrent);if(stillCurrent())status(started?'Playing '+title(voice)+'. Choose Save settings to use this narrator.':'Audio is ready. Tap Play audio to hear this narrator.');}catch(e){if(stillCurrent())status(e.message);}finally{if(stillCurrent())showVoice();}});
  for(const provider of ['openrouter','openai']){
   bind(provider+'-test',async()=>{try{if(provider==='openrouter')await saveRouterKey();const r=await api('/api/'+provider+'/test',{});status(r.message||'Connection works.');}catch(e){status(e.message);}});
   bind(provider+'-forget',async()=>{try{await api('/api/'+provider+'/config',undefined,'DELETE');$('#'+provider+'-key').value='';const summary=$('#'+provider+'-key').closest('details')?.querySelector('summary span');if(summary)summary.textContent='Not connected';if(provider==='openai')ai.keyConfigured=false;else router.keyConfigured=false;status(title(provider)+' key removed.');}catch(e){status(e.message);}});
  }
  settingsLocalTools(dialog);dialog.addEventListener('close',()=>{const preview=$('#voice-preview');preview?.pause();dialog.classList.remove('connections-dialog');},{once:true});
 });
 }).catch(e=>{if(dialog.isConnected&&view==='settings'&&settingsTab==='connections')present('AI & Connections','<p role="alert">Could not load your connections. '+E(e.message)+'</p><button id="retry-connections">Try again</button>',()=>bind('retry-connections',()=>aiConnectionSettings({embedded:true})));});
}

let ankiStatus={enabled:false},ankiTimer,ankiRunning,ankiDurableWords,ankiRestorePending=false,ankiError='';
const ankiDesktopEnabled=()=>ankiStatus.enabled&&ankiStatus.mode!=='server';
const ankiWordLinked=word=>ankiDesktopEnabled()&&word?.ankiDeckId===ankiStatus.deckId&&Number.isSafeInteger(word?.ankiNoteId);
const wordReady=word=>!!word.meaning&&(ankiWordLinked(word)?word.ankiDue===true:word.status>=1&&word.status<=4&&word.due<=Date.now());

function showAnkiStatus(message){
 const status=$('#anki-sync-status');
 if(!status)return;
 status.textContent=message||ankiError||(!ankiStatus.available?'Restart O/L to connect to Anki.':ankiStatus.mode==='server'&&!ankiStatus.accountConnected?'Your account needs an Anki connection. Ask the administrator to link your personal collection.':!ankiStatus.enabled?
  (ankiStatus.linked?'Sync is paused.':'Sync is off.'):
  ankiStatus.lastSync?'Last synced '+new Date(ankiStatus.lastSync).toLocaleString()+'. '+(ankiStatus.notice||''):'Ready to sync.');
}
async function loadAnkiStatus(){
 try{ankiStatus={...await api('/api/anki-sync'),available:true};}
 catch{ankiStatus={enabled:false,available:false};}
}
function queueAnkiSync(delay=1800){
 clearTimeout(ankiTimer);
 if(!connected||!ankiStatus.enabled)return;
 ankiTimer=setTimeout(()=>{
  if(document.hidden)return queueAnkiSync(45000);
  syncAnki().catch(()=>{});
 },delay);
}
async function startAnkiSync(){
 await loadAnkiStatus();
 queueAnkiSync(1500);
}
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&ankiStatus.enabled)queueAnkiSync(1000);
});

function applyAnkiWords(before,words){
 for(const term of new Set([...Object.keys(before),...Object.keys(words)])){
  const previous=before[term],remote=words[term];
  if(JSON.stringify(previous)===JSON.stringify(remote))continue;
  if(!remote){delete s.words[term];selected.delete(term);continue;}
  const current=s.words[term];
  if(!previous||!current){s.words[term]={...current,...remote};continue;}
  // Preserve unrelated edits made in this tab while Anki was responding.
  for(const [key,value] of Object.entries(remote)){
   if(JSON.stringify(value)!==JSON.stringify(previous[key])||JSON.stringify(current[key])===JSON.stringify(previous[key]))current[key]=value;
  }
 }
}
function syncAnki(){
 if(ankiRunning)return ankiRunning;
 ankiRunning=(async()=>{
  if(accountStorage.getItem('oma-pending-v2'))await flush();
  showAnkiStatus('Syncing with Anki…');
  const task=saveChain.catch(()=>{}).then(async()=>{
   const before=ankiDurableWords;
   const result=await api('/api/anki-sync',{action:'sync',revision});
   revision=result.revision;
   ankiStatus={...result.anki,available:true};
   if(result.words){
    applyAnkiWords(before,result.words);
    ankiDurableWords=result.words;
    accountStorage.setItem('oma-reader-v2',JSON.stringify(s));
    if(accountStorage.getItem('oma-pending-v2'))accountStorage.setItem('oma-pending-v2',JSON.stringify({state:s,revision,ankiRestore:ankiRestorePending}));
   }
   return result;
  });
  saveChain=task;
  return task;
 })().then(result=>{
  ankiError='';
  if(result.words&&view==='words'&&!$('#dialog')?.open&&!document.activeElement?.matches('input, select, textarea'))render();
  showAnkiStatus();
  return result;
 }).catch(error=>{
  ankiError=error.message;
  showAnkiStatus();
  throw error;
 }).finally(()=>{
  ankiRunning=null;
  queueAnkiSync(45000);
 });
 return ankiRunning;
}
async function practiseInAnki(){
 await syncAnki();
 await api('/api/anki-sync',{action:'review'});
 toast('Review opened in Anki Desktop.');
}
function ankiSettings(){
 const host=$('#settings-content');
 host.innerHTML=`<section class="settings-card"><h2>Anki sync</h2>
 <div id="anki-connection-description"><p>Checking your Anki connection…</p></div>
 <p id="anki-sync-deck" class="muted"></p><div class="row wrap" id="anki-sync-controls"></div>
 <p id="anki-sync-status" role="status">Checking the connection…</p></section>`;
 const controls=host.querySelector('#anki-sync-controls');
 const deck=host.querySelector('#anki-sync-deck');
 function draw(){
  if(!host.isConnected)return;
  const server=ankiStatus.mode==='server';
  host.querySelector('#anki-connection-description').innerHTML=server?
   `<p>Sync your saved ${E(learningLanguage().name)} words with your personal Anki collection. Words added from your other connected apps appear here too. If both sides edit a meaning, the central collection wins.</p><p>Anki Desktop does not need to stay open. Set your Anki app’s custom sync server to <strong>${E(ankiStatus.syncServer||'')}</strong> and use your personal Anki login. Review progress syncs between your Anki clients; O/L keeps its own practice progress.</p><p class="muted">Context, notes and familiarity stay in O/L. Removing a word here does not delete it from Anki; it can return on the next sync.</p>`:
   `<p>Sync saved words for ${E(learningLanguage().name)} with a dedicated deck in Anki Desktop. When both apps change the same field, Anki’s version wins.</p><p>Keep Anki Desktop open with the <a href="https://ankiweb.net/shared/info/2055492159" target="_blank" rel="noopener">AnkiConnect add-on</a> running. Anki manages review scheduling for linked words.</p>`;
  deck.textContent=ankiStatus.deck?'Deck in Anki · '+ankiStatus.deck:'';
  controls.innerHTML=ankiStatus.available?`<button id="anki-test">Test connection</button>
   ${ankiStatus.enabled?'<button id="anki-sync-now" class="primary">Sync now</button><button id="anki-pause">Pause sync</button>':
   '<button id="anki-enable" class="primary">'+(ankiStatus.linked?'Resume sync':'Enable sync')+'</button>'}`:'';
  if(server&&!ankiStatus.accountConnected)controls.querySelectorAll('button').forEach(button=>button.disabled=true);
  showAnkiStatus();
  const on=(id,action)=>bind(id,async event=>{
   const buttons=[...controls.querySelectorAll('button')];
   buttons.forEach(b=>b.disabled=true);
   try{await action();}catch(error){showAnkiStatus(error.message);}
   finally{buttons.forEach(b=>b.disabled=false);}
  });
  on('anki-test',async()=>{
   const result=await api('/api/anki-sync',{action:'test'});
   showAnkiStatus(result.mode==='server'?'Connected to your personal Anki collection.':'Connected to AnkiConnect. API version '+result.version+'.');
  });
  on('anki-enable',async()=>{
   showAnkiStatus('Linking your Anki deck…');
   await flush();
   ankiStatus={...await api('/api/anki-sync',{action:'enable'}),available:true};
   ankiError='';
   try{await syncAnki();}finally{draw();}
  });
  on('anki-sync-now',()=>syncAnki());
  on('anki-pause',async()=>{
   if(ankiRunning)await ankiRunning.catch(()=>{});
   ankiStatus={...await api('/api/anki-sync',{action:'pause'}),available:true};
   ankiError='';
   queueAnkiSync();
   draw();
  });
 }
 loadAnkiStatus().then(draw);
}

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

function transcriptOptionsDialog(l){
 modal('Transcript',`<p><strong>Current source:</strong> ${E(l.transcriptProvider||'Lesson text')}</p><p>Choose a new source to preview before replacing the text. Your current transcript will be kept in history; saved vocabulary is retained.</p><label>Transcript source<select id="lesson-transcript-source">${l.youtubeId?'<option value="publisher">YouTube publisher captions · if available</option><option value="automatic">YouTube automatic captions · if available</option>':''}${l.media||l.youtubeId?'<option value="openai">OpenAI · new audio transcription (API usage)</option>':''}${l.media||l.alignmentMedia?'<option value="local">Whisper · local audio transcription</option>':''}<option value="file">Upload a subtitle file</option></select></label><div class="row wrap"><button id="transcript-continue" class="primary">Continue</button><button id="transcript-history">Earlier versions</button>${l.youtubeId?'<button id="transcript-check-captions">Recheck subtitles</button>':''}</div><p id="transcript-choice-status" role="status"></p>`,()=>{
  bind('transcript-history',()=>transcriptHistoryDialog(l));
  bind('transcript-check-captions',()=>checkCaptionChoices($('#lesson-transcript-source'),'https://www.youtube.com/watch?v='+l.youtubeId,$('#transcript-choice-status'),true));
  if(l.youtubeId)checkCaptionChoices($('#lesson-transcript-source'),'https://www.youtube.com/watch?v='+l.youtubeId,$('#transcript-choice-status'));
  bind('transcript-continue',async()=>{const source=$('#lesson-transcript-source').value;if(source==='openai'){openAITranscriptDialog(l);return;}if(source==='file'){pickFile('.srt,.vtt,.ttml,.ass',async file=>{const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));const job=await api('/api/import',{name:file.name,data:btoa(raw)});const result=await waitJob(job.id);showOpenAITranscriptPreview(l,{...result,provider:'Subtitle file · '+file.name,captionSource:'file',alignmentVersion:result.cues?.length?1:0});});return;}
   const button=$('#transcript-continue');button.disabled=true;$('#transcript-choice-status').textContent=source==='local'?'Transcribing on this computer…':'Fetching '+(source==='publisher'?'publisher captions':'automatic captions')+'…';try{const job=source==='local'?await api('/api/transcribe',{media:l.media||l.alignmentMedia,model:s.settings.whisperModel||'base'}):await api('/api/import',{url:'https://www.youtube.com/watch?v='+l.youtubeId,transcriptSource:source});const result=await waitJob(job.id);showOpenAITranscriptPreview(l,result);}catch(e){const status=$('#transcript-choice-status');if(status)status.textContent=e.message;}finally{if(button.isConnected)button.disabled=false;}
  });
 });
}


async function checkCaptionChoices(select,url,status,refresh=false){
 if(!select||!status)return;
 const request=select.captionCheckRequest=(select.captionCheckRequest||0)+1;
 const previous=select.value;
 for(const option of select.options)if(['publisher','automatic'].includes(option.value)){option.disabled=true;option.textContent=(option.value==='publisher'?'Publisher':'Automatic')+' captions · checking…';}
 if(['publisher','automatic'].includes(select.value))select.value=[...select.options].find(o=>o.value==='file')?.value||[...select.options].find(o=>!o.disabled)?.value||'';
 const fallback=select.value;
 status.textContent='Checking available YouTube subtitles…';
 try{
  const result=await api('/api/youtube/captions',{url,refresh});if(!select.isConnected||request!==select.captionCheckRequest)return;
  for(const mode of ['publisher','automatic']){const option=[...select.options].find(o=>o.value===mode);if(!option)continue;const match=result.tracks.find(t=>t.source===mode&&t.finnish);option.disabled=!match;option.textContent=match?match.name+' · YouTube '+mode+' captions':(mode==='publisher'?'Publisher':'Automatic')+' captions · no '+learningLanguage().name+' track';}
  if(select.value===fallback&&[...select.options].some(o=>o.value===previous&&!o.disabled))select.value=previous;
  const describe=mode=>result.tracks.filter(t=>t.source===mode).map(t=>t.name+' ('+t.language+')').join(', ')||'none';
  status.textContent='Available subtitles — Publisher: '+describe('publisher')+'. Automatic: '+describe('automatic')+'. Tracks matching the study language can be used. Translated tracks are excluded.';
 }catch(error){if(!select.isConnected||request!==select.captionCheckRequest)return;status.textContent='Could not check subtitles: '+error.message+' Retry the check; availability has not been confirmed.';}
}

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
  const collapsed=innerWidth<=800;dock.classList.toggle('video-collapsed',collapsed);wrap.inert=collapsed;
  const close=$('#close-video'),hide=document.createElement('button');hide.id='toggle-reader-video';hide.type='button';hide.textContent=collapsed?'Show video':'Hide video';hide.setAttribute('aria-expanded',String(!collapsed));
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

function importButtonLabel(job){return job.status==='ready'?'Review import':job.status==='failed'?'Retry import':'Importing…';}
/* Server-owned imports survive closing the browser. Results remain reviewable. */
let backgroundImportJobs=[],importMonitorTimer=null,importPollBusy=false;
const importJobActions=new Set();
function importLocalMetadata(){try{return JSON.parse(accountStorage.getItem('oma-import-metadata-v1')||'{}')||{};}catch{return {};}}
function importItemMetadata(item){return {sourceUrl:item.url,title:item.title,publisher:item.sourceTitle||'',imageUrl:item.image||''};}
function importSavedLesson(job){const key=omaImportSourceKey(job.sourceUrl||job.audioUrl);return s.lessons.find(l=>l.importJobId===job.id||l.importJobIds?.includes(job.id)||key&&omaImportSourceKey(l.sourceUrl)===key);}
function sourceImportJob(item){return backgroundImportJobs.find(j=>j.sourceUrl===item.url||j.audioUrl===item.audioUrl&&item.audioUrl||j.audioUrl===item.url);}
function importJobLabel(job){return job.status==='ready'?'Ready · Review & save':job.status==='failed'?'Import failed · Retry':job.progress||'Import in progress…';}
function importJobProgress(job){const match=(job.progress||'').match(/part (\d+) of (\d+)/i);return `<progress class="import-job-progress" aria-label="${E(importJobLabel(job))}" ${job.status==='ready'?'value="1" max="1"':match?`value="${Number(match[1])-1}" max="${Number(match[2])}"`:''}></progress>`;}
async function refreshImportJobs(){
 if(importPollBusy||!authUser||!connected)return;importPollBusy=true;const language=activeStudyLanguage,user=authUser.id;
 try{const [sourceJobs,allJobs]=await Promise.all([api('/api/import-jobs'),api('/api/jobs').catch(()=>[])]);const local=importLocalMetadata();const fileJobs=(Array.isArray(allJobs)?allJobs:[]).filter(j=>j.kind==='file'||j.kind==='openai-transcribe'&&local[j.id]).map(j=>({id:j.id,status:j.status,progress:j.progress,error:j.error,created:j.created,title:local[j.id]?.title||j.input?.name||j.result?.title||'File import',metadata:local[j.id]||{title:j.input?.name,sourceType:'file'}}));const jobs=[...new Map([...fileJobs,...(Array.isArray(sourceJobs)?sourceJobs:[])].map(j=>[j.id,j])).values()];if(language!==activeStudyLanguage||user!==authUser?.id)return;backgroundImportJobs=jobs;updateImportWidgets();}catch{}finally{importPollBusy=false;}
}
function startImportMonitor(){if(importMonitorTimer)clearInterval(importMonitorTimer);backgroundImportJobs=[];refreshImportJobs();importMonitorTimer=setInterval(refreshImportJobs,3000);}
function updateImportWidgets(){
 let button=$('#background-imports');if(!button){const host=$('header>.row');if(host){button=document.createElement('button');button.id='background-imports';button.onclick=showImportJobs;host.prepend(button);}}
 const pending=backgroundImportJobs.filter(j=>!importSavedLesson(j)),running=pending.filter(j=>['queued','processing'].includes(j.status)),ready=pending.filter(j=>j.status==='ready');
 if(button){const failed=pending.filter(j=>j.status==='failed').length;const detail=running.length?running.length+' in progress':ready.length?ready.length+' ready':failed?failed+' failed':'';const label=detail?'Imports · '+detail:'Imports';if(button.getAttribute('aria-label')!==label||button.dataset.pending!==String(pending.length)){button.dataset.pending=String(pending.length);button.innerHTML='<span class="imports-full">'+E(label)+'</span><span class="imports-compact">Imports'+(pending.length?' · '+pending.length:'')+'</span>';button.setAttribute('aria-label',label);button.title=label;}}
 $$('[data-import-source]').forEach(b=>{const itemId=b.dataset.importSource;const root=b.closest('.discovery-card')||b.parentElement;if(!root)return;const sourceButton=root.querySelector('[data-preview-source]');let job=backgroundImportJobs.find(j=>j.id===b.dataset.importJob);if(!job){const items=[...mediaFeedMemory.values()].flatMap(r=>r.items||[]);const item=items.find(i=>String(i.id)===itemId);if(item)job=sourceImportJob(item);}if(!job)return;b.dataset.importJob=job.id;const saved=importSavedLesson(job);b.disabled=!saved&&['queued','processing'].includes(job.status);b.textContent=saved?(saved.archived?'Archived · Open':'Imported · Open'):importButtonLabel(job);let progress=root.querySelector('.import-job-progress');if(!saved&&job.status!=='failed'){if(!progress){progress=document.createElement('span');progress.className='import-progress-holder';b.after(progress);}progress.outerHTML=importJobProgress(job);}else progress?.remove();});
 if($('#background-import-list'))drawImportJobs();
}
function drawImportJobs(){const root=$('#background-import-list');if(!root)return;const signature=JSON.stringify(backgroundImportJobs.map(j=>[j.id,j.status,j.progress,j.error,importSavedLesson(j)?.id,importSavedLesson(j)?.archived,importJobActions.has(j.id)]));if(root.dataset.signature===signature)return;root.dataset.signature=signature;const focused=document.activeElement?.dataset.importJob;root.innerHTML=backgroundImportJobs.length?backgroundImportJobs.map(j=>{const saved=importSavedLesson(j);return `<article class="panel import-queue-item"><strong>${E(j.metadata?.title||j.title||'Import')}</strong><p role="status">${E(saved?(saved.archived?'Archived':'Imported'):importJobLabel(j))}</p>${!saved&&j.status!=='failed'?importJobProgress(j):''}${j.error?`<p class="muted">${E(j.error)}</p>`:''}<button data-import-job="${E(j.id)}" ${!saved&&(importJobActions.has(j.id)||['queued','processing'].includes(j.status))?'disabled':''}>${saved?'Open lesson':j.status==='ready'?'Review & save':j.status==='failed'?'Retry':'Working in background…'}</button></article>`;}).join(''):'<p class="muted">No imports yet.</p>';root.querySelectorAll('[data-import-job]').forEach(b=>b.onclick=act(async()=>{const job=backgroundImportJobs.find(j=>j.id===b.dataset.importJob);if(!job||importJobActions.has(job.id))return;const saved=importSavedLesson(job);if(saved){$('#dialog').close();openLesson(saved.id);return;}if(!['failed','ready'].includes(job.status))return;importJobActions.add(job.id);b.disabled=true;try{if(job.status==='failed'){const next=await api('/api/jobs/'+job.id+'/retry',{});trackBrowserImport({...next,input:{...next.input,importMetadata:job.metadata}},{show:false});await refreshImportJobs();return;}const result=await api('/api/jobs/'+job.id);if(!root.isConnected||!$('#dialog').open)return;const metadata=job.metadata||{};importPreview({...result.result,importJobId:job.id,media:metadata.media||result.result.media,sourceType:metadata.sourceType||result.result.sourceType,sourceUrl:metadata.sourceUrl||job.sourceUrl,title:metadata.title||result.result.title,publisher:metadata.publisher||result.result.publisher,imageUrl:metadata.imageUrl||result.result.imageUrl},metadata.publisher||'');}finally{importJobActions.delete(job.id);if(b.isConnected)b.disabled=false;}}));if(focused)[...root.querySelectorAll('[data-import-job]')].find(b=>b.dataset.importJob===focused&&!b.disabled)?.focus({preventScroll:true});}
function showImportJobs(){modal('Imports',`<p>Imports continue while this popup or browser tab is closed. Keep O/L’s local service running. Finished imports stay here until you review and save them.</p><div id="background-import-list"></div>`,()=>{drawImportJobs();refreshImportJobs();});}
function trackBrowserImport(job,{show=true}={}){const metadata=job.input?.importMetadata||{};const stored=importLocalMetadata();stored[job.id]=metadata;const keep=Object.fromEntries(Object.entries(stored).slice(-100));try{accountStorage.setItem('oma-import-metadata-v1',JSON.stringify(keep));}catch{}const entry={id:job.id,status:job.status,progress:job.progress,sourceUrl:metadata.sourceUrl||job.input?.url||(job.input?.youtubeId?'https://www.youtube.com/watch?v='+job.input.youtubeId:''),audioUrl:job.input?.url,title:metadata.title||job.result?.title||'Import',metadata};backgroundImportJobs=[entry,...backgroundImportJobs.filter(j=>j.id!==entry.id)];if(show)showImportJobs();updateImportWidgets();}

/* Focused library design. Presentation changes retain the established learning services. */
let focusedPublisher=null,focusedTopic='For you',focusedKind='all',focusedLength=1200,focusedLibraryTab='lessons',focusedObservers=false;
libraryDiscoveryMode='focused-discover';
const focusedPaths={compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5 5-3Z"/>',library:'<path d="M4 4h6v16H4zM14 4h6v16h-6z"/>',words:'<path d="M3 5h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 7v15"/>',sparkles:'<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3ZM20 2v4m-2-2h4"/>',plus:'<path d="M12 5v14M5 12h14"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',back:'<path d="M20 12H4m6-6-6 6 6 6"/>',filter:'<path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"/>',book:'<path d="M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2V4Zm9 2v15"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',headphones:'<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12H3v7h4v-7H4Zm16 0h1v7h-4v-7h3Z"/>',video:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4V8Z"/>',check:'<path d="m5 12 4 4L19 6"/>',gear:'<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-2Z"/><circle cx="12" cy="12" r="3"/>'};
function focusedIcon(name){return sidebarSvg(focusedPaths[name]||focusedPaths.book);}
function focusedTheme(){const theme=s.settings.appearance||'system';document.documentElement.style.colorScheme=theme==='system'?'light dark':theme;document.documentElement.dataset.omaAppearance=theme;}
function focusedNavigate(destination){closeSidebarDrawer();trackRead();review=null;lid=null;view='library';libraryDiscoveryMode=destination==='discover'?'focused-discover':'focused-library';render();window.scrollTo(0,0);}
const focusedSetupOriginal=setupParityShell;
setupParityShell=function(){focusedSetupOriginal();document.body.classList.add('focused-ui');focusedTheme();const branch=$('#library-branch');branch.hidden=false;branch.querySelector('[data-nav=library]').textContent='Library';branch.querySelector('[data-nav=playlists]').hidden=true;
 const discover=document.createElement('button');discover.id='focused-discover';discover.setAttribute('aria-label','Discover');discover.innerHTML=focusedIcon('compass')+'<span class="nav-label">Discover</span>';discover.onclick=()=>focusedNavigate('discover');branch.prepend(discover);
 for(const [key,icon]of [['library','library'],['words','words']]){const button=branch.querySelector('[data-nav='+key+']');button.setAttribute('aria-label',key==='words'?'O/L Words':'Library');button.innerHTML=focusedIcon(icon)+'<span class="nav-label">'+(key==='words'?'O/L Words':'Library')+'</span>';}
 $('#create-menu').setAttribute('aria-label','Import content');$('#create-menu').innerHTML=focusedIcon('plus')+'<span class="nav-label">Import</span>';$('#create-menu').onclick=()=>importDialog();$('#brand-home').onclick=()=>focusedNavigate('discover');
 $('.sidebar-bottom').insertAdjacentHTML('beforeend',olReadingFox);
 const version=document.createElement('small');version.className='app-version sidebar-version';version.textContent='v'+OMA_RELEASE_VERSION;version.setAttribute('aria-label',OMA_BRAND_NAME+' version '+OMA_RELEASE_VERSION);$('.sidebar-bottom').append(version);
 const mobileBrand=document.createElement('button');mobileBrand.id='focused-mobile-brand';mobileBrand.setAttribute('aria-label',OMA_BRAND_NAME+' home');mobileBrand.innerHTML=omaBrandMark+'<strong>'+OMA_BRAND_NAME+'</strong>';mobileBrand.onclick=()=>focusedNavigate('discover');$('header').prepend(mobileBrand);
};
const focusedNavigateOriginal=parityNavigate;
parityNavigate=function(destination){if(destination==='library')return focusedNavigate('library');return focusedNavigateOriginal(destination);};
const focusedRenderOriginal=render;
render=function(){focusedRenderOriginal();focusedDecorateView();syncFocusedChrome();};
const focusedLibraryOriginal=library;
library=function(){if(current())return personalLibrary();if(libraryDiscoveryMode==='feed')return mediaFeedPage(libraryDiscoveryCategory);if(['focused-discover','home'].includes(libraryDiscoveryMode))return focusedDiscover();return focusedLibrary();};
function focusedHeading(title,subtitle,action=true){return `<div class="focused-heading"><div><h1>${E(title)}</h1><p>${E(subtitle)}</p></div>${action?`<button class="primary focused-import" aria-label="Import content">${focusedIcon('plus')}<span>Import</span></button>`:''}</div>`;}
function focusedCover(lesson){const image=omaImportSafeImage(lesson.imageUrl||lesson.image||'');return image?`<img src="${E(image)}" alt="" loading="lazy">`:lesson.youtubeId?`<img src="https://i.ytimg.com/vi/${encodeURIComponent(lesson.youtubeId)}/hqdefault.jpg" alt="" loading="lazy">`:focusedIcon(lesson.media?'headphones':'book');}
function focusedLessonMeta(lesson){const duration=lesson.duration||lesson.cues?.at(-1)?.end||0,words=C.tokens(lesson.text||'').length;return [lesson.level||learningLanguage().name,duration?time(duration)+' audio':Math.max(1,Math.ceil(words/160))+' min read',lesson.youtubeId?'Video':lesson.media?'Audio':'Reading'].join(' · ');}
function focusedResumeLesson(){return (s.settings.recentLessons||[]).map(id=>s.lessons.find(l=>l.id===id&&!l.archived)).find(Boolean)||s.lessons.find(l=>!l.archived&&!l.completed);}
function focusedContinue(lesson){if(!lesson&&learningData.profile.interests?.[activeStudyLanguage]?.length)return `<section class="focused-welcome"><h2>Your next lesson awaits.</h2><p>Explore the sources below or import something you would like to read.</p><button class="primary focused-import">Import a lesson ${focusedIcon('plus')}</button></section>`;if(!lesson)return `<section class="focused-welcome">${olReadingFox}<h2>Start with something you enjoy.</h2><p>Choose your interests for short lessons and sources in ${E(learningLanguage().name)}.</p><button class="primary" id="focused-choose-interests">Choose interests ${focusedIcon('arrow')}</button></section>`;const parts=C.segments(lesson.text),position=Math.min(parts.length,Number(s.positions[lesson.id]||0)+1),percent=Math.round(position/Math.max(1,parts.length)*100);return `<section class="focused-continue"><button class="focused-continue-art" data-focused-open="${E(lesson.id)}" aria-label="Continue ${E(lesson.title)}">${focusedCover(lesson)}</button><div><div class="focused-eyebrow">Continue reading</div><h2>${E(lesson.title)}</h2><p>${E(focusedLessonMeta(lesson))}</p><progress max="100" value="${percent}" aria-label="Saved sentence position"></progress><div class="row wrap"><button class="primary" data-focused-open="${E(lesson.id)}">Continue ${focusedIcon('arrow')}</button><small>Sentence ${position} of ${parts.length||1}</small></div></div></section>`;}
function focusedWireMain(){const main=$('#main');main.querySelectorAll('.focused-import').forEach(b=>b.onclick=()=>importDialog());main.querySelectorAll('[data-focused-open]').forEach(b=>b.onclick=()=>openLesson(b.dataset.focusedOpen));bind('focused-choose-interests',()=>showInterestPicker(activeStudyLanguage,()=>render()));}
function focusedSourceCatalog(topic='For you',selected=''){
 const sources=discoverySources().filter(source=>topic==='For you'||sourceMatchesCategory(source,topic));
 return `<section class="focused-source-catalog"><h2>${topic==='For you'?'All '+E(learningLanguage().name)+' sources':E(topic==='News Feed'?'News':topic)+' publishers'}</h2><p class="muted">${sources.length} sources · Choose a publisher to see its latest 10 items.</p><div class="learning-resource-grid">${sources.map(source=>learningResourceCard(source).replace('data-resource-feed=',`aria-pressed="${source.id===selected}" data-focused-publisher=`).replace(/View (lessons|episodes|videos)/,'Latest 10 items')).join('')||'<p>No publishers in this category yet.</p>'}</div></section>`;
}
function focusedPublisherItems(items,sourceId){
 return items.filter(item=>item.sourceId===sourceId).sort((a,b)=>(Date.parse(b.published)||0)-(Date.parse(a.published)||0)).slice(0,10);
}
function focusedDiscover(refresh=false){
 const all=discoverySources(),topics=['For you',...discoveryCategories.filter(topic=>!['Learning Sources','Trending',"What's New"].includes(topic)&&all.some(source=>sourceMatchesCategory(source,topic)))];
 if(!topics.includes(focusedTopic)){focusedTopic='For you';focusedPublisher=null;}
 const selected=all.find(source=>source.id===focusedPublisher&&(focusedTopic==='For you'||sourceMatchesCategory(source,focusedTopic)));
 const catalog=focusedSourceCatalog(focusedTopic,selected?.id),personal=focusedTopic==='For you';
 $('#main').classList.add('focused-discover-page');$('#main').innerHTML=`${focusedHeading('A little '+learningLanguage().name+', every day.','Choose a topic, then a publisher to find your next lesson.')}${personal&&!selected?focusedContinue(focusedResumeLesson()):''}<div class="focused-discover-controls"><div class="focused-topics">${topics.map(topic=>`<button data-focused-topic="${E(topic)}" aria-pressed="${focusedTopic===topic}">${E(topic==='News Feed'?'News':topic)}</button>`).join('')}</div><button class="quiet" id="focused-interests">Your interests</button></div>${!personal||selected?catalog:''}<section id="focused-publisher-results" class="focused-discover-section"><div class="row between wrap"><h2>${selected?'Latest from '+E(selected.name):personal?'Find your next short lesson':'Choose a publisher above'}</h2>${selected?'<button id="focused-refresh-source" class="quiet">Refresh</button>':personal?'<button id="focused-filters" class="quiet">Filters</button>':''}</div>${selected?.access?`<p class="muted">${E(selected.access)}</p>`:''}<p id="focused-source-status" class="muted" role="status"></p><div id="focused-source-items" class="focused-source-grid"></div></section>${personal&&!selected?catalog:''}<div class="row between wrap focused-source-footer"><p class="muted">Explore all publishers, courses and short stories.</p><button id="focused-all-sources" class="quiet">Browse all sources ${focusedIcon('arrow')}</button></div>`;
 focusedWireMain();bind('focused-interests',()=>showInterestPicker(activeStudyLanguage,()=>render()));bind('focused-all-sources',()=>openMediaFeed('Learning Sources'));bind('focused-filters',focusedDiscoveryFilters);bind('focused-refresh-source',()=>focusedDiscover(true));
 $$('[data-focused-topic]').forEach(button=>button.onclick=()=>{focusedTopic=button.dataset.focusedTopic;focusedPublisher=null;render();});
 $$('[data-focused-publisher]').forEach(button=>button.onclick=()=>{focusedPublisher=button.dataset.focusedPublisher;render();$('#focused-publisher-results')?.scrollIntoView({behavior:'smooth',block:'start'});});
 const root=$('#focused-source-items'),status=$('#focused-source-status');
 if(!selected&&!personal){status.textContent='Select a publisher to load its latest items.';return;}
 const followed=new Set(followedSourceIds());let providers=selected?[selected]:all.filter(source=>followed.has(source.id)&&(source.mode!=='website'||source.feedUrl));
 if(!selected&&!providers.length&&!learningData.profile.interests?.[activeStudyLanguage]?.length)providers=all.filter(source=>source.availability==='verified'&&(source.mode!=='website'||source.feedUrl));
 if(!selected)providers=providers.slice(0,4);status.textContent='Loading latest items…';
 loadDiscoveryItems(providers,refresh).then(({items,errors})=>{if(!root.isConnected)return;const filtered=selected?focusedPublisherItems(items,selected.id):items.filter(item=>(!item.duration||item.duration<=focusedLength)&&(focusedKind==='all'||(focusedKind==='video'?!!item.youtubeId:focusedKind==='audio'?!!item.audioUrl:!item.youtubeId&&!item.audioUrl))).slice(0,12);root.innerHTML=filtered.map(discoveryCard).join('');status.textContent=filtered.length?(selected?filtered.length+' latest items':filtered.length+' short lessons')+(errors.length?' · Publisher temporarily unavailable':''):errors.length?'Could not load this publisher. Try Refresh or choose another source.':selected?'No recent feed items are available. Browse the publisher directly.':'No short lessons match. Choose a topic and publisher or adjust the filters.';wireDiscoveryCards(root,filtered);}).catch(error=>{if(status.isConnected)status.textContent='Could not load sources. '+error.message;});
}
function focusedDiscoveryFilters(){modal('Find a short lesson',`<label>Content<select id="focused-kind">${[['all','All short content'],['video','Videos'],['audio','Podcasts and audio'],['reading','Reading']].map(([v,l])=>`<option value="${v}" ${focusedKind===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Audio or video length<select id="focused-length">${[[300,'Up to 5 minutes'],[600,'Up to 10 minutes'],[1200,'Up to 20 minutes']].map(([v,l])=>`<option value="${v}" ${focusedLength===v?'selected':''}>${l}</option>`).join('')}</select></label><p class="muted">Articles without a published duration remain visible. General book catalogs and whole textbooks are excluded from recommendations.</p><button id="focused-apply-filters" class="primary">Apply filters</button>`,()=>bind('focused-apply-filters',()=>{focusedKind=$('#focused-kind').value;focusedLength=Number($('#focused-length').value);$('#dialog').close();render();}));}
function focusedLibrary(){
 const showingArchive=focusedLibraryTab==='archived';
 const items=s.lessons.filter(lesson=>Boolean(lesson.archived)===showingArchive);
 const tabs=[['lessons','Lessons'],['courses','Courses'],['playlists','Playlists'],['archived','Archived']];
 const showingPlaylists=focusedLibraryTab==='playlists';
 $('#main').classList.add('focused-library-page');
 $('#main').innerHTML=`${focusedHeading('Your library','Pick up where you left off.')}
  <div class="focused-library-tabs" role="tablist" aria-label="Your library">
   ${tabs.map(([key,label])=>`<button data-focused-library-tab="${key}" role="tab" aria-selected="${focusedLibraryTab===key}">${label}</button>`).join('')}
  </div>
  ${focusedLibraryTab==='lessons'?focusedContinue(focusedResumeLesson()):''}
  <section>${showingPlaylists?'':`<div class="row between wrap"><h2>${showingArchive?'Archived lessons':focusedLibraryTab==='courses'?'Your courses':'Saved lessons'}</h2><input id="focused-library-search" type="search" placeholder="Search your library" aria-label="Search your library"></div>`}<div id="focused-library-items"></div></section>`;
 $$('[data-focused-library-tab]').forEach(tab=>tab.onclick=()=>{
  focusedLibraryTab=tab.dataset.focusedLibraryTab;
  render();
  $('[data-focused-library-tab][aria-selected=true]')?.focus({preventScroll:true});
 });
 focusedWireMain();
 if(showingPlaylists){renderLibraryPlaylists($('#focused-library-items'));return;}
 const root=$('#focused-library-items');const draw=()=>{const query=C.norm($('#focused-library-search').value);const visible=items.filter(l=>C.norm(l.title+' '+l.course).includes(query));if(focusedLibraryTab==='courses'){const courses=[...new Set(visible.map(l=>l.course||'Personal Lessons'))];root.innerHTML=`<div class="focused-source-grid">${courses.map(course=>`<article class="focused-course"><div class="focused-eyebrow">Your course</div><h3>${E(course)}</h3><p>${visible.filter(l=>(l.course||'Personal Lessons')===course).length} lessons</p><button data-focused-course="${E(course)}">Open course ${focusedIcon('arrow')}</button></article>`).join('')}</div><h2 class="focused-section-title">Free public courses</h2><p class="muted">Browse individual lessons. Some open on the publisher’s site and downloadable lessons can be imported.</p><div class="learning-resource-grid">${discoverySources().filter(source=>source.publicCourse===true&&C.norm(source.name+' '+source.description).includes(query)).map(learningResourceCard).join('')||'<p class="muted">No free public courses match here.</p>'}</div>`;root.querySelectorAll('[data-focused-course]').forEach(b=>b.onclick=()=>coursePage(b.dataset.focusedCourse));wireResourceFeeds(root);}
 else if(visible.length){
  root.innerHTML=`<div class="focused-source-grid">${visible.map(lesson=>`<article class="focused-saved-lesson">
   <button class="focused-saved-art" data-focused-open="${E(lesson.id)}" aria-label="Open ${E(lesson.title)}">${focusedCover(lesson)}</button>
   <div><small>${E(focusedLessonMeta(lesson))}</small><h3>${E(lesson.title)}</h3><p>${E(lesson.course||'Personal lesson')}</p>
    <div class="saved-lesson-actions"><button data-focused-open="${E(lesson.id)}">${focusedIcon('book')} Open lesson</button><button class="quiet" data-lesson-actions="${E(lesson.id)}" aria-label="Actions for ${E(lesson.title)}" aria-haspopup="menu">···</button></div>
   </div></article>`).join('')}</div>`;
  root.querySelectorAll('[data-lesson-actions]').forEach(button=>button.onclick=()=>{
   const lesson=s.lessons.find(item=>item.id===button.dataset.lessonActions);
   if(lesson)floatingMenu(button,lessonManagementActions(lesson));
  });
 }else if(query)root.innerHTML='<div class="focused-empty"><p>No lessons match your search.</p></div>';
 else if(showingArchive)root.innerHTML='<div class="focused-empty"><h3>No archived lessons</h3><p>Archive a lesson from its menu. You can restore it here whenever you want to study it again.</p></div>';
 else root.innerHTML='<div class="focused-empty"><h3>Your next lesson starts with something you enjoy.</h3><p>Import a short article, video or conversation, or explore your recommended sources.</p><button id="focused-empty-discover" class="primary">Explore short lessons</button></div>';
 focusedWireMain();bind('focused-empty-discover',()=>focusedNavigate('discover'));};
 bind('focused-library-search',draw,'input');draw();
}
discoveryCard=function(item){const existing=discoveryExisting(item),pending=sourceImportJob(item),image=safeURL(item.image||''),kind=item.youtubeId?'Video':item.audioUrl?'Podcast':item.browseOnly?'Publisher lesson':'Article';return `<article class="discovery-card focused-source-card"><button class="discovery-art" data-art-item="${E(item.id)}" data-preview-source="${E(item.id)}" aria-label="Preview ${E(item.title)}">${image&&image!=='#'?`<img src="${E(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:focusedIcon(item.youtubeId?'video':item.audioUrl?'headphones':'book')}${item.duration?`<span class="focused-duration">${time(item.duration)}</span>`:''}</button><div class="discovery-card-body"><small>${E(kind)}${item.level?' · '+E(item.level):''}</small><button class="discovery-title" data-preview-source="${E(item.id)}">${E(item.title)}</button><button class="source-more" data-more-source="${E(item.sourceId)}">${E(item.sourceTitle)} ${focusedIcon('arrow')}</button><div class="focused-card-actions"><button class="${existing?'':'primary'}" data-import-source="${E(item.id)}" ${pending&&['queued','processing'].includes(pending.status)?'disabled':''}>${existing?(existing.archived?'Archived · Open':'Imported · Open'):pending?importButtonLabel(pending):item.browseOnly?'Open on publisher ↗':'Add to library'}</button><button class="discovery-menu" data-source-actions="${E(item.id)}" aria-label="Actions for ${E(item.title)}">···</button>${pending&&!existing?importJobProgress(pending):''}</div></div></article>`;};
const focusedImportOriginal=importDialog;
importDialog=function(initial){if(typeof initial==='string'||initial?.source)return focusedImportOriginal(initial);modal('Bring something you enjoy.',`<p class="muted">A short article, video or conversation can become your next lesson.</p><label>Video, channel or article link<input type="url" id="focused-import-url" placeholder="Paste a link…" autocomplete="url"></label><p class="muted">A video becomes a lesson. A channel becomes a source you can follow.</p><button class="primary" id="focused-import-next">Continue ${focusedIcon('arrow')}</button><div class="focused-import-other"><h3>Or bring your own content</h3><div class="row wrap"><button id="focused-import-paste">${focusedIcon('words')} Paste text</button><button id="focused-import-file">${focusedIcon('book')} Choose a file</button><button id="focused-import-audio">${focusedIcon('headphones')} Audio</button></div></div><p id="focused-import-error" role="alert"></p>`,()=>{bind('focused-import-next',()=>{const url=$('#focused-import-url').value.trim();if(!url||safeURL(url)==='#'){$('#focused-import-error').textContent='Paste a public article, YouTube video or channel link.';return;}let channel=false;try{youtubeChannelURL(url);channel=true;}catch{}if(channel){addYouTubeChannel(url);return;}focusedImportOriginal({source:omaImportSourceKey(url).startsWith('youtube:')?'youtube':'web',url});});for(const [id,source]of [['paste','paste'],['file','file'],['audio','audio']])bind('focused-import-'+id,()=>focusedImportOriginal(source));});};
const focusedTermOriginal=termPanel;
termPanel=function(term,context=''){focusedTermOriginal(term,context);const panel=$('#word-panel')||$('#term-editor');if(!panel)return;panel.classList.add('focused-word-panel');const heading=panel.querySelector('.word-panel-heading');if(context){const quote=document.createElement('p');quote.className='focused-word-context';quote.textContent=context;heading?.after(quote);}const saveButton=$('#save-term');if(saveButton)saveButton.textContent='Save to O/L Words';const resources=$('#reader-meaning-resources');if(resources&&!resources.closest('details')){const details=document.createElement('details');details.className='focused-meaning-details';const summary=document.createElement('summary');summary.textContent='Other meanings & dictionaries';resources.before(details);details.append(summary,resources);resources.hidden=false;const toggle=panel.querySelector('.saved-meaning-toggle');if(toggle)toggle.hidden=true;}
 focusedDecorateView();syncFocusedChrome();};
function focusedDecorateView(){
 const main=$('#main');if(!main)return;main.style.setProperty('--focused-reading-width',(s.settings.pageWidth||800)+'px');main.style.setProperty('--audited-reader-size',(s.settings.fontSize||20)+'px');main.style.setProperty('--audited-reader-spacing',String(s.settings.lineHeight||1.75));main.dataset.focusedView=view;main.classList.toggle('pv-vocabulary',view==='words');main.classList.toggle('discovery-page',view==='library'&&!current()&&libraryDiscoveryMode==='feed');main.classList.toggle('focused-discover-page',view==='library'&&!current()&&['focused-discover','home'].includes(libraryDiscoveryMode));main.classList.toggle('focused-library-page',view==='library'&&!current()&&!['focused-discover','home','feed'].includes(libraryDiscoveryMode));focusedTheme();
 if(view==='library'&&current()){const lesson=current(),parts=C.segments(lesson.text),top=$('.reading-top');if(top&&!top.dataset.focused){top.dataset.focused='true';const back=document.createElement('button');back.className='focused-reader-back quiet';back.innerHTML=focusedIcon('back')+'<span>Library</span>';back.onclick=()=>focusedNavigate('library');top.prepend(back);const progress=top.querySelector('.reading-progress');if(progress){progress.hidden=true;const label=document.createElement('small');label.className='focused-reader-location';label.textContent='Sentence '+(Number(s.positions[lesson.id]||0)+1)+' of '+parts.length;progress.after(label);}}
 const pageView=$('#reader-page-view');if(pageView){pageView.innerHTML=focusedIcon(s.settings.sentenceMode?'words':'library')+(s.settings.sentenceMode?'Page view':'Sentence view');pageView.setAttribute('aria-pressed',String(!!s.settings.sentenceMode));}const sentenceReview=$('#reader-review-sentence');if(sentenceReview)sentenceReview.innerHTML=focusedIcon('words')+'Practise sentence';
 }
 if(view==='playlists'&&!main.querySelector('.focused-library-return')){const back=document.createElement('button');back.className='quiet focused-library-return';back.innerHTML=focusedIcon('back')+'Library';back.onclick=()=>focusedNavigate('library');main.prepend(back);}
 if(view==='words'){const root=main.querySelector('.pv-vocabulary');if(root&&!root.dataset.focused){root.dataset.focused='true';const heading=document.createElement('div');heading.className='focused-heading';heading.innerHTML='<div><h1>Your O/L Words</h1><p>Words you met. Meanings that stay with them.</p></div>';root.prepend(heading);const actions=$('#pv-topline');if(actions)heading.after(actions);const review=$('#review-selection');if(review)review.textContent=ankiDesktopEnabled()?'Practise in Anki':'Practise words';const due=$('#pv-due-tab');if(due)due.innerHTML='Ready to practise <span class="pv-count">'+Object.values(s.words).filter(wordReady).length+'</span>';}}
 if(view==='review'&&!main.querySelector('.focused-review-back,.sentence-review-context')){const back=document.createElement('button');back.className='quiet focused-review-back';back.innerHTML=focusedIcon('back')+(paritySentenceOnly?'Back to lesson':'O/L Words');back.onclick=()=>{review=null;if(paritySentenceOnly&&current()){paritySentenceOnly=false;view='library';render();}else parityNavigate('words');};main.prepend(back);}
 if(view==='settings'&&settingsTab==='reader'){const root=$('#settings-content');if(root&&!root.querySelector('#focused-appearance')){const section=document.createElement('section');section.className='settings-card focused-appearance';section.innerHTML='<h2>Appearance</h2><label>Colour theme<select id="focused-appearance"><option value="system">Use system setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>';root.prepend(section);$('#focused-appearance').value=s.settings.appearance||'system';$('#focused-appearance').onchange=()=>{s.settings.appearance=$('#focused-appearance').value;save();focusedTheme();};}}
}
function syncFocusedChrome(){
 if(!authReady||!document.querySelector('.app-sidebar'))return;document.body.classList.add('focused-ui');const discovery=view==='library'&&!current()&&['focused-discover','home'].includes(libraryDiscoveryMode);const label=view==='library'?(current()?'Reading':discovery?'Discover':'Library'):view==='words'?'O/L Words':view==='ai'?'O/L AI':view==='progress'?'Activities':view==='review'?'Practice':view[0].toUpperCase()+view.slice(1);const breadcrumb=$('#breadcrumb');document.title=label.startsWith(OMA_SHORT_NAME+' ')?label:OMA_SHORT_NAME+' · '+label;if(breadcrumb&&breadcrumb.textContent!==label)breadcrumb.textContent=label;
 const discover=$('#focused-discover');if(discover){discover.classList.toggle('active',discovery);discover.setAttribute('aria-current',discovery?'page':'false');}const libraryButton=$('.app-sidebar [data-nav=library]');if(libraryButton)libraryButton.classList.toggle('active',view==='library'&&!discovery);$('#library-branch')?.removeAttribute('hidden');
 const nav=$('#mobile-navigation');if(nav){if(!nav.dataset.focused){nav.dataset.focused='true';nav.innerHTML=[['discover','Discover','compass'],['library','Library','library'],['words','O/L Words','words'],['ai','O/L AI','sparkles']].map(([key,name,icon])=>`<button data-focused-mobile="${key}">${focusedIcon(icon)}<span>${name}</span></button>`).join('');nav.addEventListener('click',event=>{const key=event.target.closest('[data-focused-mobile]')?.dataset.focusedMobile;if(!key)return;key==='discover'||key==='library'?focusedNavigate(key):parityNavigate(key);});}nav.querySelectorAll('[data-focused-mobile]').forEach(b=>{const key=b.dataset.focusedMobile,active=key==='discover'?discovery:key==='library'?['library','playlists'].includes(view)&&!discovery:key==='words'?['words','review'].includes(view):view==='ai';b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});}
 const brand=$('#focused-mobile-brand');if(brand)brand.hidden=false;const account=$('#current-account');if(account){account.onclick=()=>openSettings('reader');account.setAttribute('aria-label','Settings and account');}
 $('#create-menu')?.setAttribute('aria-label','Import content');focusedDecorateView();focusedMeasure();if(!focusedObservers){focusedObservers=true;const observer=new ResizeObserver(focusedMeasure);for(const element of [$('header'),$('.persistent-player'),nav])if(element)observer.observe(element);window.addEventListener('resize',focusedMeasure);}
}
function focusedMeasure(){if(document.body.classList.contains('video-docked'))layoutReaderVideo();const player=$('.persistent-player'),nav=$('#mobile-navigation'),article=$('#reader-text')?.closest('article');const playerHeight=player&&getComputedStyle(player).display!=='none'?player.getBoundingClientRect().height:0,navHeight=nav&&getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect().height:0;document.body.style.setProperty('--focused-player-height',Math.ceil(playerHeight)+'px');document.body.style.setProperty('--focused-nav-height',Math.ceil(navHeight)+'px');if(article&&document.body.classList.contains('reader-mode')){const bottom=playerHeight?player.getBoundingClientRect().top:innerHeight-navHeight;article.style.setProperty('--focused-reader-height',Math.max(innerHeight<=520?70:125,bottom-article.getBoundingClientRect().top-12)+'px');}}

/* The approved workshop layout, applied to live controls rather than simulated data. */
focusedPaths.library='<path d="m16 6 4 14M12 6v14M8 8v12M4 4v16"/>';
const approvedDecorateOriginal=focusedDecorateView;
focusedDecorateView=function(){approvedDecorateOriginal();approvedLayout();};
function approvedLayout(){
 const main=$('#main');if(!main)return;document.body.classList.add('approved-layout');
 const ai=$('.app-sidebar [data-nav=ai]');if(ai&&!ai.dataset.approved){ai.dataset.approved='true';ai.innerHTML=focusedIcon('sparkles')+'<span class="nav-label">O/L AI</span>';}const chrome=$('header>.row'),language=$('#language-menu'),imports=$('#background-imports');if(chrome&&language&&imports&&language.nextElementSibling!==imports)language.after(imports);
 if(view==='library'&&current()){
  const top=$('.reading-top'),title=$('.reading-lesson-title'),mode=$('#reader-page-view');
  if(top&&title&&!title.dataset.approved){title.dataset.approved='true';title.classList.add('approved-reader-title');top.after(title);}
  if(top&&mode){let tools=top.querySelector('.approved-reader-tools');if(!tools){tools=document.createElement('div');tools.className='approved-reader-tools';top.append(tools);}mode.classList.add('quiet');for(const node of [mode,$('#reader-aa'),$('#reader-more'),$('#reader-panel-toggle')])if(node&&node.parentElement!==tools)tools.append(node);}
  const playerRoot=$('.persistent-player');if(playerRoot){playerRoot.classList.add('approved-player');const inner=playerRoot.querySelector('.persistent-inner'),rate=$('#player-rate'),controls=$('.persistent-controls'),timeline=$('.persistent-timeline');if(inner&&rate&&controls&&rate.parentElement!==controls)controls.prepend(rate);if(timeline&&!timeline.querySelector('.approved-elapsed')){const elapsed=document.createElement('small');elapsed.className='approved-elapsed';elapsed.textContent='0:00';timeline.prepend(elapsed);const duration=document.createElement('small');duration.className='approved-duration';duration.textContent='—';timeline.append(duration);}}
  for(const id of ['player-back','player-forward']){const b=$('#'+id);if(b&&!b.dataset.approvedIcon){b.dataset.approvedIcon='true';b.innerHTML=sidebarSvg(id==='player-back'?'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>':'<path d="M21 10a9 9 0 1 0-2 8M21 4v6h-6"/>');}}if(!playingLesson){const title=$('#player-title'),source=$('#player-source');if(title)title.textContent=current().title;if(source)source.textContent=learningLanguage().name+' narration';}approvedPlayerTime();
 }
 const panel=$('#word-panel')||$('#term-editor');if(panel?.querySelector('#term-meaning')&&!panel.dataset.approvedWord){panel.dataset.approvedWord='true';
  const head=panel.querySelector('.word-panel-heading'),meaning=$('#term-meaning'),saveButton=$('#save-term'),resources=panel.querySelector('.focused-meaning-details');
  if(head){const done=$('#close-word-sheet');if(done)head.append(done);const pronounce=$('#panel-pronounce');if(pronounce)head.append(pronounce);}
  const label=meaning.closest('label');if(label){for(const node of [...label.childNodes])if(node.nodeType===3)node.remove();label.prepend(document.createTextNode('Meaning in this sentence'));label.classList.add('approved-meaning-label');}
  if(resources&&saveButton){resources.before(saveButton);saveButton.classList.add('approved-save-word');saveButton.innerHTML=sidebarSvg('<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"/><path d="M12 7v6m-3-3h6"/>')+'Save to O/L Words';}
  const extra=document.createElement('details');extra.className='approved-word-tools';extra.innerHTML='<summary>Notes, phrases & word level</summary>';panel.append(extra);
  const keep=new Set([head,panel.querySelector('.focused-word-context'),label,saveButton,resources,panel.querySelector('.reader-saved-meaning-header'),extra]);
  for(const child of [...panel.children])if(!keep.has(child)&&child.id!=='close-word-sheet')extra.append(child);
  const explain=$('#term-context-meaning');if(explain&&resources)resources.append(explain);
  if(resources)resources.append(extra);const status=extra.querySelector('.word-panel-status');if(status)status.classList.add('approved-secondary-status');
 }
 if(panel?.querySelector('#term-meaning')){const head=panel.querySelector('.word-panel-heading'),done=$('#close-word-sheet');if(head&&done&&done.parentElement!==head)head.append(done);}
 if(view==='words')approvedWordCards();
 installAuditedReaderControls();
 installAuditedAccessibility();
}
function approvedPlayerTime(){const text=$('#player-time')?.textContent||'',match=text.match(/(\d+:\d+)\s*\/\s*(\d+:\d+)/);const elapsed=$('.approved-elapsed'),duration=$('.approved-duration');if(elapsed)elapsed.textContent=match?.[1]||'0:00';if(duration)duration.textContent=match?.[2]||'—';}
setInterval(()=>{if(document.body.classList.contains('approved-layout')&&view==='library'&&current())approvedPlayerTime();},1000);
function approvedWordCards(){const root=$('#main>section.pv-vocabulary')||$('#main .pv-vocabulary');if(!root||root.querySelector('.approved-vocabulary'))return;const heading=root.querySelector('.focused-heading'),toolbar=$('#pv-topline');if(!heading||!toolbar)return;
 const practise=toolbar.querySelector('#review-selection');
 const ready=pvRows().filter(([,w])=>wordReady(w)).length;toolbar.classList.add('approved-word-toolbar');const count=document.createElement('small');count.textContent=learningLanguage().name+' · '+ready+(ready===1?' word ready to practise':' words ready to practise');toolbar.prepend(count);
 const cards=document.createElement('section');cards.className='approved-vocabulary';const rows=pvRows().slice(pvPage*Number($('#pv-page-size')?.value||25),(pvPage+1)*Number($('#pv-page-size')?.value||25));cards.innerHTML=rows.map(([key,w])=>{const encounter=w.encounters?.find(e=>s.lessons.some(l=>l.id===e.lessonId)),context=w.context||encounter?.sentence||'',lesson=s.lessons.find(l=>l.id===encounter?.lessonId)||s.lessons.find(l=>context&&l.text.includes(context));return `<article><div class="row between"><button class="approved-word-title" data-approved-word="${E(key)}">${E(key)}</button><button class="approved-level" data-approved-word="${E(key)}" data-word-status="${w.status}" aria-label="Change familiarity for ${E(key)}">${w.status===5?'Known':w.status===-1?'Ignored':'Learning · '+w.status}</button></div><p>${E(w.meaning||'Choose a meaning')}</p>${context?`<p class="approved-word-example">${approvedContextMarkup(context,key)}</p>`:''}<small>${E(lesson?.title||'Saved vocabulary')}</small><button class="quiet" ${lesson?`data-approved-lesson="${E(lesson.id)}"`:`data-approved-word="${E(key)}"`}>${lesson?'Open in lesson':'Edit word'} ${focusedIcon('arrow')}</button></article>`;}).join('')||'<p class="muted">Save a word while reading to keep its meaning and sentence here.</p>';toolbar.after(cards);
 cards.querySelectorAll('[data-approved-word]').forEach(b=>b.onclick=()=>termDialog(b.dataset.approvedWord));cards.querySelectorAll('[data-approved-lesson]').forEach(b=>b.onclick=()=>openLesson(b.dataset.approvedLesson));
 const table=$('#pv-table-holder'),footer=root.querySelector('.pv-page-footer'),shortcuts=root.querySelector('.pv-shortcuts');
 const display=document.createElement('div');display.className='approved-word-display';display.setAttribute('role','group');display.setAttribute('aria-label','Vocabulary view');
 display.innerHTML='<button type="button" data-word-view="cards">Cards</button><button type="button" data-word-view="table">Table</button>';
 const actions=document.createElement('div');
 actions.className='words-toolbar-actions';
 if(practise){practise.classList.remove('primary');actions.append(practise);}
 actions.append(display);
 toolbar.append(actions);
 const tabs=root.querySelector('.pv-control-line'),search=$('#pv-search-box');(search||tabs||toolbar).after(cards);
 const setView=mode=>{const showTable=mode==='table';cards.hidden=showTable;if(table)table.hidden=!showTable;if(shortcuts)shortcuts.hidden=!showTable;display.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.wordView===mode)));};
 setView(accountStorage.getItem('oma-word-view')==='table'?'table':'cards');display.querySelectorAll('button').forEach(b=>b.onclick=()=>{accountStorage.setItem('oma-word-view',b.dataset.wordView);setView(b.dataset.wordView);});
 const csv=$('#csv-import');if(csv)tabs?.querySelector('.pv-tools')?.append(csv);if(footer)(table||cards).after(footer);
}

const approvedTermOriginal=termPanel;termPanel=function(term,context=''){document.body.classList.remove('hide-word-panel');const p=$('#word-panel')||$('#term-editor');if(p)delete p.dataset.approvedWord;return approvedTermOriginal(term,context);};
function approvedTranscriptCards(){for(const select of [$('#youtube-transcript-source'),$('#lesson-transcript-source')]){if(!select)continue;const key=JSON.stringify([...select.options].map(o=>[o.value,o.textContent,o.disabled]));const field=select.closest('label')||select;let cards=field.nextElementSibling;if(!cards?.matches('.approved-transcript-options')){cards=document.createElement('div');cards.className='approved-transcript-options';cards.setAttribute('role','radiogroup');cards.setAttribute('aria-label','Transcript source');field.after(cards);}if(cards.dataset.signature===key){cards.querySelectorAll('input').forEach(r=>r.checked=r.value===select.value);continue;}cards.dataset.signature=key;cards.innerHTML=[...select.options].filter(o=>o.value).sort((a,b)=>{const rank={publisher:0,automatic:1,openai:2};return (rank[a.value]??3)-(rank[b.value]??3);}).map(o=>`<label class="approved-transcript-option"><input type="radio" name="approved-${select.id}" value="${E(o.value)}" ${o.disabled?'disabled':''} ${o.selected?'checked':''}><span><strong>${E(o.textContent)}</strong><small>${o.disabled?'Unavailable or still checking':o.value==='openai'?'Uses your connected API · usage charges apply':o.value==='publisher'?'Publisher transcript · no transcription charge':o.value==='automatic'?'Automatic captions may contain errors':'Use this transcript source'}</small></span></label>`).join('');cards.querySelectorAll('input').forEach(r=>r.onchange=()=>{select.value=r.value;select.dispatchEvent(new Event('change',{bubbles:true}));});select.classList.add('approved-native-source');if(select.id==='youtube-transcript-source'){const d=select.closest('dialog');if(d){d.classList.add('approved-caption-dialog');const title=d.querySelector('h2');if(title)title.textContent='Choose your transcript';const next=$('#oma-import-fetch');if(next)next.textContent='Add lesson to my library';if(!d.querySelector('.approved-video-details')){const details=document.createElement('details');details.className='approved-video-details';details.innerHTML='<summary>Video details</summary>';select.closest('#youtube-transcript-choice').before(details);for(const id of ['import-title','import-url']){const input=$('#'+id);if(input)details.append(input.closest('label'));}}}}}}
const approvedPracticeOriginal=reviewCard;
reviewCard=function(){approvedPracticeOriginal();approvedPractice();window.scrollTo(0,0);};
function approvedPractice(){const card=$('.review-card'),r=review;if(!card||!r||card.dataset.approved||r.material==='sentences'||!['flashcard','cloze'].includes(r.type))return;card.dataset.approved='true';card.classList.add('approved-practice');const term=r.terms[r.index],w=r.items[term],context=w.context||w.encounters?.[0]?.sentence||term;const bar=$('.review-progress-track i');if(bar)bar.style.width=(100*(r.index+1)/Math.max(1,r.terms.length))+'%';const title=card.querySelector('h1');if(title)title.hidden=true;const lesson=s.lessons.find(l=>l.text.includes(context));const prompt=document.createElement('section');prompt.className='approved-practice-prompt';const index=context.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());prompt.innerHTML=`<small>${lesson?'From '+E(lesson.title):'From your O/L Words'}</small><p>${index>=0?E(context.slice(0,index))+'<span class="approved-gap">…</span>'+E(context.slice(index+term.length)):E(context)}</p>`;card.prepend(prompt);const main=$('#main');if(!main.querySelector('.approved-practice-heading')){const heading=document.createElement('div');heading.className='approved-practice-heading';heading.innerHTML='<h1>One word, in context.</h1><small>'+(r.index+1)+' of '+r.terms.length+'</small>';const back=main.querySelector('.focused-review-back');if(back)back.after(heading);else main.prepend(heading);}const reveal=$('#reveal');if(reveal){reveal.textContent='Show the word';reveal.addEventListener('click',()=>{const gap=prompt.querySelector('.approved-gap');if(gap)gap.textContent=term;});}const answer=$('#review-answer');if(answer){answer.classList.add('approved-practice-answer');const word=document.createElement('h2');word.textContent=term;answer.prepend(word);const duplicate=answer.querySelector('p');if(duplicate?.textContent===context)duplicate.hidden=true;}if($('#wrong'))$('#wrong').textContent='See it again';if($('#correct'))$('#correct').textContent='I remembered';}
const approvedChromeOriginal=syncFocusedChrome;
syncFocusedChrome=function(){approvedChromeOriginal();approvedTranscriptCards();};
const approvedModalOriginal=modal;let approvedModalObserver=null;modal=function(...args){$('#dialog')?.classList.remove('approved-caption-dialog');const result=approvedModalOriginal(...args);approvedTranscriptCards();if(!approvedModalObserver){approvedModalObserver=new MutationObserver(()=>{approvedModalObserver.disconnect();approvedTranscriptCards();const d=$('#dialog');if(d)approvedModalObserver.observe(d,{childList:true,subtree:true});});const d=$('#dialog');if(d)approvedModalObserver.observe(d,{childList:true,subtree:true});}return result;};

function approvedContextMarkup(context,term){const i=context.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());return i<0?E(context):E(context.slice(0,i))+'<mark>'+E(context.slice(i,i+term.length))+'</mark>'+E(context.slice(i+term.length));}
const approvedSidebarOriginal=sidebarShouldCollapse;sidebarShouldCollapse=function(){return innerWidth<=800?approvedSidebarOriginal():parityCollapsed;};
const approvedPageOriginal=approvedLayout;approvedLayout=function(){approvedPageOriginal();const main=$('#main');if(view==='settings'&&settingsTab==='account'&&!$('#approved-activity-link')){const b=document.createElement('button');b.id='approved-activity-link';b.textContent='Learning activity';b.onclick=()=>parityNavigate('progress');$('#settings-content')?.append(b);}if(view==='library'&&!current()&&main){const discovery=main.classList.contains('focused-discover-page');if(discovery){const eyebrow=main.querySelector('.focused-continue .focused-eyebrow');if(eyebrow)eyebrow.textContent='Keep your place';const resume=main.querySelector('.focused-continue .primary');if(resume)resume.innerHTML='Continue reading '+focusedIcon('arrow');}else if(main.classList.contains('focused-library-page')){const title=$('#focused-library-items')?.parentElement?.querySelector('h2');if(title&&focusedLibraryTab==='lessons')title.textContent='Saved for later';}}};

const approvedFloatingOriginal=floatingMenu;
floatingMenu=function(anchor,items){
 const lesson=anchor?.id==='reader-more'?current():null;
 if(lesson){
  items=[...items,{label:'Practise this sentence',run:startReaderSentenceReview}];
  if(lesson.sourceUrl)items.push({label:'Original source',run:()=>window.open(safeURL(lesson.sourceUrl),'_blank','noopener,noreferrer')});
  items.push(null,...lessonManagementActions(lesson));
 }
 return approvedFloatingOriginal(anchor,items);
};
const highlightLayoutOriginal=approvedLayout;approvedLayout=function(){highlightLayoutOriginal();const term=C.norm(chosen||''),tokens=$$('#reader-text .token');tokens.forEach(el=>el.setAttribute('aria-pressed',String(!!term&&C.norm(el.textContent)===term)));const close=$('#close-word-sheet');if(close&&!close.dataset.highlightClose){close.dataset.highlightClose='true';close.addEventListener('click',()=>$$('#reader-text .token[aria-pressed=true]').forEach(el=>el.setAttribute('aria-pressed','false')));}};
function resizeWordMeaning(){const field=$('#term-meaning');if(!field)return;field.style.setProperty('height','0px','important');const height=Math.min(220,Math.max(64,field.scrollHeight+2));field.style.setProperty('height',height+'px','important');field.style.overflowY=field.scrollHeight>220?'auto':'hidden';field.dataset.sizedMeaning=field.value;field.dataset.sizedWidth=String(field.clientWidth);}
const wordPanelMeasureOriginal=focusedMeasure;focusedMeasure=function(){wordPanelMeasureOriginal();const panel=$('#word-panel'),field=$('#term-meaning');if(panel&&field&&innerWidth>1100){const player=$('.persistent-player'),bottom=player&&getComputedStyle(player).display!=='none'?player.getBoundingClientRect().top:innerHeight;panel.style.setProperty('--word-panel-available-height',Math.max(160,Math.floor(bottom-panel.getBoundingClientRect().top-16))+'px');}if(field){if(!field.dataset.resizeBound){field.dataset.resizeBound='true';field.addEventListener('input',resizeWordMeaning);}if(field.dataset.sizedMeaning!==field.value||field.dataset.sizedWidth!==String(field.clientWidth))resizeWordMeaning();}};
const familiarityLayoutOriginal=approvedLayout;approvedLayout=function(){familiarityLayoutOriginal();const panel=$('#word-panel')||$('#term-editor'),status=panel?.querySelector('.word-panel-status');if(panel&&status&&!panel.querySelector('.approved-familiarity')){const section=document.createElement('section');section.className='approved-familiarity';const heading=document.createElement('div');heading.className='approved-familiarity-heading';const label=document.createElement('span');label.textContent='Familiarity';const description=document.createElement('small');description.textContent=statusName(Number($('#term-status')?.value||1));heading.append(label,description);section.append(heading,status);status.classList.remove('approved-secondary-status');status.setAttribute('role','group');status.setAttribute('aria-label','Word familiarity');status.querySelectorAll('button').forEach(b=>{b.title=statusName(Number(b.dataset.directStatus));b.setAttribute('aria-pressed',String(Number(b.dataset.directStatus)===Number($('#term-status')?.value||1)));});const resources=panel.querySelector('.focused-meaning-details');if(resources)resources.before(section);else panel.append(section);}};
const familiarityPracticeOriginal=approvedPractice;approvedPractice=function(){familiarityPracticeOriginal();const r=review,answer=$('#review-answer');if(!r||r.material==='sentences'||!answer||answer.querySelector('.approved-familiarity'))return;const term=r.terms[r.index],word=s.words[term];if(!word)return;const section=document.createElement('section');section.className='approved-familiarity';section.innerHTML='<div class="approved-familiarity-heading"><span>Familiarity</span><small>Set this word’s level</small></div><div class="word-panel-status" role="group" aria-label="Word familiarity">'+[-1,1,2,3,4,5].map(n=>`<button data-practice-level="${n}" aria-label="${E(statusName(n))}" title="${E(statusName(n))}" aria-pressed="${word.status===n}">${n===-1?'⊘':n===5?'✓':n}</button>`).join('')+'</div>';answer.append(section);section.querySelectorAll('[data-practice-level]').forEach(b=>b.onclick=()=>{const status=Number(b.dataset.practiceLevel);C.term(s,term,{status,due:status>0&&status<5?(word.due||Date.now()):null});r.items[term].status=status;save();section.querySelectorAll('[data-practice-level]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.practiceLevel)===status)));});};

async function restartOpenLesson(){
 const lesson=(view==='library'&&current())||s.lessons.find(l=>l.id===playingLesson);if(!lesson)return;
 const resume=mediaPlaying()&&playingLesson===lesson.id;if(playingLesson===lesson.id)pauseMedia();pronunciation?.pause();readerSentenceRange=null;chosen='';anchor=null;s.positions[lesson.id]=0;s.audioPositions[lesson.id]=0;save();
 if(playingLesson===lesson.id){if(clips.length){clipIndex=0;await loadClip();}else seekMedia(0);}
 if(view==='library'&&current()?.id===lesson.id){reader(lesson);const article=$('#reader-text')?.closest('article');if(article)article.scrollTop=0;syncPlaybackHighlight();}
 if(resume&&playingLesson===lesson.id)await playMedia();
}
function installAuditedReaderControls(){
 const lesson=view==='library'?current():null,controls=$('.persistent-controls');
 if(controls&&!$('#player-start')){const start=document.createElement('button');start.id='player-start';start.type='button';start.setAttribute('aria-label','Back to beginning');start.title='Back to beginning';start.innerHTML=sidebarSvg('<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>')+'<span>Beginning</span>';start.onclick=act(restartOpenLesson);controls.insertBefore(start,$('#player-prev'));}
 for(const [id,path]of [['player-prev','M5 5v14M19 5l-9 7 9 7V5Z'],['player-next','M19 5v14M5 5l9 7-9 7V5Z']]){const b=$('#'+id);if(b&&!b.dataset.auditedIcon){b.dataset.auditedIcon='true';b.innerHTML=sidebarSvg('<path d="'+path+'"/>');}}
 const start=$('#player-start'),prev=$('#player-prev'),next=$('#player-next');if(start)start.disabled=!lesson&&!playingLesson;
 if(!lesson){if(prev)prev.disabled=!(clips.length&&clipIndex>0)&&!(queueIndex>0);if(next)next.disabled=!(clips.length&&clipIndex<clips.length-1)&&!(queueIndex<queue.length-1);return;}const parts=C.segments(lesson.text),position=Number(s.positions[lesson.id]||0),article=$('#reader-text')?.closest('article');
 if(s.settings.sentenceMode&&article&&!article.querySelector('.approved-sentence-navigation')){const previous=$('#prev-sentence'),next=$('#next-sentence');if(previous&&next){const nav=document.createElement('div');nav.className='approved-sentence-navigation';nav.setAttribute('role','group');nav.setAttribute('aria-label','Sentence navigation');const count=document.createElement('small');count.textContent='Sentence '+(position+1)+' of '+parts.length;previous.innerHTML=focusedIcon('back');next.innerHTML=focusedIcon('arrow');previous.disabled=position===0;next.disabled=position>=parts.length-1;nav.append(previous,count,next);const translation=$('#translation');if(translation)translation.after(nav);else article.append(nav);}}
 if(prev)prev.disabled=position<=0;if(next)next.disabled=position>=parts.length-1;
 const menu=$('#language-menu');if(menu){menu.setAttribute('aria-haspopup','menu');}
 const wordToggle=$('#reader-panel-toggle');if(wordToggle&&!wordToggle.dataset.auditedIcon){wordToggle.dataset.auditedIcon='true';wordToggle.innerHTML=sidebarSvg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16m-9-11h6m-6 4h6"/>');wordToggle.setAttribute('aria-controls','word-panel');wordToggle.title='Word details';}
}
function installAuditedAccessibility(){
 const content=$('#settings-content');const shell=$('.settings-page');if(shell&&!$('#mobile-settings-section')){const label=document.createElement('label');label.className='mobile-settings-selector';label.textContent='Settings section';const select=document.createElement('select');select.id='mobile-settings-section';select.setAttribute('aria-label','Settings section');for(const [key,name]of settingsSections()){const option=document.createElement('option');option.value=key;option.textContent=name;select.append(option);}select.value=settingsTab;select.onchange=()=>{const section=select.value;select.blur();openSettings(section);const panel=$('#settings-content');panel?.setAttribute('tabindex','-1');panel?.focus({preventScroll:true});};label.append(select);shell.querySelector('.settings-page-tabs').before(label);}
 if(content)content.setAttribute('aria-labelledby',settingsTabId(settingsTab));
 for(const b of $$('.app-sidebar [data-nav]')){const key=b.dataset.nav,active=key==='words'?['words','review'].includes(view):key==='library'?(['library','playlists'].includes(view)&&!(view==='library'&&!current()&&['focused-discover','home'].includes(libraryDiscoveryMode))):key===view;b.setAttribute('aria-current',active?'page':'false');}
 installAuditedSettingsAccess();
 const close=$('#close-word-sheet'),panel=$('#word-panel');if(close&&panel&&!close.dataset.auditedDismiss){close.dataset.auditedDismiss='true';close.onclick=()=>{const token=$('#reader-text .token[aria-pressed=true]');chosen='';anchor=null;delete panel.dataset.mobileRequested;panel.dataset.mobileDismissed='true';panel.classList.remove('mobile-word-sheet');panel.replaceChildren();$$('#reader-text .token[aria-pressed=true]').forEach(el=>el.setAttribute('aria-pressed','false'));document.body.classList.remove('hide-word-panel');token?.focus({preventScroll:true});focusedMeasure();};}
 const appearance=$('#focused-appearance');if(appearance)appearance.setAttribute('aria-label','Colour theme');
}

function installAuditedSettingsAccess(){
 const account=$('#current-account');if(account){if(!account.dataset.auditedSettings){account.dataset.auditedSettings='true';account.innerHTML=sidebarSvg('<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-2.1 1.2l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-2.1-1.2l-1.7.6L7 16.2l1.4-1.1A8 8 0 0 1 8 12.7L6.6 11.6 8 9.2l1.7.6a8 8 0 0 1 2.1-1.2l.3-1.8h2.8l.3 1.8a8 8 0 0 1 2.1 1.2l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1 .4 2.3Z" transform="translate(-1 -2)"/>');}account.setAttribute('aria-label','Settings and account');account.title='Settings and account';account.onclick=()=>openSettings('reader');}
 if(account)$('#profile-menu')?.remove();
 const toggle=$('#collapse-sidebar'),header=$('header');if(toggle&&header&&toggle.parentElement!==header)header.prepend(toggle);
}
player.addEventListener('play',()=>{$('#player-play')?.setAttribute('aria-label','Pause lesson');});player.addEventListener('pause',()=>{$('#player-play')?.setAttribute('aria-label','Play lesson');});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')&&!$('#floating-menu'))$('#close-word-sheet')?.click();});

let learningData={profile:{languages:[],active:null},available:[]},activeStudyLanguage='fi',sharedLanguageSources=[];
function learningLanguage(){return learningData.available.find(l=>l.code===activeStudyLanguage)||{code:'fi',name:'Finnish',nativeName:'Suomi',voice:{voice:'Harri',state:'ready'}};}
function languageFetch(url,options={}){return fetch(url,{...options,credentials:'include',headers:{...options.headers,'X-Oma-Language':activeStudyLanguage,'X-Oma-User':authUser?.id||''}});}
function languageURL(value){const url=new URL(base+value,location.href);url.searchParams.set('language',activeStudyLanguage);return url.href;}
async function prepareLearning(){learningData=await api('/api/learning');if(!learningData.profile.active){showLanguageOnboarding();return false;}activeStudyLanguage=learningData.profile.active;window.OmaLanguageCode=activeStudyLanguage;sharedLanguageSources=(await api('/api/shared-sources')).sources;return true;}
async function chooseStudyLanguage(code){await flush();if(!learningData.profile.interests?.[code]?.length)return showInterestPicker(code,()=>location.reload());await api('/api/learning',{language:code});connected=false;clearTimeout(saveTimer);pauseMedia();pronunciation?.pause();localStorage.setItem('oma-language-change',JSON.stringify({user:authUser.id,at:Date.now()}));location.reload();}
function showLanguageOnboarding(){
 document.body.className='auth-page';document.body.innerHTML=`<main class="auth-screen"><section class="auth-card onboarding-card"><div class="auth-brand">${omaBrandMark}<span>${OMA_BRAND_NAME}</span></div><h1>What would you like to learn?</h1><p>Choose your first study language. You can add more later. Each language has its own words, lessons and progress.</p><form id="language-onboarding"><div class="learning-language-grid">${learningData.available.map(l=>`<label class="learning-language-choice"><input type="radio" name="language" value="${E(l.code)}" ${authUser.legacy&&l.code==='fi'?'checked':''} required><span><strong>${E(l.name)}</strong><small>${E(l.nativeName)}</small><small>Local voice: ${E(l.voice.voice)}${l.code==='zh-Hant'?' · Mandarin':''} · ${l.voice.state==='ready'?'ready':'preparing'}</small></span></label>`).join('')}</div><h2>What interests you?</h2><p>Choose a few topics. O/L will follow matching sources for this language.</p>${interestChoices([])}${authUser.legacy?'<p>Your existing Finnish library stays available when you choose Finnish.</p>':''}<p id="learning-onboarding-status" role="status"></p><button class="primary">Start learning</button></form><button id="onboarding-sign-out" class="quiet">Sign out</button></section></main>`;
 $('#language-onboarding').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{const interests=$$('[name=learning-interest]:checked').map(input=>input.value);if(!interests.length)throw Error('Choose at least one interest.');await api('/api/learning',{language:new FormData(event.target).get('language'),interests});location.reload();}catch(error){$('#learning-onboarding-status').textContent=error.message;button.disabled=false;}};
 $('#onboarding-sign-out').onclick=async()=>{await authRequest('logout',{});location.reload();};
}
function syncLearningChrome(){
 const language=learningLanguage(),menu=$('#language-menu');if(menu){menu.innerHTML=`<span>${E(language.nativeName)}</span><svg class="oma-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;menu.setAttribute('aria-label','Study language: '+language.name);menu.onclick=event=>floatingMenu(event.currentTarget,[...learningData.profile.languages.map(code=>({label:(code===activeStudyLanguage?'✓ ':'')+learningData.available.find(l=>l.code===code).name,run:()=>code===activeStudyLanguage?null:chooseStudyLanguage(code)})),{label:'Add a language',run:()=>openSettings('languages')}]);}
 const option=$('#speech-provider option[value=piper]');if(option)option.textContent='Piper '+language.voice.voice+' · '+language.name+' · local, free';
}
async function languageSettings(){settingsShell();const host=$('#settings-content');host.innerHTML=`<section class="settings-card"><h2>Your study languages</h2><p>Each language keeps its own library and vocabulary. Publisher sources are shared with everyone studying that language.</p><div class="learning-language-grid">${learningData.profile.languages.map(code=>{const l=learningData.available.find(l=>l.code===code);return `<div class="learning-language-card"><h3>${E(l.name)}</h3><p>${E(l.nativeName)}</p><small>Local voice: ${E(l.voice.voice)} · ${l.voice.state==='ready'?'ready':'preparing'}</small><button data-switch-language="${E(code)}" ${code===activeStudyLanguage?'disabled':''}>${code===activeStudyLanguage?'Current language':'Open library'}</button></div>`}).join('')}</div></section><section class="settings-card"><h2>Your interests</h2><p>Choose topics for ${E(learningLanguage().name)}. Matching publishers will be followed in this language’s Library.</p><button id="settings-interests">Choose interests</button></section><section class="settings-card"><h2>Add a language</h2><div class="learning-language-grid">${learningData.available.filter(l=>!learningData.profile.languages.includes(l.code)).map(l=>`<div class="learning-language-card"><h3>${E(l.name)}</h3><p>${E(l.nativeName)}</p><small>Local voice: ${E(l.voice.voice)} · ${l.voice.state==='ready'?'ready':'preparing'}</small><button data-switch-language="${E(l.code)}">Add and start learning</button></div>`).join('')||'<p>All available languages have been added.</p>'}</div></section><p id="language-settings-status" role="status"></p>`;
 bind('settings-interests',()=>showInterestPicker(activeStudyLanguage,()=>languageSettings()));
 $$('[data-switch-language]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await chooseStudyLanguage(b.dataset.switchLanguage)}catch(error){$('#language-settings-status').textContent=error.message;b.disabled=false}});
}
window.addEventListener('storage',event=>{if(event.key==='oma-language-change'&&authReady){try{if(JSON.parse(event.newValue).user===authUser.id){connected=false;clearTimeout(saveTimer);pauseMedia();location.reload()}}catch{}}});

function learningPreviewText(){return {fi:'Hei! Tänään opimme suomea. Järven rannalla pidämme tauon.',en:'Hello! Today we are learning English. Let us take a break by the lake.',hu:'Szia! Ma magyarul tanulunk. A tó partján tartunk egy kis szünetet.','zh-Hant':'你好！今天我們一起學習中文。我們在湖邊休息一下。',ja:'こんにちは。今日は日本語を勉強します。湖のほとりで少し休みましょう。'}[activeStudyLanguage];}

function interestChoices(selected){const choices=learningData.interests||['Reading','Videos','News Feed','Guided Courses','Mini Stories','Entertainment','Grammar','Travel','Podcasts','Sports','Technology'];return '<div class="learning-interest-grid">'+choices.map(topic=>`<label><input type="checkbox" name="learning-interest" value="${E(topic)}" ${selected.includes(topic)?'checked':''}><span>${E(topic)}</span></label>`).join('')+'</div>';}
function showInterestPicker(code,onDone){const selected=learningData.profile.interests?.[code]||[];const language=learningData.available.find(l=>l.code===code);modal('Your interests · '+(language?.name||code),`<p>Choose topics to follow matching public sources. Imported lessons and saved words stay unchanged.</p>${interestChoices(selected)}<p id="interest-status" role="status"></p><button id="save-interests" class="primary">Follow matching sources</button>`,()=>bind('save-interests',async()=>{const button=$('#save-interests'),status=$('#interest-status');const topics=$$('[name=learning-interest]:checked').map(input=>input.value);if(!topics.length){status.textContent='Choose at least one interest.';return;}button.disabled=true;try{const result=await api('/api/learning',{language:code,interests:topics});learningData.profile=result.profile;if(code===activeStudyLanguage){const automatic=new Set(s.settings.interestSourceIds||[]),manual=(s.settings.followedSources||[]).filter(id=>!automatic.has(id)),recommended=discoverySources().filter(source=>topics.some(topic=>sourceMatchesCategory(source,topic))).map(source=>source.id);s.settings.interestSourceIds=recommended;s.settings.followedSources=[...new Set([...manual,...recommended])];save();await flush();}$('#dialog').close();onDone?.();}catch(e){status.textContent=e.message;button.disabled=false;}}));}

let authUser=null,authReady=false;
const accountStorage={
 getItem(key){const value=localStorage.getItem('oma-user-'+authUser?.id+':'+activeStudyLanguage+':'+key);return value===null&&activeStudyLanguage==='fi'?(localStorage.getItem('oma-user-'+authUser?.id+':'+key)??(authUser?.legacy?localStorage.getItem(key):null)):value;},
 setItem(key,value){if(authUser)localStorage.setItem('oma-user-'+authUser.id+':'+activeStudyLanguage+':'+key,value);},
 removeItem(key){if(authUser){localStorage.removeItem('oma-user-'+authUser.id+':'+activeStudyLanguage+':'+key);if(activeStudyLanguage==='fi'){localStorage.removeItem('oma-user-'+authUser.id+':'+key);if(authUser.legacy)localStorage.removeItem(key)};}}
};
function removeLegacyBrowserChat(){
 const copies=['oma-reader-v1','oma-reader-v2','oma-pending-v2','oma-browser-recovery'];
 const prefix='oma-user-'+authUser.id+':';
 for(let index=0;index<localStorage.length;index++){
  const key=localStorage.key(index);
  const name=key?.startsWith(prefix)?key.split(':').at(-1):authUser.legacy?key:null;
  if(!copies.includes(name))continue;
  try{
   const value=JSON.parse(localStorage.getItem(key));
   const state=name==='oma-pending-v2'?value?.state:value;
   const library=C.withoutChat(state);
   if(library!==state)localStorage.setItem(key,JSON.stringify(name==='oma-pending-v2'?{...value,state:library}:library));
  }catch{}
 }
}
async function authRequest(path,body){const r=await fetch(base+'/api/auth/'+path,{credentials:'include',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw Error(value.error||'The account service could not respond.');return value;}
function omaServiceCandidates(){
 if(location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname)){
  return ['',...['3219','3220','3221'].map(port=>'http://'+location.hostname+':'+port)];
 }
 return [''];
}
async function startAuthenticatedOma(){
 let found=false;for(const candidate of omaServiceCandidates())try{const r=await fetch(candidate+'/api/health',{credentials:'include',signal:AbortSignal.timeout(1800)}),h=await r.json();if(r.ok&&h.appVersion===4&&h.resourceCatalogVersion>=2&&h.authentication){base=candidate;found=true;break;}}catch{}
 if(!found){
  const message=location.protocol==='https:'?'Check the Oma Lingo server, then try again.':'Start O/L with Open-Oma.cmd, then refresh this page to sign in.';
  document.body.innerHTML='<main class="auth-screen"><section class="auth-card"><h1>Oma Lingo could not connect</h1><p>'+message+'</p><button onclick="location.reload()">Try again</button></section></main>';return;
 }
 const result=await authRequest('session');
 if(!result.user){showSignIn(result.setupRequired,result.setupCodeRequired);return;}
 authUser=result.user;removeLegacyBrowserChat();if(!await prepareLearning())return;authReady=true;await init();startImportMonitor();const accountButton=document.createElement('button');accountButton.id='current-account';accountButton.title=authUser.name+' · Account';accountButton.setAttribute('aria-label','Account: '+authUser.name);accountButton.innerHTML='<svg width=20 height=20 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 aria-hidden=true><circle cx=12 cy=8 r=4></circle><path d="M4 21v-2a8 8 0 0 1 16 0v2"></path></svg><span>'+E(authUser.name)+'</span>';accountButton.onclick=()=>openSettings('account');$('header>.row')?.append(accountButton);syncAdaptiveUI();adaptiveObserver.observe($('#main'),{childList:true,subtree:true});
}
function showSignIn(setup=false,setupCodeRequired=false){
 const setupCodeField=setupCodeRequired?`<label>Docker setup code<input name="setupCode" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" required></label><details><summary>Where do I find the setup code?</summary><p>Run this in your Oma Lingo Compose folder on the Docker host.</p><code>docker compose exec -T omalingo cat /var/lib/omalingo/setup-code</code></details>`:'';
 document.body.className='auth-page';document.body.innerHTML=`<main class="auth-screen"><section class="auth-card"><div class="auth-brand">${omaBrandMark}<span>${OMA_BRAND_NAME}</span></div><h1>${setup?'Create your administrator account':'Welcome back'}</h1><p>${setup?'Choose your administrator username and password. You can add other users after signing in.':'Sign in to your own learning library.'}</p><form id="auth-form">${setupCodeField}${setup?'<label>Your name<input name="name" autocomplete="name" maxlength="80" required></label>':''}<label>Username<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="32" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}" required></label><label>Password<input name="password" type="password" autocomplete="${setup?'new-password':'current-password'}" minlength="10" maxlength="128" required></label>${setup?'<label>Confirm password<input name="confirm" type="password" autocomplete="new-password" required></label><small>Use at least 10 characters. Keep this administrator password somewhere safe.</small>':''}<p id="auth-error" role="alert"></p><button class="primary" type="submit">${setup?'Create account':'Sign in'}</button></form>${setup?'':'<small>Accounts are created by this O/L installation’s administrator. Ask them if you need an account or a password reset.</small>'}</section></main>`;
 $('#auth-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),button=e.currentTarget.querySelector('button');$('#auth-error').textContent='';button.disabled=true;try{if(setup&&f.get('password')!==f.get('confirm'))throw Error('The passwords do not match.');await authRequest(setup?'setup':'login',Object.fromEntries(f));localStorage.setItem('oma-auth-change',String(Date.now()));location.reload();}catch(error){$('#auth-error').textContent=error.message;button.disabled=false;}};
}
async function signOutOma(){
 try{await flush();}catch(error){toast('Could not save your latest changes. '+error.message);return;}
 await authRequest('logout',{});localStorage.setItem('oma-auth-change',String(Date.now()));connected=false;clearTimeout(saveTimer);pauseMedia();pronunciation?.pause();location.reload();
}
async function accountSettings(){
 settingsShell();const host=$('#settings-content');host.innerHTML=`<section class="settings-card"><h2>${E(authUser.name)}</h2><p>${E(authUser.username)} · ${authUser.role==='admin'?'Administrator':'User'}</p><button id="account-sign-out">Sign out</button></section><section class="settings-card"><h2>Change password</h2><form id="account-password-form"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>New password<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><label>Confirm new password<input name="confirm" type="password" autocomplete="new-password" required></label><button class="primary">Change password</button><p role="status" id="account-password-status"></p></form></section>${authUser.role==='admin'?'<section class="settings-card"><h2>Users</h2><p>Each user has a separate library, progress and API connections.</p><div id="account-user-list">Loading users…</div></section><section class="settings-card"><h2>Add a user</h2><form id="account-create-form"><label>Display name<input name="name" autocomplete="off" maxlength="80" required></label><label>Username<input name="username" autocomplete="off" autocapitalize="none" minlength="3" maxlength="32" required></label><label>Initial password<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><button class="primary">Create user</button><p id="account-create-status" role="status"></p></form></section>':''}`;
 bind('account-sign-out',signOutOma);
 const submit=(id,action,status)=>{$('#'+id).onsubmit=async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button'),values=Object.fromEntries(new FormData(e.currentTarget));button.disabled=true;try{if(values.confirm!==undefined&&values.confirm!==values.password)throw Error('The passwords do not match.');await authRequest(action,values);e.target.reset();$('#'+status).textContent=action==='users'?'User created. They can now sign in.':'Password changed. Other sessions have been signed out.';if(action==='users')await refreshUsers();}catch(error){$('#'+status).textContent=error.message;}finally{button.disabled=false;}}};
 submit('account-password-form','password','account-password-status');
 if(authUser.role!=='admin')return;
 submit('account-create-form','users','account-create-status');
 async function refreshUsers(){const result=await authRequest('users');$('#account-user-list').innerHTML=result.users.map(u=>`<div class="account-user"><div><strong>${E(u.name)}</strong><small>${E(u.username)} · ${u.role==='admin'?'Administrator':u.disabled?'Disabled':'Active'}</small></div>${u.role==='admin'?'':`<button data-toggle-user="${E(u.id)}" data-disabled="${!u.disabled}">${u.disabled?'Enable':'Disable'}</button><button data-reset-user="${E(u.id)}">Reset password</button>`}</div>`).join('');
  $$('[data-toggle-user]').forEach(b=>b.onclick=act(async()=>{await authRequest('users/update',{id:b.dataset.toggleUser,disabled:b.dataset.disabled==='true'});await refreshUsers();}));
  $$('[data-reset-user]').forEach(b=>b.onclick=()=>modal('Reset password',`<form id="reset-user-form"><label>New password<input type="password" name="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><p>This signs the user out on all devices.</p><button class="primary">Set password</button><p id="reset-user-status" role="status"></p></form>`,()=>{$('#reset-user-form').onsubmit=async e=>{e.preventDefault();try{await authRequest('users/update',{id:b.dataset.resetUser,password:new FormData(e.target).get('password')});$('#dialog').close();toast('Password reset.');}catch(error){$('#reset-user-status').textContent=error.message;}};}));
 }
 try{await refreshUsers();}catch(error){$('#account-user-list').textContent=error.message;}
}

window.addEventListener('storage',event=>{if(event.key==='oma-auth-change'&&authReady){connected=false;clearTimeout(saveTimer);pauseMedia();location.reload();}});

startAuthenticatedOma().catch(e=>{document.body.innerHTML='<main><h1>O/L could not open</h1><p>'+E(e.message)+'</p><p>Your existing browser data has been preserved. Open O/L with its launcher and refresh.</p></main>';});
})();
