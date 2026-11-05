"""Time the supplied transcript against speech; never replace its wording."""
import re, wave, unicodedata, os, json, hashlib, time, math
from pathlib import Path

def map_aligned_words(source_words, aligned_words):
    """Reconcile split/merged word boundaries only; never change transcript text."""
    lexical=lambda value:''.join(c for c in unicodedata.normalize('NFC',value).casefold() if c.isalnum() or c=='_')
    source=[lexical(word) for word in source_words]
    aligned=[(lexical(word),start,end) for word,start,end in aligned_words]
    if ''.join(source)!=''.join(word for word,_,_ in aligned):
        raise ValueError('Aligned words did not match the transcript.')
    spans=[];offset=0
    for word,start,end in aligned:
        if word:spans.append((offset,offset+len(word),start,end))
        offset+=len(word)
    result=[];offset=0;cursor=0
    for word in source:
        end=offset+len(word)
        while cursor<len(spans) and spans[cursor][1]<=offset:cursor+=1
        matches=[];index=cursor
        while index<len(spans) and spans[index][0]<end:
            matches.append(spans[index]);index+=1
        if not matches:raise ValueError('Alignment did not cover the transcript.')
        result.append((min(v[2] for v in matches),max(v[3] for v in matches)))
        offset=end
    return result

def bound_aligned_span(timings, start, end, context_start, context_end):
    """Keep context-padding timestamps inside their transcript's acoustic span."""
    if not all(math.isfinite(v) for v in (start,end,context_start,context_end)) or not 0<=context_start<=start<=end<=context_end:
        raise ValueError('A transcript span could not be aligned reliably. Check that the transcript matches the audio.')
    result=[]
    for begin,finish in timings:
        # Whisper timestamps have 20ms resolution. Padding is useful acoustic
        # context, but must not consume the neighboring recognized word.
        if not all(math.isfinite(v) for v in (begin,finish)) or finish<begin or begin<context_start-0.02 or finish>context_end+0.02:
            raise ValueError('A transcript span could not be aligned reliably. Check that the transcript matches the audio.')
        result.append((min(end,max(start,begin)),min(end,max(start,finish))))
    return result


def _align_audio(paths, texts, model_root):
    import numpy as np
    from faster_whisper import WhisperModel
    from faster_whisper.tokenizer import Tokenizer
    from faster_whisper.audio import pad_or_trim
    from difflib import SequenceMatcher
    model=WhisperModel('base',device='cpu',compute_type='int8',cpu_threads=min(6,max(2,(os.cpu_count() or 2)//2)),download_root=str(model_root))
    tokenizer=Tokenizer(model.hf_tokenizer,model.model.is_multilingual,task='transcribe',language=os.environ.get('OMA_LANGUAGE_CODE','fi'))
    cues=[];char_offset=0;time_offset=0.0
    token_re=re.compile(r"[^\W_]" if os.environ.get("OMA_LANGUAGE_CODE") in ("ja","zh") else r"\w+(?:[-’']\w+)*",re.UNICODE)
    normalize=lambda v:unicodedata.normalize('NFC',v).casefold()
    for path,text in zip(paths,texts):
        with wave.open(str(path),'rb') as f:
            if f.getframerate()!=16000 or f.getnchannels()!=1 or f.getsampwidth()!=2:raise ValueError('Alignment requires normalized original audio.')
            samples=np.frombuffer(f.readframes(f.getnframes()),dtype=np.int16).astype(np.float32)/32768
        # Recognized word timestamps provide acoustic anchors. Only unmatched
        # transcript spans are forced through Whisper's cross-attention aligner.
        recognized,_=model.transcribe(samples,language=os.environ.get('OMA_LANGUAGE_CODE','fi'),word_timestamps=True,vad_filter=True,beam_size=3)
        anchors=[]
        for segment in recognized:
            for word in segment.words or []:
                for part in token_re.finditer(word.word):
                    anchors.append({'text':part.group(),'start':word.start,'end':word.end})
        tokens=list(token_re.finditer(text));timings=[None]*len(tokens)
        matcher=SequenceMatcher(None,[normalize(t.group()) for t in tokens],[normalize(w['text']) for w in anchors],autojunk=False)
        corrections=[]
        for tag,a,b,c,d in matcher.get_opcodes():
            if tag=='equal':
                for i,j in zip(range(a,b),range(c,d)):timings[i]=(anchors[j]['start'],anchors[j]['end'])
            elif a<b:
                if corrections:
                    pa,pb,pc,pd=corrections[-1]
                    group_start=anchors[pc-1]['end'] if pc else 0.0
                    group_end=anchors[d]['start'] if d<len(anchors) else len(samples)/16000
                    if group_end-group_start<=25:
                        corrections[-1]=(pa,b,pc,d);continue
                corrections.append((a,b,c,d))
        for a,b,c,d in corrections:
            span_start=anchors[c-1]['end'] if c else 0.0
            span_end=anchors[d]['start'] if d<len(anchors) else len(samples)/16000
            begin=max(0.0,span_start-0.12);end=min(len(samples)/16000,span_end+0.12)
            if end<=begin or end-begin>30:raise ValueError('A transcript span could not be aligned reliably. Check that the transcript matches the audio.')
            excerpt=text[tokens[a].start():tokens[b-1].end()]
            clip=samples[int(begin*16000):int(end*16000)]
            features=model.feature_extractor(clip);frames=features.shape[-1]
            encoded=model.encode(pad_or_trim(features))
            aligned=model.find_alignment(tokenizer,[tokenizer.encode(' '+excerpt)],encoded,frames)[0]
            mapped=[]
            for word in aligned:
                for part in token_re.finditer(word['word']):mapped.append((normalize(part.group()),begin+word['start'],begin+word['end']))
            mapped_timings=map_aligned_words([t.group() for t in tokens[a:b]],mapped)
            mapped_timings=bound_aligned_span(mapped_timings,span_start,span_end,begin,end)
            for i,timing in zip(range(a,b),mapped_timings):timings[i]=timing
        utf16=lambda n:len(text[:n].encode('utf-16-le'))//2
        timed=[];previous=0.0
        for source,timing in zip(tokens,timings):
            if timing is None:raise ValueError('Alignment did not cover the transcript.')
            begin,end=timing
            if begin<previous-0.15 or end<begin:raise ValueError('The audio alignment was not chronological.')
            begin=max(previous,begin);end=max(begin,end);previous=begin
            timed.append({'text':source.group(),'start':round(time_offset+begin,3),'end':round(time_offset+end,3),'charStart':char_offset+utf16(source.start()),'charEnd':char_offset+utf16(source.end())})
        if not timed or sum(w['end']>w['start'] for w in timed)/len(timed)<0.85:raise ValueError('Too many words could not be timed reliably.')
        for match in re.finditer(r'[^.!?。！？\n]+(?:[.!?。！？]+|(?=\n)|$)',text):
            content=match.group();start=char_offset+utf16(match.start()+len(content)-len(content.lstrip()));end=char_offset+utf16(match.start()+len(content.rstrip()))
            words=[w for w in timed if start<=w['charStart']<end]
            if not words:continue
            cues.append({'text':content.strip(),'start':words[0]['start'],'end':words[-1]['end'],'charStart':start,'charEnd':end,'words':words})
        char_offset+=len(text.encode('utf-16-le'))//2+2;time_offset+=len(samples)/16000
    if not cues:raise ValueError('No timed speech found.')
    return {'text':'\n\n'.join(texts),'cues':cues,'alignmentProvider':'local Whisper forced alignment','alignmentVersion':1}


def align_audio(paths,texts,model_root):
    cache=Path(model_root).parent/'alignment-cache';cache.mkdir(parents=True,exist_ok=True)
    digest=hashlib.sha256(b'oma-alignment-v5-'+os.environ.get('OMA_LANGUAGE_CODE','fi').encode('utf-8'))
    for path,text in zip(paths,texts):
        digest.update(hashlib.sha256(Path(path).read_bytes()).digest());digest.update(text.encode('utf-8'));digest.update(b'\0')
    destination=cache/(digest.hexdigest()+'.json')
    if destination.exists():
        try:return json.loads(destination.read_text(encoding='utf-8'))
        except (ValueError,OSError):pass
    result=_align_audio(paths,texts,model_root)
    temporary=destination.with_suffix('.tmp-'+str(os.getpid()))
    temporary.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8');os.replace(temporary,destination)
    return result
