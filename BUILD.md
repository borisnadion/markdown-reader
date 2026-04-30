# Build and Install Locally

This guide builds the Electron markdown viewer locally on macOS and copies the generated `.app` bundle into `/Applications`.

## Prerequisites

- macOS
- Node.js 20 or newer
- npm

Check your versions:

```sh
node --version
npm --version
```

## Install Dependencies

From the repository root:

```sh
npm install
```

## Run in Development

```sh
npm run dev
```

This starts Vite for the renderer and launches Electron against the local dev server.

## Build the Renderer

```sh
npm run build
```

The compiled renderer output is written to `dist/`.

## Package the macOS App

```sh
npm run dist:mac
```

This creates an unpacked local app bundle at:

```text
release/mac/Markdown Reader.app
```

## Copy to Applications

Close the app if it is already running, then copy the packaged bundle:

```sh
ditto "release/mac/Markdown Reader.app" "/Applications/Markdown Reader.app"
```

Launch it from Finder:

```sh
open "/Applications/Markdown Reader.app"
```

## Replace an Existing Local Copy

If `/Applications/Markdown Reader.app` already exists, remove it first:

```sh
rm -rf "/Applications/Markdown Reader.app"
ditto "release/mac/Markdown Reader.app" "/Applications/Markdown Reader.app"
```

## Notes

- `npm run dist:mac` currently creates an unpacked `.app` for local use, not a signed installer.
- Public distribution will require Developer ID signing, hardened runtime, notarization, and stapling.
- The Quick Look extension is intentionally out of scope for this phase.
