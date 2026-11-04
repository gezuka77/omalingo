"""Extract a public article body, avoiding recommendation cards and feed teasers."""
import json
import re

BODY_SELECTORS = (
    '[itemprop="articleBody"]', '.o-post__body', '.post-body', '.content-body', '.artBody',
    '.article-content', '.article_content', '.article-body', '.articleBody',
    '.article__body', '.entry-content', '.article-text', '#article-body',
    '#article-content', '.content__article-body',
)

def extract_article(raw, url=''):
    from bs4 import BeautifulSoup
    if isinstance(raw, bytes):
        try: raw = raw.decode('utf-8-sig')
        except UnicodeDecodeError: pass
    soup = BeautifulSoup(raw, 'html.parser')
    headline = soup.find('h1')
    title = headline.get_text(' ', strip=True) if headline else soup.title.get_text(' ', strip=True) if soup.title else 'Imported article'
    structured = []
    def visit(value):
        if isinstance(value, list):
            for item in value: visit(item)
        elif isinstance(value, dict):
            types = value.get('@type', [])
            if isinstance(types, str): types = [types]
            if any(t in ('Article', 'NewsArticle', 'BlogPosting', 'ReportageNewsArticle') for t in types):
                body = value.get('articleBody')
                if isinstance(body, str) and body.strip(): structured.append(body)
            for item in value.values():
                if isinstance(item, (list, dict)): visit(item)
    for script in soup.select('script[type="application/ld+json"]'):
        try: visit(json.loads(script.string or script.get_text()))
        except (ValueError, TypeError): pass
    for node in soup(['script','style','nav','header','footer','form','noscript','iframe','aside']): node.decompose()
    # These are nested promotional blocks, not part of the story's paragraphs.
    for node in list(soup.select('.m-articleWidget__wrap, .related-posts, .related-articles, .recommended, .newsletter, .social-share, .advertisement, [role="navigation"]')):
        node.decompose()
    def text_of(node):
        for br in node.find_all('br'): br.replace_with('\n')
        blocks = node.find_all(['p','h2','h3','h4','li','blockquote'], recursive=True)
        pieces = []
        for block in blocks:
            if block.find_parent(['p','li','blockquote']) in blocks: continue
            value = block.get_text(' ', strip=True)
            if value and (not pieces or pieces[-1] != value): pieces.append(value)
        return '\n\n'.join(pieces) if pieces else node.get_text('\n', strip=True)
    candidates = []
    seen = set()
    for selector in BODY_SELECTORS:
        for node in soup.select(selector):
            if id(node) in seen: continue
            seen.add(id(node))
            value = text_of(node)
            if len(value) >= 80: candidates.append((len(value), value, selector))
    if candidates:
        _, text, method = max(candidates, key=lambda item:item[0])
    elif structured:
        text, method = max(structured, key=len), 'structured article body'
    else:
        candidates = []
        for node in soup.find_all('article'):
            classes = ' '.join(node.get('class', [])).lower()
            if any(word in classes for word in ('widget','recommend','related','promo','teaser','card')): continue
            value = text_of(node)
            link_text = sum(len(a.get_text(' ', strip=True)) for a in node.find_all('a'))
            if len(value) >= 160 and link_text < len(value)*.65: candidates.append((len(value)-link_text, value, 'article'))
        if candidates:
            _, text, method = max(candidates, key=lambda item:item[0])
        else:
            node = soup.find('main') or soup.body
            if not node: raise ValueError('The full article body could not be found. Open the original source, or paste the article text you can access.')
            text, method = text_of(node), 'main content'
            links = sum(len(a.get_text(' ', strip=True)) for a in node.find_all('a'))
            if len(text) < 160 or links > len(text)*.65: raise ValueError('Only a short preview was available. Open the original source, or paste the article text you can access.')
    if not text.strip(): raise ValueError('The article contains no readable text.')
    return {'title': title, 'text': text[:2000000], 'sourceUrl': url,
            'extractionMethod': method, 'cues': [], 'chapters': []}
