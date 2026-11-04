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
