# Oma Lingo on Docker

## Start the app

On the Docker server, open the Oma Lingo folder that contains `compose.yaml`. Run these commands with Docker Engine and the Compose plugin installed.

```sh
docker compose up -d --build
docker compose ps
```

The first build downloads the CPU dependencies for speech, transcription and imports. Piper downloads the selected voice the first time it is needed.

On a fresh installation, Oma Lingo asks you to choose your administrator username and password. You can create the account at `http://127.0.0.1:3222` on the server. From another computer, open an SSH tunnel first. Replace `user@server.example.com` with your usual SSH login.

```sh
ssh -N -L 3222:127.0.0.1:3222 user@server.example.com
```

Leave that terminal open while setting up the account in your browser. The administrator can create additional accounts from **Settings → Account**.

## Use your domain

Set your exact public HTTPS origin in the local `.env` file, then recreate the
service. Replace the example with your own domain; do not commit the file.

```dotenv
OMA_PUBLIC_ORIGIN=https://learn.example.com
```


Configure your HTTPS reverse proxy or tunnel for `learn.example.com`. A proxy running directly on your server can forward to `http://127.0.0.1:3222`. Keep the request's public Host header. A Caddy site on your server can use this configuration.

```caddyfile
learn.example.com {
    reverse_proxy 127.0.0.1:3222
}
```

If the proxy runs in Docker, connect it to a Docker network shared with Oma Lingo and forward to `http://omalingo:3222`. Keep the app port bound to loopback for local access. Once your DNS and HTTPS routing are in place, open [learn.example.com](https://learn.example.com).

If you create the first administrator from the domain, the form also asks for a one-time setup code. Read it from the Docker host and paste it into the form.

```sh
docker compose exec -T omalingo cat /var/lib/omalingo/setup-code
```

Oma Lingo removes the code after the first account is created. Updates reuse the existing accounts in the `omalingo_library` volume.

Use `OMA_PORT` in a local `.env` file if port 3222 is in use. Update the SSH tunnel and proxy upstream to match. `OMA_PUBLIC_ORIGIN` overrides the HTTPS address.

## Build the image on GitHub

On GitHub, open **Actions → Build Oma Lingo Docker image → Run workflow** on the default branch. The workflow builds a Linux x86-64 image and publishes it to GitHub Container Registry. To publish a numbered version, prepare `VERSION` and `CHANGELOG.md` and select **Publish the numbered release from VERSION**. See the [release guide](docs/RELEASING.md).

On your server, run `docker login ghcr.io -u gezuka77`. At the password prompt, enter a GitHub classic personal access token with `read:packages`. In the folder with `compose.yaml`, add this line to `.env`.

```dotenv
OMA_IMAGE=ghcr.io/gezuka77/omalingo-app:latest
```

```sh
docker compose up -d --no-build --pull always
```

Run the workflow and the same command again to update a generic install. The existing Docker volume continues to hold your library. Keep production digest pins and infrastructure settings in a separate private repository. [GitHub Container Registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

## Move or back up your library

For your existing Windows library, export from **Settings → Backup & Restore** for each account and study language you want to move. Create the corresponding accounts and languages on your server, then restore each library and re-enter its API keys in **AI & Connections**. The library backup covers lesson and vocabulary data. Accounts, shared sources and API keys are server settings.

The `omalingo_library` Docker volume holds the server's accounts, libraries, media, local models and encrypted API keys. Keep the entire volume private and include it in Docker backups. Stop the app before making a filesystem copy of the volume so the databases and media are captured together.

To update, run `docker compose up -d --build` again with the newer source. Keep the named volume when replacing containers.

## Connect optional services

Set `OMA_OLLAMA_URL` in `.env` if you already run Ollama on an address the container can reach. For Anki sync, set `OMA_ANKI_CONNECT_URL` to the private AnkiConnect address and set `OMA_ANKI_API_KEY` if AnkiConnect requires it. Anki Desktop must be running with AnkiConnect enabled. Keep both upstream services on your private network.
