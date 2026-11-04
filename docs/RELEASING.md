# Release Oma Lingo

## Prepare a numbered version

1. Update `VERSION` with the next `MAJOR.MINOR.PATCH` number. Use a patch for fixes and a minor for compatible new functionality. Plan compatibility and migration for major changes.
2. Add a matching section in [CHANGELOG.md](../CHANGELOG.md). Describe changes to the app, upgrade requirements and any data migration users need to know about.
3. Regenerate the frontend bundles if needed, run the [development checks](DEVELOPMENT.md), and land the changes on the default branch.
4. Open **Actions → Build Oma Lingo Docker image → Run workflow** on the default branch. Select **Publish the numbered release from VERSION**.

You can start the same manual build from GitHub CLI.

```sh
gh workflow run docker.yml --repo gezuka77/omalingo --ref main -f release=true
```

The workflow checks the frontend bundle and runs the account tests before building a Linux x86-64 image. The numbered publish step refuses to reuse an existing version tag.

## Image tags

| Tag or reference | Use |
| --- | --- |
| `v0.1.0` | Readable numbered release. New numbered releases use a fresh tag. |
| Full Git commit SHA | Image built from the corresponding source revision. |
| `latest` | Most recent successful manual build for convenience. |
| `@sha256:…` | Exact registry image content. Use the digest for production. |

With the numbered release option cleared, the manual workflow still publishes the source revision tag and `latest`. Images carry OCI labels for repository source, source revision and version. Check the completed Actions run and the package tags to confirm the image was published.

## Promote a deployment

After testing the image, record its immutable registry digest and source revision
in your private deployment configuration. Back up the complete persistent volume
before changing versions and retain the previous image and consistent data backup
for recovery. Deployment schedules, host addresses, credentials and infrastructure
controllers belong outside this public repository.
