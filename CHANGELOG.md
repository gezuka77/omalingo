# Changelog

## 0.2.2 — 2026-11-04

### Fixed

- Preserve the page reader between generated speech sentences to prevent mobile scroll jumps.
- Keep visible text stable during audio follow and let touch or wheel scrolling take priority.
- Restore the active generated-speech sentence highlight from the beginning and after reader redraws.

## [Unreleased]

## [0.2.1] - 2026-11-04

### Added

- Display the running release version in Settings, the bottom-left sidebar and the health endpoint, all derived from VERSION.

### Fixed

- Numbered image builds also publish the matching GitHub Release and changelog notes.
- Reuse the pronunciation audio element and prepare playback during the user's tap before waiting for generated speech, improving iPhone browser playback.
- Show a clear **Play audio** action when the browser blocks delayed playback, without interrupting editing dialogs or losing prepared speech.
- Ignore stale playback requests after switching words or lessons and preserve desktop playback behavior.

## [0.2.0] - 2026-11-04

### Added

- A public source distribution with site-specific configuration and private history kept separately.
- Direct central Anki server support in Settings → Anki; no running desktop or AnkiConnect add-on is needed in this mode.
- Separate connections for each authenticated user, linked by an administrator using immutable account IDs and private per-user API tokens.
- Vocabulary exchange with other apps through the user's central collection, including retries without duplicate cards and central collection precedence for concurrent meaning edits.
- Connection status and guidance for native Anki clients while preserving existing desktop AnkiConnect installations.

### Data and compatibility

- Existing accounts, libraries, saved context, notes, familiarity and practice progress are preserved. No volume reset or automatic client collection migration.
- Central mode syncs words and meanings. Anki review history syncs between Anki clients; O/L retains its own practice scheduling. Deletions are not propagated.
- Each additional user requires their own provisioned Anki account and explicit administrator link. Tokens stay on the server and are never returned to the browser.

## [0.1.0] - 2026-11-04

### Added

- First numbered Docker release, with a version tag and a source-commit tag in GitHub Container Registry.
- Administrator setup through the HTTPS domain using a one-time code from the Docker host. The administrator chooses the username and password.
- Repository documentation, editable frontend sources, a reproducible frontend build and account setup tests.

### Existing installations

- Container replacements reuse the `omalingo_library` volume. Existing administrators keep their usernames and passwords.
- Production deployments can pin an immutable image digest independently of image builds.
