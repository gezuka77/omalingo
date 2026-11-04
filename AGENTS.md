# Working on Oma Lingo

Read the [development guide](docs/DEVELOPMENT.md) before changing the app and the [release guide](docs/RELEASING.md) before publishing an image.

## Where to edit

- The reader, library, word panel, settings and navigation are in `frontend/`. Edit these sources and run `python scripts/build_frontend.py` to regenerate the committed `app.js` and `index.html`. The source order in the generator is significant.
- `core.js` contains shared state normalization and validation. `server.cjs` routes requests, and `services.cjs` handles persistence, imports and backups. Keep account and study-language scoping in place for all data, job and media routes.
- `auth.cjs` owns account setup, password hashing and sessions. Keep first-run setup available for a fresh volume and keep existing account data compatible across updates.
- Study languages and Piper voice metadata are in `languages.json`. Edit `source-catalog.js`, `shared-source-seeds.json` and `retired-source-ids.json` for shared sources. Follow the [public source policy](docs/SOURCE-CURATION.md).

## Product and data conventions

- Use **Oma Lingo** for the full app name. Use **O/L Words** and **O/L AI** for compact navigation. Check reader and settings changes at desktop, tablet and phone widths.
- Keep the app focused on personal learning. Coins, subscriptions, community and tutor features are outside its scope.
- Preserve user-saved meanings, imported lesson progress, attachments, accounts and playback settings. Use temporary data or a separate Compose project and volume for testing.
- Keep credentials, setup codes, real backups and user data out of Git and the Docker build. Retain HTTPS session protections and explicit choices for paid transcription and speech.
- Keep Actions builds manually triggered. A successful image build and a production deployment are separate steps. Keep site-specific manifests, secrets and deployment controllers in a separate private repository.

## Verify changes

```sh
python scripts/build_frontend.py --check
node --check app.js
node --test tests/auth.test.cjs
docker compose config -q
```

Use Node.js 24 and Python 3.11 or newer. For Docker or runtime dependency changes, also build the image and exercise the affected feature in a temporary container.
