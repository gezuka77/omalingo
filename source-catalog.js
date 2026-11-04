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
