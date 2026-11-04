FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg libgomp1 python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/oma-python

WORKDIR /app
COPY requirements-docker.txt ./
RUN /opt/oma-python/bin/pip install --no-cache-dir --upgrade 'pip>=25,<27' \
    && /opt/oma-python/bin/pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu 'torch>=2.6,<3' \
    && /opt/oma-python/bin/pip install --no-cache-dir -r requirements-docker.txt \
    && /opt/oma-python/bin/pip check \
    && npm install --no-save --package-lock=false --omit=dev --no-audit --no-fund ws@8 \
    && npm cache clean --force

COPY *.cjs *.py app.js core.js source-catalog.js index.html languages.json retired-source-ids.json shared-source-seeds.json ./
RUN install -d -o node -g node -m 0700 /var/lib/omalingo /var/lib/omalingo/credentials

ENV HOME=/var/lib/omalingo \
    OMA_PORT=3222 \
    OMA_BIND_HOST=0.0.0.0 \
    OMA_DATA_DIR=/var/lib/omalingo \
    OMA_CREDENTIALS_DIR=/var/lib/omalingo/credentials \
    OMA_AUDIO_CACHE_DIR=/var/lib/omalingo/audio-cache \
    OMA_VOICES_DIR=/var/lib/omalingo/voices \
    OMA_ALIGNMENT_MODELS=/var/lib/omalingo/models/whisper \
    OMA_PYTHON=/opt/oma-python/bin/python \
    OMA_YOUTUBE_USE_NODE=1 \
    PYTHONDONTWRITEBYTECODE=1

USER node
EXPOSE 3222
CMD ["node", "server.cjs"]
