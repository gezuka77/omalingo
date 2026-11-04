# Administration and recovery

## First launch and accounts

Follow the [Docker setup guide](../DOCKER.md) to start the app. On an empty data volume, open Oma Lingo and choose your administrator display name, username and password. When using the configured HTTPS address, retrieve the one-time setup code from the Docker host.

```sh
docker compose exec -T omalingo cat /var/lib/omalingo/setup-code
```

Paste the code into the first-run form. It is consumed when the first administrator is created. Local setup through the server’s loopback address is also available. Existing installations go straight to sign-in.

The administrator can create users, disable access and reset other users' passwords in **Settings → Account & Users**. Each person can change their own password after signing in. Oma Lingo stores salted password hashes in SQLite.

### Recover a password with Docker access

From a repository checkout on the Docker host, copy the [reset script](../scripts/reset-password.cjs) into the running service and start its private terminal prompt. Run the commands from the active Compose directory and adjust the script's source path if it lives elsewhere.

```sh
docker compose cp ./scripts/reset-password.cjs omalingo:/tmp/reset-password.cjs
docker compose exec omalingo node /tmp/reset-password.cjs
```

The script selects the active administrator by default. To reset a particular account, append its username to the second command. Enter the new password twice in the terminal. The reset invalidates that account's sessions and preserves its library.

## Configure the server

The generic Compose file reads these values from a local `.env` file or the environment.

| Setting | Purpose |
| --- | --- |
| `OMA_IMAGE` | Image tag or digest. Use a reviewed immutable digest in production. |
| `OMA_PORT` | HTTP port in the container and on the host. Default `3222`. |
| `OMA_PUBLIC_ORIGIN` | Exact HTTPS origin, such as `https://learn.example.com`. |
| `OMA_OLLAMA_URL` | Private Ollama base URL reachable from the container. |
| `OMA_ANKI_SERVER_URL` | HTTPS origin of the central vocabulary service; enables central mode. |
| `OMA_ANKI_ACCOUNTS_FILE` | Private backend file mapping authenticated user IDs to personal API tokens; never a shared account token. |
| `OMA_ANKI_CONNECT_URL` | Private AnkiConnect URL reachable from the container. |
| `OMA_ANKI_API_KEY` | Optional AnkiConnect key, if your server requires one. |

The server expects the proxy to preserve the public Host header and to serve HTTPS. The app publishes loopback by default. If the proxy reaches the app over the LAN, restrict that port to the proxy. Keep Ollama and AnkiConnect on a private network. Add OpenAI and OpenRouter keys through each user's **AI & Connections** page.

## Storage and backups

The named volume `omalingo_library` is mounted at `/var/lib/omalingo`. Keep that volume attached when recreating the service. Starting with an empty or different volume opens first-run setup again.

| Data | Where it lives |
| --- | --- |
| Accounts and sessions | `accounts.sqlite` |
| Study languages, preferences and shared source entries | `learning.sqlite` |
| Lessons, words, progress and job records | `oma.sqlite` at each user and language workspace |
| Attachments and generated audio | Workspace `media/` and `audio-cache/` |
| Downloaded voices and alignment models | `voices/` and `models/` |
| Encrypted provider settings | `credentials/` under the installation or user workspace |
| Temporary O/L AI conversation | `temporary-chat.sqlite` |

The first account retains the legacy root workspace. Later users have workspaces in `users/<account-id>/`, and study languages other than Finnish use `languages/<language-code>/` within that workspace.

- **Library ZIP** in **Settings → Backup & Restore** exports the active user's active language state and media. Use this to move lessons, vocabulary and related settings between installations. Recreate accounts and re-enter provider keys on the destination. The ZIP excludes temporary chats.
- **Full-installation backup** copies the entire volume, including account databases and the server key used to encrypt provider credentials. Stop the app for a consistent filesystem copy. Restrict access to this backup as you would to the live volume.

To update a generic install, pull the selected image and recreate the service with the same Compose project and volume. Follow the image promotion guidance in the [release guide](RELEASING.md).

## Troubleshoot

| Symptom | What to check |
| --- | --- |
| New setup appears after an update | The Compose project name, mounted volume and `accounts.sqlite` should match the existing installation. |
| Browser reports an unconfigured hostname | The request Host and HTTPS origin must match `OMA_PUBLIC_ORIGIN`. Check proxy forwarding. |
| Voice is unavailable | Look at **Settings → Languages** for download status. The first download needs access to the Piper voice repository. |
| An import stalls or fails | Check **Imports** for the job's error, then check access to the publisher, transcript track or audio source. |
| Anki or Ollama connection fails | Check the service URL from inside the Docker network and confirm the upstream service is running. |

```sh
docker compose ps
docker compose logs --tail 100 omalingo
curl -fsS http://127.0.0.1:3222/api/health
```

Keep installation-specific proxy and backup procedures in your private deployment documentation.


## Central Anki connections

Set `OMA_ANKI_SERVER_URL` to an HTTPS origin such as `https://anki.example.com`
and `OMA_ANKI_ACCOUNTS_FILE` to a private file in the persistent library, for example
`/var/lib/omalingo/connections/anki-accounts.json`. The file uses this structure;
values below are placeholders, never actual credentials:

```json
{"version":1,"accounts":{"immutable-omalingo-user-id":{"token":"personal-anki-api-token","syncUsername":"personal-anki-username"}}}
```

Use account IDs from the authenticated account registry, not usernames or emails.
Provision each personal collection on the Anki service first and record the mapping
explicitly. Do not reuse one user's API token for another person. Keep the file
mode0600, owned by the app's container UID, and replace it atomically when updating.
No browser route returns API tokens; no app-wide API key is used for central mode.
All study languages of a user use that person's collection, with separate language
tags/decks. Unlinked users see an administrator-link message and cannot access
another user's collection. New accounts are not automatically linked by email.

Central sync exchanges saved words/meanings while retaining O/L notes, encounters,
labels and familiarity. Anki scheduling is kept in Anki; O/L practice retains its
own scheduler. Word deletions are not propagated. On first link or concurrent
meaning edits the central collection wins; local-only meaning changes are sent
when the remote meaning still matches the previous sync. At most100 writes run in
one pass, with remaining edits retried on the next background sync. Existing desktop
mode is unchanged when the central-server URL is absent.

The full library backup must include this private connection file. Keep account
linking separate from a vocabulary export, which must never contain API credentials.
