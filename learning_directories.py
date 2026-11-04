"""Bounded previews from explicitly curated public learning directories."""
import hashlib, json, re, urllib.parse
from pathlib import Path

def directory_items(url, fetch_url):
    seeds=json.loads((Path(__file__).parent/'shared-source-seeds.json').read_text(encoding='utf-8'))
    source=next((s for s in seeds if s.get('directory') and url in (s['url'],s.get('feedUrl'))),None)
    if not source:return None
    def item(link,title,image='',browse_only=False):
        return {'id':hashlib.sha256((url+'\0'+link).encode()).hexdigest(),'title':title,'url':link,
                'summary':source['description'],'sourceTitle':source['name'],'image':image,
                'audioUrl':'','youtubeId':'','published':'','duration':0,'kind':'article','browseOnly':browse_only}
    config=source['directory']
    if config.get('lessons'):
        items=[item(lesson['url'],lesson['title'],browse_only=config.get('browseOnly',False)) for lesson in config['lessons']]
        return {'title':source['name'],'url':url,'items':items}
    from bs4 import BeautifulSoup
    target=source.get('feedUrl') or source['url']
    raw,mime,resolved=fetch_url(target)
    if len(raw)>20*1024*1024:raise ValueError('Learning directory is too large.')
    soup=BeautifulSoup(raw,'html.parser');items=[];seen=set()
    for anchor in soup.select(config['selector']):
        link=urllib.parse.urljoin(resolved,anchor.get('href',''));parts=urllib.parse.urlsplit(link)
        if parts.hostname!=urllib.parse.urlsplit(resolved).hostname or parts.fragment or not re.search(config['pattern'],parts.path):continue
        title=anchor.get_text(' ',strip=True)
        if config.get('titlePattern') and not re.search(config['titlePattern'],title,re.I):continue
        if config.get('titleFromHeading'):
            if not title:continue
            size=re.search(r'(\d+(?:\.\d+)?)\s*MB',title,re.I)
            if size and float(size.group(1))>20:continue
            heading=anchor.find_previous(['h2','h3','h4'])
            title=(heading.get_text(' ',strip=True)+' · ' if heading else '')+parts.path.rsplit('/',1)[-1]
        if len(title)<3 or link in seen:continue
        seen.add(link);image=anchor.find('img')
        items.append(item(link,title,urllib.parse.urljoin(resolved,image.get('src','')) if image else '',config.get('browseOnly',False)))
        if len(items)>=30:break
    if not items:raise ValueError('This publisher’s directory layout changed. Use Browse source to choose a lesson directly.')
    return {'title':source['name'],'url':url,'items':items}
