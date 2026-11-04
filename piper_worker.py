"""Persistent local Finnish speech worker. JSON lines in and out; no network."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'runtime' / 'piper-packages'))
import hashlib
import json
import os
import time
import wave
from piper import PiperVoice
from piper.config import PiperConfig, SynthesisConfig
import re
import numpy as np
import onnxruntime

sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
CACHE_DIR = Path(os.environ.get('OMA_AUDIO_CACHE_DIR', ROOT / 'audio-cache'))
MODEL = Path(os.environ.get('OMA_VOICES_DIR', ROOT / 'voices')) / 'fi_FI-harri-medium.onnx'
session_options = onnxruntime.SessionOptions()
session_options.intra_op_num_threads = 2
session_options.inter_op_num_threads = 1
voices = {}
def load_voice(model_path):
    model_path = str(Path(model_path).resolve())
    if model_path not in voices:
        if len(voices) >= 2:
            voices.pop(next(iter(voices)))
        voices[model_path] = PiperVoice(config=PiperConfig.from_dict(json.loads(Path(model_path + '.json').read_text(encoding='utf-8'))),
            session=onnxruntime.InferenceSession(model_path, sess_options=session_options, providers=['CPUExecutionProvider']))
    return voices[model_path]
if MODEL.is_file() and Path(str(MODEL) + '.json').is_file():
    load_voice(MODEL)
print(json.dumps({'event': 'ready'}), flush=True)
for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        CACHE = Path(request.get('cacheDir') or CACHE_DIR)
        CACHE.mkdir(parents=True, exist_ok=True)
        model_path = request.get('modelPath') or MODEL
        voice = load_voice(model_path)
        voice_id = request.get('voiceId') or 'fi_FI-harri-medium'
        text = request['text'].strip()
        if not text or len(text) > 20000:
            raise ValueError('Use between 1 and 20,000 characters.')
        speed = max(0.5, min(2.0, float(request.get('speed') or 1)))
        spoken = text if re.search(r'[.!?…:;。！？]$', text) else text + '.'
        short = len(text.split()) <= 3
        key = hashlib.sha256(('piper-language-voice-v4\0' + voice_id + '\0' + str(speed) + '\0' + spoken).encode('utf-8')).hexdigest()
        destination = CACHE / (key + '.wav')
        cached = destination.is_file()
        started = time.perf_counter()
        if not cached:
            temporary = CACHE / (key + '.tmp.wav')
            try:
                with wave.open(str(temporary), 'wb') as wav_file:
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2)
                    wav_file.setframerate(voice.config.sample_rate)
                    voice.synthesize_wav(spoken, wav_file, syn_config=SynthesisConfig(length_scale=voice.config.length_scale / speed, noise_scale=0.4, noise_w_scale=0.4, volume=0.85))
                if short:
                    with wave.open(str(temporary), 'rb') as source:
                        params = source.getparams()
                        samples = np.frombuffer(source.readframes(source.getnframes()), dtype=np.int16).astype(np.float64)
                    fade = min(int(params.framerate * .005), len(samples) // 2)
                    if fade:
                        samples[:fade] *= np.linspace(0, 1, fade)
                        samples[-fade:] *= np.linspace(1, 0, fade)
                    padding = np.zeros(int(params.framerate * .08), dtype=np.int16)
                    samples = np.concatenate((padding, samples.astype(np.int16), padding))
                    with wave.open(str(temporary), 'wb') as target:
                        target.setparams(params)
                        target.writeframes(samples.tobytes())
                os.replace(temporary, destination)
            finally:
                temporary.unlink(missing_ok=True)
        with wave.open(str(destination), 'rb') as audio:
            duration = audio.getnframes() / audio.getframerate()
        print(json.dumps({'id': request.get('id'), 'key': key, 'cached': cached,
                          'voiceId': voice_id, 'duration': duration, 'nativeRate': speed, 'generationSeconds': time.perf_counter() - started}), flush=True)
    except Exception as error:
        print(json.dumps({'id': request.get('id'), 'error': str(error)}), flush=True)
