import os
"""Choose caption tracks without substituting automatic captions for a publisher track."""
def available_tracks(info):
    tracks=[]
    for mode,key in [('publisher','subtitles'),('automatic','automatic_captions')]:
        for language,formats in (info.get(key) or {}).items():
            vtt=next((f for f in formats if f.get('ext')=='vtt'),None)
            if not vtt:continue
            # YouTube exposes machine translations as additional automatic tracks.
            from urllib.parse import urlparse,parse_qs
            translated=bool(parse_qs(urlparse(vtt.get('url','')).query).get('tlang'))
            if translated:continue
            tracks.append({'source':mode,'language':language,'name':vtt.get('name') or language,
                           'finnish':language==os.environ.get('OMA_LANGUAGE_CODE','fi') or language.startswith(os.environ.get('OMA_LANGUAGE_CODE','fi')+'-')})
    return {'tracks':tracks,'title':info.get('title','')}

def select_track(info, mode='available'):
    if mode not in ('publisher','automatic','available'):
        raise ValueError('Choose publisher captions or YouTube automatic captions.')
    for automatic in ([False,True] if mode=='available' else [mode=='automatic']):
        tracks=info.get('automatic_captions' if automatic else 'subtitles') or {}
        preferred=next((key for key in ('zh-Hant','zh-TW','zh-HK') if key in tracks),None) if os.environ.get('OMA_STUDY_LANGUAGE_CODE')=='zh-Hant' else None
        language=preferred or next((key for key in tracks if key==os.environ.get('OMA_LANGUAGE_CODE','fi')),None) or next((key for key in tracks if key.startswith(os.environ.get('OMA_LANGUAGE_CODE','fi')+'-')),None)
        if language:
            track=next((item for item in tracks[language] if item.get('ext')=='vtt'),None)
            if track:return track,automatic
    name='publisher-provided '+os.environ.get('OMA_LANGUAGE_NAME','Finnish')+' captions' if mode=='publisher' else os.environ.get('OMA_LANGUAGE_NAME','Finnish')+' automatic captions' if mode=='automatic' else os.environ.get('OMA_LANGUAGE_NAME','Finnish')+' captions'
    raise ValueError('This video exposes no '+name+'. Choose another transcript source or upload a subtitle file.')

def caption_result(info,url,parsed,automatic):
    if not parsed.get('text','').strip() or not parsed.get('cues'):
        raise ValueError('The captions contain no readable text.')
    offset=0
    for cue in parsed['cues']:
        cue['charStart']=offset
        offset+=len(cue['text'].encode('utf-16-le'))//2
        cue['charEnd']=offset
        offset+=1
    provider='YouTube automatic captions' if automatic else 'YouTube publisher captions'
    return {**parsed,'title':info.get('title','YouTube lesson'),'sourceUrl':url,'youtubeId':info.get('id'),'publisher':info.get('channel'),'imageUrl':info.get('thumbnail',''),'automaticCaptions':automatic,'captionSource':'automatic' if automatic else 'publisher','transcriptProvider':provider,'provider':provider,'alignmentVersion':1,'alignmentProvider':'YouTube caption timings','timingNotice':'Original caption timings; words highlight together within each caption.','language':os.environ.get('OMA_LANGUAGE_CODE','fi'),'chapters':[]}
