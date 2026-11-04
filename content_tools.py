"""Local document/media tooling. One JSON request on stdin, one JSON result."""
import sys, os, json, re, zipfile, io, hashlib, posixpath, socket, ipaddress, urllib.parse, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent
LANGUAGE=os.environ.get('OMA_LANGUAGE_CODE','fi')
LANGUAGE_NAME=os.environ.get('OMA_LANGUAGE_NAME','Finnish')
DATA=Path(os.environ.get('OMA_DATA_DIR',ROOT/'data'));DATA.mkdir(exist_ok=True,parents=True)
(DATA/'jobs').mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(DATA/'jobs')
os.environ.setdefault('XDG_DATA_HOME',str(DATA/'models'))
os.environ.setdefault('XDG_CACHE_HOME',str(DATA/'cache'))
os.environ.setdefault('XDG_CONFIG_HOME',str(DATA/'config'))
os.environ.setdefault('HF_HOME',str(DATA/'models'/'huggingface'))
os.environ.setdefault('ARGOS_INTRA_THREADS','2')
os.environ.setdefault('ARGOS_PACKAGES_DIR',str(DATA/'models'/'argos'))
YOUTUBE_RUNTIME={'js_runtimes':{'node':{}}} if os.environ.get('OMA_YOUTUBE_USE_NODE')=='1' else {}
sys.path.insert(0,str(ROOT/'runtime'/'import-packages'))
sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
def clean_html(raw):
    from bs4 import BeautifulSoup
    if isinstance(raw,bytes):
        try:raw=raw.decode('utf-8-sig')
        except UnicodeDecodeError:pass
    soup=BeautifulSoup(raw,'html.parser')
    for tag in soup(['script','style','nav','header','footer','form','noscript','iframe']):tag.decompose()
    return soup
def public_url(url):
    p=urllib.parse.urlparse(url)
    if p.scheme not in ('http','https') or not p.hostname or p.username or p.password:raise ValueError('Use a public http or https URL.')
    if p.port and p.port not in (80,443):raise ValueError('Only standard web ports are supported.')
    for result in socket.getaddrinfo(p.hostname,p.port or (443 if p.scheme=='https' else 80)):
        if not ipaddress.ip_address(result[4][0]).is_global:raise ValueError('Local/private network URLs cannot be imported.')
    return url
def fetch_url(url):
    import requests
    for _ in range(6):
        public_url(url)
        r=requests.get(url,headers={'User-Agent':'OmaPersonalReader/2.0 (personal language study)'},timeout=25,allow_redirects=False,stream=True)
        if r.is_redirect:url=urllib.parse.urljoin(url,r.headers['location']);continue
        r.raise_for_status();parts=[];size=0
        for chunk in r.iter_content(65536):
            size+=len(chunk)
            if size>20*1024*1024:raise ValueError('The source is larger than 20 MB.')
            parts.append(chunk)
        return b''.join(parts),r.headers.get('Content-Type',''),url
    raise ValueError('Too many redirects.')
def subtitles(text):
    def time(t):
        p=[float(x) for x in t.replace(',','.').split(':')];return sum(v*60**i for i,v in enumerate(reversed(p)))
    cues=[]
    for block in re.split(r'\n\s*\n',text.replace('\r','')):
        lines=block.split('\n')
        for i,line in enumerate(lines):
            m=re.search(r'((?:\d+:)?\d{2}:\d{2}[.,]\d+)\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d+)',line)
            if m:
                value=clean_html(' '.join(lines[i+1:])).get_text(' ',strip=True)
                if value and (not cues or cues[-1]['text']!=value):cues.append({'start':time(m[1]),'end':time(m[2]),'text':value})
                break
    return {'text':'\n'.join(c['text'] for c in cues),'cues':cues}
def extract(file,name):
    ext=Path(name).suffix.lower();raw=Path(file).read_bytes();chapters=[];cues=[]
    if ext in ('.mobi','.azw','.azw3'):
        import mobi, shutil, tempfile
        folder,output=mobi.extract(str(file))
        try:return {**extract(output,Path(output).name),'title':Path(name).stem}
        finally:
            target=Path(folder).resolve()
            if target.is_relative_to(Path(tempfile.gettempdir()).resolve()):shutil.rmtree(target)
    if ext in ('.srt','.vtt'):return {**subtitles(raw.decode('utf-8-sig')), 'title':Path(name).stem,'chapters':[]}
    if ext in ('.ttml','.xml','.ass'):
        import xml.etree.ElementTree as ET
        def seconds(t):
            if t.endswith('ms'):return float(t[:-2])/1000
            if t.endswith('s'):return float(t[:-1])
            parts=[float(n) for n in t.split(':')];return sum(n*60**i for i,n in enumerate(reversed(parts)))
        if ext=='.ass':
            for line in raw.decode('utf-8-sig').splitlines():
                if not line.startswith('Dialogue:'):continue
                fields=line.split(':',1)[1].split(',',9)
                if len(fields)<10:continue
                value=re.sub(r'\{[^}]*\}','',fields[9]).replace('\\N',' ').replace('\\n',' ')
                cues.append({'start':seconds(fields[1]),'end':seconds(fields[2]),'text':value})
        else:
            tree=ET.fromstring(raw)
            for element in tree.iter():
                if not element.tag.endswith('}p') and element.tag!='p':continue
                if 'begin' not in element.attrib:continue
                begin=seconds(element.attrib['begin']);end=seconds(element.attrib['end']) if 'end' in element.attrib else begin+seconds(element.attrib.get('dur','3s'))
                cues.append({'start':begin,'end':end,'text':''.join(element.itertext()).strip()})
        if not cues:raise ValueError('No timed subtitle lines were found.')
        return {'text':'\n'.join(c['text'] for c in cues),'title':Path(name).stem,'cues':cues,'chapters':[]}
    if ext=='.pdf':
        from pypdf import PdfReader
        reader=PdfReader(io.BytesIO(raw));chapters=[{'title':f'Page {i+1}','text':p.extract_text() or ''} for i,p in enumerate(reader.pages)]
    elif ext in ('.docx','.epub'):
        import xml.etree.ElementTree as ET
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            if sum(i.file_size for i in z.infolist())>100*1024*1024:raise ValueError('Expanded document is too large.')
            if ext=='.docx':
                tree=ET.fromstring(z.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                chapters=[{'title':Path(name).stem,'text':'\n\n'.join(''.join(p.itertext()) for p in tree.findall('.//w:p',ns))}]
            else:
                container=ET.fromstring(z.read('META-INF/container.xml'));opf=next(e.attrib['full-path'] for e in container.iter() if e.tag.endswith('rootfile'))
                tree=ET.fromstring(z.read(opf));manifest={e.attrib.get('id'):e.attrib.get('href') for e in tree.iter() if e.tag.endswith('}item')}
                for item in tree.iter():
                    if not item.tag.endswith('}itemref'):continue
                    href=manifest.get(item.attrib.get('idref'))
                    if not href:continue
                    source=posixpath.normpath(posixpath.join(posixpath.dirname(opf),urllib.parse.unquote(href.split('#')[0])))
                    if source.startswith('../'):continue
                    soup=clean_html(z.read(source));title=soup.find(['h1','h2','title']);text=soup.get_text('\n',strip=True)
                    if text:chapters.append({'title':title.get_text(' ',strip=True) if title else f'Chapter {len(chapters)+1}','text':text})
    elif ext in ('.html','.htm'):chapters=[{'title':Path(name).stem,'text':clean_html(raw).get_text('\n',strip=True)}]
    elif ext=='.txt':chapters=[{'title':Path(name).stem,'text':raw.decode('utf-8-sig')}]
    else:raise ValueError('Supported files: TXT, EPUB, DOCX, text PDF, SRT, VTT, HTML.')
    text='\n\n'.join(c['text'] for c in chapters)
    if not text.strip():raise ValueError('No text found. Scanned PDFs need OCR before importing.')
    if len(text)>2000000:raise ValueError('This document exceeds two million characters. Split it into smaller books or chapters before importing.')
    return {'title':Path(name).stem,'text':text,'chapters':chapters,'cues':cues}
def youtube(url,caption_mode='available'):
    import yt_dlp
    public_url(url)
    if urllib.parse.urlparse(url).hostname not in ('youtube.com','www.youtube.com','youtu.be','m.youtube.com'):raise ValueError('Use a YouTube video URL.')
    class Quiet:
        def debug(self,*a):pass
        def warning(self,*a):pass
        def error(self,*a):pass
    with yt_dlp.YoutubeDL({**YOUTUBE_RUNTIME,'quiet':True,'skip_download':True,'noplaylist':True,'logger':Quiet(),'socket_timeout':25}) as ydl:info=ydl.extract_info(url,download=False)
    if caption_mode=='inventory':
        from youtube_captions import available_tracks
        return available_tracks(info)
    from youtube_captions import select_track, caption_result
    track,automatic=select_track(info,caption_mode)
    raw,_,_=fetch_url(track['url']);result=subtitles(raw.decode('utf-8'))
    return caption_result(info,url,result,automatic)

def dictionary(term):
    page=urllib.parse.quote(term,safe='');api='https://en.wiktionary.org/w/api.php?action=parse&page='+page+'&prop=text&format=json&formatversion=2&redirects=1'
    raw,_,_=fetch_url(api);result=json.loads(raw)
    if 'error' in result:return {'definitions':[],'url':'https://en.wiktionary.org/wiki/'+page+'#'+LANGUAGE_NAME.replace('Chinese (Traditional)','Chinese')}
    soup=clean_html(result['parse']['text']);marker=soup.find(id=LANGUAGE_NAME.replace('Chinese (Traditional)','Chinese'));definitions=[]
    if marker:
        heading=marker.find_parent(['h2']) or marker
        for element in heading.find_all_next():
            if element.name=='h2':break
            if element.name=='li' and element.find_parent('ol') and not element.find_parent('li') and not element.find_parent(class_='references'):
                text=element.get_text(' ',strip=True)
                if text and text not in definitions:definitions.append(text)
            if len(definitions)>=10:break
    return {'definitions':definitions,'url':'https://en.wiktionary.org/wiki/'+page+'#'+LANGUAGE_NAME.replace('Chinese (Traditional)','Chinese'),'source':'Wiktionary (CC BY-SA)'}
def execute(req):
    action=req['action']
    if action=='source-metadata':
        from feed_tools import source_metadata
        return source_metadata(req,fetch_url,public_url)
    if action=='feed':
        from feed_tools import read_feed
        return read_feed(req,fetch_url,public_url)
    if action=='download-audio-url':
        from feed_tools import download_audio
        return download_audio(req,fetch_url,public_url,DATA)
    if action=='extract':return extract(req['path'],req['name'])
    if action=='web':
        url=req['url'];host=urllib.parse.urlparse(url).hostname
        if host in ('youtube.com','www.youtube.com','youtu.be','m.youtube.com'):return youtube(url)
        raw,kind,url=fetch_url(url)
        if kind.startswith(('audio/','video/')):return {'audioUrl':url}
        if 'pdf' in kind:
            p=DATA/'incoming-web.pdf';p.write_bytes(raw);return {**extract(p,'article.pdf'),'sourceUrl':url}
        from article_extract import extract_article
        return extract_article(raw,url)
    if action=='youtube-captions':return youtube(req['url'],req.get('captionMode','publisher'))
    if action=='youtube-caption-tracks':return youtube(req['url'],'inventory')
    if action=='dictionary':return dictionary(req['term'])
    if action=='translate':
        if LANGUAGE=='en':return {'text':req['text'],'provider':'Original English text'}
        import argostranslate.translate as translate
        return {'text':translate.translate(req['text'],LANGUAGE,'en'),'provider':'Argos · local'}
    if action=='install-translation':
        import argostranslate.package as package
        package.update_package_index();model=next((p for p in package.get_available_packages() if p.from_code==LANGUAGE and p.to_code=='en'),None)
        if not model:raise ValueError('No '+LANGUAGE_NAME+' → English Argos package was found.')
        package.install_from_path(model.download());return {'installed':True}
    if action=='prepare-openai-audio':
        import av, numpy as np, wave, uuid
        source=req.get('path');metadata={}
        if not source:
            import yt_dlp
            video=req.get('youtubeId','')
            if not re.fullmatch(r'[A-Za-z0-9_-]{11}',video):raise ValueError('Attach original audio or choose a YouTube lesson.')
            class Quiet:
                def debug(self,*a):pass
                def warning(self,*a):pass
                def error(self,*a):pass
            target=str(DATA/'jobs'/('youtube-'+uuid.uuid4().hex+'.%(ext)s'))
            try:
                with yt_dlp.YoutubeDL({**YOUTUBE_RUNTIME,'format':'bestaudio/best','outtmpl':target,'noplaylist':True,'quiet':True,'logger':Quiet(),'socket_timeout':25,'max_filesize':150*1024*1024,'match_filter':lambda info,**kw: 'Video exceeds two hours.' if info.get('duration',0)>7200 else None}) as ydl:
                    info=ydl.extract_info('https://www.youtube.com/watch?v='+video,download=True);source=ydl.prepare_filename(info);metadata={'title':info.get('title','YouTube lesson'),'youtubeId':video,'sourceUrl':'https://www.youtube.com/watch?v='+video,'publisher':info.get('channel','')}
            except Exception:raise ValueError('YouTube audio could not be retrieved. Download permitted original audio yourself and attach it to the lesson, then retry.')
        if not req.get('path'):
            import shutil
            original=Path(source);extension=original.suffix.lower()
            if extension not in ('.webm','.m4a','.mp4','.mp3','.ogg','.wav','.flac'):extension='.webm'
            media=hashlib.sha256(original.read_bytes()).hexdigest()+extension
            destination=DATA/'media'/media;destination.parent.mkdir(exist_ok=True)
            if not destination.exists():shutil.copy2(original,destination)
            metadata['alignmentMedia']=media
        chunks=[];pending=[];pending_count=0;total=0;limit=16000*(7200 if req.get("alignmentOnly") else 600)
        def emit(samples):
            name='transcription-'+uuid.uuid4().hex+'.wav';out=DATA/'jobs'/name
            with wave.open(str(out),'wb') as wav:wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(samples.tobytes())
            chunks.append(str(out))
        try:
            with av.open(source) as container:
                resampler=av.AudioResampler(format='s16',layout='mono',rate=16000)
                for frame in container.decode(audio=0):
                    for converted in resampler.resample(frame):
                        samples=converted.to_ndarray().flatten();total+=len(samples)
                        if total>16000*7200:raise ValueError('Use audio shorter than two hours.')
                        pending.append(samples);pending_count+=len(samples)
                        if pending_count>=limit:
                            joined=np.concatenate(pending)
                            while len(joined)>=limit:emit(joined[:limit]);joined=joined[limit:]
                            pending=[joined];pending_count=len(joined)
                for converted in resampler.resample(None):
                    samples=converted.to_ndarray().flatten();pending.append(samples);pending_count+=len(samples)
            if pending_count:emit(np.concatenate(pending))
            if not chunks:raise ValueError('No audio stream was found.')
            return {'chunks':chunks,**metadata}
        except:
            for f in chunks:Path(f).unlink(missing_ok=True)
            raise
        finally:
            if not req.get('path') and source:Path(source).unlink(missing_ok=True)
    if action=='align-audio':
        from audio_alignment import align_audio
        return align_audio(req['paths'],req['texts'],Path(os.environ.get('OMA_ALIGNMENT_MODELS',ROOT/'data'/'models'/'whisper')))
    if action=='transcribe':
        from faster_whisper import WhisperModel
        # PyAV 19 removed metadata_errors, which faster-whisper 1.2 still passes.
        # Decode through PyAV directly and pass PCM to Whisper for version independence.
        import av, numpy as np
        frames=[]
        with av.open(req['path']) as container:
            resampler=av.AudioResampler(format='fltp',layout='mono',rate=16000)
            for frame in container.decode(audio=0):
                for converted in resampler.resample(frame):frames.append(converted.to_ndarray().flatten())
            for converted in resampler.resample(None):frames.append(converted.to_ndarray().flatten())
        if not frames:raise ValueError('No audio stream was found in this file.')
        samples=np.concatenate(frames).astype(np.float32)
        size=req.get('model','base')
        if size not in ('tiny','base','small'):raise ValueError('Choose tiny, base, or small.')
        model=WhisperModel(size,device='cpu',compute_type='int8',cpu_threads=2,download_root=str(DATA/'models'/'whisper'))
        parts,info=model.transcribe(samples,language=LANGUAGE,word_timestamps=True,vad_filter=True)
        cues=[{'start':s.start,'end':s.end,'text':s.text.strip(),'words':[{'start':w.start,'end':w.end,'text':w.word} for w in (s.words or [])]} for s in parts]
        return {'text':'\n'.join(c['text'] for c in cues),'cues':cues,'language':info.language}
    if action=='anki':
        import genanki, html
        model=genanki.Model(2096918230,'Oma Lingo vocabulary',fields=[{'name':n} for n in ['Term','Meaning','Context','Notes']],templates=[{'name':'Recognition','qfmt':'{{Term}}','afmt':'{{FrontSide}}<hr id="answer">{{Meaning}}<br>{{Context}}<br>{{Notes}}'}])
        deck=genanki.Deck(2096918231,'Oma Lingo '+os.environ.get('OMA_LANGUAGE_NAME','Finnish'))
        for w in req['terms']:deck.add_note(genanki.Note(model=model,guid=genanki.guid_for('oma-fi',w.get('term','')),fields=[html.escape(str(w.get(k,''))) for k in ['term','meaning','context','note']],tags=[re.sub(r'\s','_',t) for t in w.get('tags',[])]))
        genanki.Package(deck).write_to_file(req['output']);return {'path':req['output']}
    if action=='backup':
        state={key:value for key,value in req['state'].items() if key!='aiConversations'}
        with zipfile.ZipFile(req['output'],'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('state.json',json.dumps(state,ensure_ascii=False))
            z.writestr('manifest.json',json.dumps({'format':'oma-complete-backup','version':2}))
            for folder in [DATA/'media',Path(os.environ.get('OMA_AUDIO_CACHE_DIR',ROOT/'audio-cache'))]:
                if folder.exists():
                    for p in folder.iterdir():
                        if p.is_file() and re.fullmatch(r'[a-f0-9]{64}\.[a-z0-9]+',p.name):z.write(p,folder.name+'/'+p.name)
        return {'path':req['output']}
    if action=='restore-read':
        with zipfile.ZipFile(req['path']) as z:
            if sum(i.file_size for i in z.infolist())>1024*1024*1024:raise ValueError('Expanded backup is larger than 1 GB.')
            state=json.loads(z.read('state.json'));items=[]
            for info in z.infolist():
                if not re.fullmatch(r'(media|audio-cache)/[a-f0-9]{64}\.[a-z0-9]+',info.filename):continue
                data=z.read(info);parts=info.filename.split('/')
                if parts[0]=='media' and hashlib.sha256(data).hexdigest()!=parts[1].split('.')[0]:raise ValueError('Backup audio checksum failed.')
                items.append(info.filename)
            # Only stage files. The server validates state before committing them.
            stage=Path(req['stage']);stage.mkdir(exist_ok=True,parents=True)
            for name in items:
                target=stage/name;target.parent.mkdir(exist_ok=True);target.write_bytes(z.read(name))
        return {'state':state,'files':items}
    raise ValueError('Unknown operation')
try:
    import contextlib
    req=json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):result=execute(req)
    print(json.dumps({'result':result},ensure_ascii=False))
except Exception as error:
    print(json.dumps({'error':str(error)},ensure_ascii=False));sys.exit(1)
