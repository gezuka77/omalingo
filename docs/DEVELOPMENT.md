# Develop Oma Lingo

## Requirements and workflow

Use Node.js 24, Python 3.11 or newer and Docker with Compose. The frontend builder uses the Python standard library. The Docker image installs the application’s speech, audio and document dependencies.

```sh
python scripts/build_frontend.py
python scripts/build_frontend.py --check
node --check app.js
node --test tests/auth.test.cjs
docker compose config -q
docker compose build
```

Edit the frontend sources, then regenerate `app.js` and `index.html`. Commit source and generated files together. The GitHub build verifies the bundle before building the image. Keep the current module and stylesheet order when moving or adding source. Several modules extend reader or library behavior defined earlier in the bundle.

## Work on an isolated instance

Use a separate Compose project and an unused port so development starts with its own accounts and data. For a POSIX shell use the following.

```sh
OMA_PORT=3322 docker compose -p omalingo-dev up -d --build
```

In PowerShell set `$env:OMA_PORT = '3322'` before the same `docker compose -p omalingo-dev up -d --build` command. Open `http://127.0.0.1:3322`, create a test administrator and choose a study language. Stop the test instance when finished with `docker compose -p omalingo-dev down`. The test project keeps its separate volume by default.

Check responsive changes in a browser at phone, tablet and desktop widths, including an open reader, selected word, settings and a playing or paused video where relevant. Use a temporary account and a short sample lesson for read/write tests.

## Code map

| Area | Files |
| --- | --- |
| Frontend entry and view behavior | `frontend/ui.js`, `frontend/approved-layout.js`, `frontend/accounts-ui.js`, `frontend/languages-ui.js` |
| Reader and player | `frontend/reader-presentation.js`, `frontend/reader-player.js`, `frontend/reader-dictionaries.js`, `frontend/video-layout.js` |
| Discovery and imports | `frontend/library-discovery.js`, `frontend/import-wizard.js`, `frontend/import-progress.js`, `frontend/transcript-options.js` |
| Vocabulary, playlists and settings | `frontend/parity-vocabulary.js`, `frontend/playlists-view.js`, `frontend/settings-view.js`, `frontend/anki-ui.js` |
| Shared vocabulary and lesson state | `core.js` |
| HTTP routing and workspace scoping | `server.cjs`, `auth.cjs`, `learning.cjs` |
| SQLite persistence, imports, backups and job state | `services.cjs`, `import-identity.cjs` |
| File and feed processing, media transcription and alignment | `content_tools.py`, `feed_tools.py`, `article_extract.py`, `youtube-source.cjs`, `youtube_captions.py`, `audio_alignment.py` |
| Speech and AI providers | `local-voices.cjs`, `piper_worker.py`, `openai-service.cjs`, `openai-voice.cjs`, `openrouter-connection.cjs`, `chat.cjs` |
| Anki integration | `anki-sync.cjs` |
| Supported languages and shared public sources | `languages.json`, `source-catalog.js`, `shared-source-seeds.json`, `retired-source-ids.json` |
| Packaging and release | `Dockerfile`, `compose.yaml`, `.github/workflows/docker.yml` |

## Data and request boundaries

The browser loads the app and backend from the same origin. The server validates the request Host and Origin, then identifies the user via its session cookie. Services and media resolve to the active account and language workspace. State writes include the expected revision and account and language context, which guard against stale saves and account switches in another tab.

Long-running imports are stored as SQLite jobs. Keep network work and model downloads outside transaction boundaries. Preserve transcript history, media identity and saved vocabulary when changing lesson text or retrying imports.

When adding a service, keep its provider keys and model settings separate from transcription settings. Protect newly created state paths and serve only the assets or media intended for that account. Use the app's state and credential APIs rather than putting provider keys into frontend code.

## Release

Run the checks above, update `VERSION` and `CHANGELOG.md` for a numbered release, then follow [Releasing](RELEASING.md). For repository conventions, read [AGENTS.md](../AGENTS.md).
