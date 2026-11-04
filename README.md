# Oma Lingo

Oma Lingo is a private, self-hosted language-learning app. Import a short reading, video or podcast, follow along with its audio, and save words and phrases in context. Each account has its own library and learning progress.

The app includes Finnish, English, Hungarian, Traditional Chinese and Japanese. It works in a desktop, tablet or phone browser. Piper runs generated speech on the server, and optional connections add AI assistance, transcription and Anki sync.

## Run with Docker

On a Linux Docker host with Compose installed, run this from the repository root.

```sh
docker compose up -d --build
docker compose ps
```

Open `http://127.0.0.1:3222` on the host or through an SSH tunnel. On the first visit, choose the administrator username and password. For an HTTPS domain, the first-run form also asks for a code read from the Docker host. After setup, users sign in with the accounts the administrator creates.

The Docker volume `omalingo_library` stores accounts, libraries, media, models and connection settings across image updates.

## Documentation

| Guide | What it covers |
| --- | --- |
| [User guide](docs/USER-GUIDE.md) | Finding and importing material, reading, listening, vocabulary, playlists, AI and Anki |
| [Docker setup](DOCKER.md) | Starting the app, first-run setup, HTTPS, image pulls and library migration |
| [Administration and recovery](docs/ADMIN.md) | Accounts, password reset, data paths, backups, upgrades and troubleshooting |
| [Development guide](docs/DEVELOPMENT.md) | Architecture, frontend sources, development and verification |
| [Agent instructions](AGENTS.md) | Repository conventions and verification checklist for future coding agents |
| [Release process](docs/RELEASING.md) | Numbered image builds, tags, changelog and image promotion |
| [Changelog](CHANGELOG.md) | Changes in each numbered Docker release |
| [Public source policy](docs/SOURCE-CURATION.md) | What belongs in the shared learning catalog |
