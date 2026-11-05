# Changelog

## [0.2.8] - 2026-11-05

### Added

- Browse categories, select a publisher and see its latest 10 items, with refresh and clear source access labels.
- Add Finnish national and entertainment newspaper headlines, plus city and local-paper feeds for Espoo, Vantaa and Helsinki. Newspaper headlines open on their publisher’s site.

### Fixed

- Refresh source previews after ten minutes and keep sports, entertainment and local-news publishers in their matching categories.

### Data and compatibility

- Existing accounts, interests, followed sources, lessons and playback settings remain compatible. No migration is required.
- Newspaper headline sources open articles on the publisher’s site; public city news remains available for direct import.

## [0.2.7] - 2026-11-05

### Fixed

- Show the full language source catalog on Discover regardless of interests, follows or successful lesson previews. Include feed publishers in Browse all sources.
- Suppress the settings panel outline after mobile section navigation while retaining focus indicators on controls.

### Data and compatibility

- Existing accounts, interests, followed sources, lessons and playback settings are preserved. No migration is required.

## [0.2.6] - 2026-11-05

### Fixed

- Keep the mobile reader’s original source and bottom content reachable without overscrolling, in page and sentence views.
- Close the mobile settings selector after a choice instead of focusing and reopening it.

### Data and compatibility

- Existing accounts, lessons, translations and playback settings are preserved. No migration is required.

## [0.2.5] - 2026-11-05

### Added

- Set the default translator in Settings → Translation and compare current-sentence samples from the reader menu before choosing a translator for that lesson.
- Keep translation progress inline and match app dialogs and notices to the reader theme.

### Fixed

- Start mobile audio-follow scrolling before speech reaches the bottom lines, while preserving manual scrolling priority.
- Translate only the current sentence in sentence view; cache each source sentence separately and keep full lesson translations for page view.

### Data and compatibility

- Existing accounts, lessons, saved meanings, translations and playback settings remain compatible. No migration is required.
- OpenAI translations and previews use the saved API connection and incur usage charges only when selected.

## [0.2.4] - 2026-11-05

### Fixed

- Keep the sidebar fox at the bottom left with the version directly beneath it.
- Prepare missing local translation models on first use and report actionable download errors; map Traditional Chinese to the Argos Chinese model.
- Stop repeating the interest onboarding prompt after topics have been selected for a study language.
- Reduce the mobile reader header to the lesson title and start YouTube video collapsed with a Show video control.

### Data and compatibility

- Existing accounts, lessons, saved meanings and playback settings are preserved. No migration is required.
- The first local translation needs internet access to download its free model; later translations run locally.

## [0.2.3] - 2026-11-05

### Added

- Attach an exact-image manifest to numbered releases so external deployment controllers can verify and consume published builds automatically.

## [0.2.2] - 2026-11-04

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
- Direct central Anki server support in Settings â†’ Anki; no running desktop or AnkiConnect add-on is needed in this mode.
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
