# Build and Install Locally

This guide builds the Electron markdown viewer locally on macOS and copies the generated `.app` bundle into `/Applications`.

## Prerequisites

- macOS
- Node.js 20 or newer
- npm
- Xcode Command Line Tools with the macOS 26.5 SDK

Check your versions:

```sh
node --version
npm --version
xcrun --sdk macosx --show-sdk-version
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

This builds the renderer, builds the bundled Quick Look Preview extension, and creates an unpacked local app bundle at:

```text
release/mac-arm64/Markdown Reader.app
```

On Intel Macs, Electron Builder may use `release/mac/Markdown Reader.app` instead.

## Install the App and Finder Quick Look Extension

The Finder preview extension is bundled inside the app at:

```text
Markdown Reader.app/Contents/PlugIns/MarkdownQuickLook.appex
```

Close the app if it is already running, then copy the packaged bundle into `/Applications`:

```sh
ditto "release/mac-arm64/Markdown Reader.app" "/Applications/Markdown Reader.app"
```

Ask Launch Services and Quick Look to refresh their extension caches:

```sh
qlmanage -r
qlmanage -r cache
```

Confirm macOS can see the extension:

```sh
pluginkit -m -A -D -v | grep com.markdownreader.app.quicklook-preview
```

Preview a Markdown file through Quick Look:

```sh
qlmanage -p "/path/to/file.md"
```

You can also select a Markdown file in Finder and press Space. The preview follows the system light/dark appearance, renders local images relative to the Markdown file's directory, and blocks remote images.

If the extension does not appear immediately, open System Settings, go to General -> Login Items & Extensions -> Quick Look, and make sure Markdown Reader Quick Look is enabled. Relaunching Finder can also help after replacing a local build:

```sh
killall Finder
```

Launch the app from Finder when checking the Cmd-Tab name and Dock icon:

```sh
open "/Applications/Markdown Reader.app"
```

Use the packaged `/Applications/Markdown Reader.app` for Finder and Quick Look testing. Development mode runs through Electron's development launcher, so macOS may still expose Electron in some system-level UI.

## Replace an Existing Local Copy

If `/Applications/Markdown Reader.app` already exists, remove it first:

```sh
rm -rf "/Applications/Markdown Reader.app"
ditto "release/mac-arm64/Markdown Reader.app" "/Applications/Markdown Reader.app"
```

## Notes

- `npm run quicklook` builds only the local Quick Look extension into `build/quicklook/MarkdownQuickLook.appex`.
- `npm run dist:mac` currently creates an unpacked `.app` for local use, not a signed installer.
- Public distribution will require Developer ID signing, hardened runtime, notarization, and stapling.
- The local Quick Look extension is ad-hoc signed for development. Public distribution should sign the app and the extension with the same Developer ID team.
