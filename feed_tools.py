"""Public feed discovery and bounded original-audio downloads for Oma."""
import hashlib
import html
import ipaddress
import json
import re
import uuid
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path

MAX_AUDIO_BYTES = 200 * 1024 * 1024
EXTENSIONS = {'mp3', 'm4a', 'wav', 'ogg', 'webm', 'flac', 'mp4', 'aac'}
MIME_EXTENSIONS = {
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
    'audio/ogg': 'ogg', 'application/ogg': 'ogg', 'audio/webm': 'webm',
    'video/webm': 'webm', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
    'video/mp4': 'mp4', 'audio/aac': 'aac', 'audio/x-aac': 'aac',
}


def _url(value, base=''):
    """Only return passive public-web URL syntax; validate DNS before fetching."""
    if not isinstance(value, str) or not value.strip():
        return ''
    value = urllib.parse.urljoin(base, html.unescape(value.strip()))
    try:
        parsed = urllib.parse.urlsplit(value)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            return ''
        if parsed.username or parsed.password or (parsed.port and parsed.port not in (80, 443)):
            return ''
        hostname = parsed.hostname.lower().rstrip('.')
        if hostname == 'localhost' or hostname.endswith(('.localhost', '.local', '.internal')):
            return ''
        try:
            if not ipaddress.ip_address(hostname).is_global:
                return ''
        except ValueError:
            pass
    except ValueError:
        return ''
    return value


class _Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.feeds = []
        self.meta = {}
        self.images = []
        self.title = []
        self.channel = ''
        self._in_title = False
        self._skip = 0
        self.text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style', 'iframe', 'noscript'):
            self._skip += 1
        if tag == 'meta':
            name=(attrs.get('property') or attrs.get('name') or '').lower()
            if name:self.meta[name]=attrs.get('content','')
        if tag == 'img' and attrs.get('src'):self.images.append(attrs['src'])
        if tag == 'title':
            self._in_title = True
        if tag == 'link' and 'alternate' in attrs.get('rel', '').lower().split():
            mime = attrs.get('type', '').lower().split(';')[0]
            if mime in ('application/rss+xml', 'application/atom+xml', 'application/rdf+xml'):
                self.feeds.append(attrs.get('href', ''))
        if tag == 'meta' and attrs.get('itemprop', '').lower() == 'channelid':
            self.channel = attrs.get('content', '')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'iframe', 'noscript') and self._skip:
            self._skip -= 1
        if tag == 'title':
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title.append(data)
        if not self._skip:
            self.text.append(data)


def _plain(value, limit=2000):
    page = _Page()
    page.feed(value or '')
    return re.sub(r'\s+', ' ', ' '.join(page.text)).strip()[:limit]


def _local(tag):
    return tag.rsplit('}', 1)[-1].lower()


def _children(node, name):
    return [child for child in node if _local(child.tag) == name]


def _text(node, names, default=''):
    for name in names:
        children = _children(node, name)
        if children:
            text = ''.join(children[0].itertext()).strip()
            if text:
                return text
    return default


def _date(value):
    if not value:
        return ''
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return value[:100]
    if not parsed.tzinfo:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def _duration(value):
    try:
        parts = [float(part) for part in value.split(':')]
        if len(parts) > 3 or any(part < 0 for part in parts):
            return None
        return round(sum(part * 60 ** i for i, part in enumerate(reversed(parts))), 3)
    except (ValueError, AttributeError):
        return None


def _image(node, base):
    for child in node.iter():
        name = _local(child.tag)
        if name in ('thumbnail', 'image'):
            candidate = child.attrib.get('href') or child.attrib.get('url')
            if not candidate and name == 'image':
                candidate = _text(child, ['url'])
            if _url(candidate, base):
                return _url(candidate, base)
        if (name == 'content' and (child.attrib.get('medium') == 'image' or child.attrib.get('type','').startswith('image/'))) or (name=='enclosure' and child.attrib.get('type','').startswith('image/')):
            if _url(child.attrib.get('url'), base):
                return _url(child.attrib.get('url'), base)
    for child in node.iter():
        if _local(child.tag) in ('description','encoded','summary','content') and child.text:
            page=_Page();page.feed(child.text)
            for candidate in page.images:
                if _url(candidate,base):return _url(candidate,base)
    return ''


def _video_id(value):
    try:
        url = urllib.parse.urlsplit(value)
    except ValueError:
        return ''
    host = (url.hostname or '').lower()
    if host == 'youtu.be':
        candidate = url.path.strip('/').split('/')[0]
    elif host in ('youtube.com', 'www.youtube.com', 'm.youtube.com'):
        candidate = urllib.parse.parse_qs(url.query).get('v', [''])[0]
        if not candidate and url.path.startswith(('/shorts/', '/embed/', '/live/')):
            candidate = url.path.split('/')[2]
    else:
        return ''
    return candidate if re.fullmatch(r'[A-Za-z0-9_-]{11}', candidate) else ''


def _parse_feed(raw, source_url):
    if re.search(br'<!\s*(?:DOCTYPE|ENTITY)\b', raw, re.I):
        raise ValueError('Feeds containing XML document types or entities are not supported.')
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as error:
        raise ValueError('This source did not return a valid RSS or Atom feed.') from error
    root_name = _local(root.tag)
    if root_name not in ('rss', 'feed', 'rdf'):
        raise ValueError('Use an RSS, Atom, podcast feed, or a page that links to one.')
    channel = next((c for c in root if _local(c.tag) == 'channel'), root)
    title = _plain(_text(channel, ['title'], 'Source'), 300)
    feed_image = next((_image(child, source_url) for child in channel
                       if _local(child.tag) in ('image', 'thumbnail')), '')
    entries = _children(channel, 'item') or _children(root, 'entry') or _children(root, 'item')
    items = []
    seen = set()
    for entry in entries[:200]:
        link = ''
        audio = ''
        for child in entry:
            name = _local(child.tag)
            if name == 'link':
                rel = child.attrib.get('rel', 'alternate')
                href = child.attrib.get('href') or (child.text or '')
                if rel in ('alternate', '') and not link:
                    link = _url(href, source_url)
                if rel == 'enclosure':
                    mime = child.attrib.get('type', '').split(';')[0].lower()
                    if mime.startswith('audio/') or mime in MIME_EXTENSIONS:
                        audio = _url(href, source_url)
            if name in ('enclosure', 'content'):
                mime = child.attrib.get('type', '').split(';')[0].lower()
                candidate = child.attrib.get('url', '')
                suffix = urllib.parse.urlsplit(candidate).path.rsplit('.', 1)[-1].lower()
                if mime.startswith('audio/') or mime in MIME_EXTENSIONS or suffix in EXTENSIONS:
                    audio = _url(candidate, source_url) or audio
        video = _text(entry, ['videoid']) or _video_id(link)
        if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video or ''):
            video = ''
        if video and not link:
            link = 'https://www.youtube.com/watch?v=' + video
        if not link:
            link = audio
        if not link or link in seen:
            continue
        seen.add(link)
        summary = _plain(_text(entry, ['description', 'summary', 'encoded', 'content']))
        item_id = _text(entry, ['guid', 'id']) or link
        items.append({
            'id': hashlib.sha256((source_url + '\0' + item_id).encode('utf-8')).hexdigest(),
            'title': _plain(_text(entry, ['title'], 'Untitled item'), 500),
            'url': link, 'summary': summary,
            'published': _date(_text(entry, ['pubdate', 'published', 'updated', 'date'])),
            'image': _image(entry, source_url) or feed_image,
            'audioUrl': audio, 'duration': _duration(_text(entry, ['duration'])),
            'youtubeId': video, 'sourceTitle': title,
            'kind': 'video' if video else 'podcast' if audio else 'article',
        })
        if len(items) >= 50:
            break
    return {'title': title, 'url': source_url, 'items': items}


def read_feed(req, fetch_url, public_url):
    url = _url(req.get('url', ''))
    if not url:
        raise ValueError('Enter a public RSS, podcast, YouTube channel, or news page URL.')
    public_url(url)
    from learning_directories import directory_items
    directory=directory_items(url,fetch_url)
    if directory is not None:return directory
    parsed = urllib.parse.urlsplit(url)
    if parsed.hostname in ('youtube.com', 'www.youtube.com', 'm.youtube.com'):
        match = re.search(r'/channel/(UC[A-Za-z0-9_-]{20,30})(?:/|$)', parsed.path)
        if match:
            url = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + match.group(1)
    for _ in range(3):
        raw, mime, resolved = fetch_url(url)
        if len(raw) > 20 * 1024 * 1024:
            raise ValueError('Feed exceeds the 20 MB limit.')
        is_html = 'html' in mime.lower() or re.match(br'\s*(?:<!doctype\s+html|<html)', raw, re.I)
        if not is_html:
            return _parse_feed(raw, resolved)
        page = _Page()
        decoded = raw.decode('utf-8', errors='replace')
        page.feed(decoded)
        host = urllib.parse.urlsplit(resolved).hostname
        if host in ('youtube.com', 'www.youtube.com', 'm.youtube.com'):
            channel = page.channel
            if not channel:
                match = re.search(r'"(?:channelId|externalId)"\s*:\s*"(UC[A-Za-z0-9_-]{20,30})"', decoded)
                channel = match.group(1) if match else ''
            if re.fullmatch(r'UC[A-Za-z0-9_-]{20,30}', channel or ''):
                url = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channel
                public_url(url)
                continue
        discovered = [_url(value, resolved) for value in page.feeds]
        discovered = [value for value in discovered if value]
        if not discovered:
            raise ValueError('No RSS or Atom feed was found on this page. Add its feed URL directly.')
        url = discovered[0]
        public_url(url)
    raise ValueError('Feed discovery redirected too many times. Add the feed URL directly.')


def download_audio(req, fetch_url, public_url, data_dir):
    """Stream audio separately from the document importer's 20 MB fetch limit."""
    import requests
    url = _url(req.get('url', ''))
    if not url:
        raise ValueError('Enter a public audio URL.')
    data_dir = Path(data_dir)
    (data_dir / 'jobs').mkdir(parents=True, exist_ok=True)
    (data_dir / 'media').mkdir(parents=True, exist_ok=True)
    temporary = data_dir / 'jobs' / ('audio-url-' + uuid.uuid4().hex + '.download')
    try:
        for _ in range(6):
            public_url(url)
            with requests.get(url, headers={'User-Agent': 'OmaPersonalReader/2.0 (personal language study)'},
                              timeout=(15, 30), allow_redirects=False, stream=True) as response:
                if response.is_redirect:
                    url = _url(response.headers.get('Location', ''), url)
                    if not url:
                        raise ValueError('Audio redirected to an unsupported URL.')
                    continue
                response.raise_for_status()
                mime = response.headers.get('Content-Type', '').split(';')[0].strip().lower()
                extension = urllib.parse.urlsplit(url).path.rsplit('.', 1)[-1].lower()
                if mime in MIME_EXTENSIONS:
                    extension = MIME_EXTENSIONS[mime]
                elif mime not in ('application/octet-stream', 'binary/octet-stream', '') or extension not in EXTENSIONS:
                    raise ValueError('The URL did not return a supported audio file. Use an audio enclosure or direct audio URL.')
                length = response.headers.get('Content-Length', '')
                if length.isdigit() and int(length) > MAX_AUDIO_BYTES:
                    raise ValueError('Audio exceeds the 200 MB import limit.')
                digest = hashlib.sha256()
                size = 0
                with temporary.open('wb') as output:
                    for chunk in response.iter_content(65536):
                        if not chunk:
                            continue
                        size += len(chunk)
                        if size > MAX_AUDIO_BYTES:
                            raise ValueError('Audio exceeds the 200 MB import limit.')
                        digest.update(chunk)
                        output.write(chunk)
                if not size:
                    raise ValueError('The audio file was empty.')
                media = digest.hexdigest() + '.' + extension
                destination = data_dir / 'media' / media
                if destination.exists():
                    temporary.unlink(missing_ok=True)
                else:
                    temporary.replace(destination)
                title = req.get('title') or urllib.parse.unquote(Path(urllib.parse.urlsplit(url).path).stem) or 'Imported audio'
                return {'media': media, 'url': '/media/' + media, 'sourceUrl': url,
                        'title': _plain(str(title), 500), 'bytes': size}
        raise ValueError('Audio redirected too many times.')
    finally:
        temporary.unlink(missing_ok=True)


def source_metadata(req,fetch_url,public_url):
    url=_url(req.get('url',''))
    if not url:raise ValueError('Choose a public article URL.')
    raw,mime,resolved=fetch_url(url)
    if 'html' not in mime.lower():return {'url':resolved,'image':''}
    page=_Page();page.feed(raw.decode('utf-8',errors='replace'))
    image=_url(page.meta.get('og:image:secure_url') or page.meta.get('og:image') or page.meta.get('twitter:image') or '',resolved)
    if image:public_url(image)
    return {'url':resolved,'image':image,'title':page.meta.get('og:title') or ''.join(page.title),'description':_plain(page.meta.get('og:description') or page.meta.get('description') or '')}
