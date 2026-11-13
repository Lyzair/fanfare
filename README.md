# Fanfare

Fanfare is a single static web page where a sports club enters its players and an in-browser AI voice announces the lineup, like a stadium announcer.

**Privacy promise:** everything runs in your browser. Player data never leaves your device, and the page makes no requests to any origin other than its own: no CDNs, no analytics, no cloud text-to-speech.

**Live demo:** https://<user>.github.io/<repo>/

## Usage

1. Open the page and enter your team and the opponent.
2. Paste your player list (one per line, e.g. `7 Lea Müller`) and move substitutes to the bench.
3. Tap "Prepare voices" once, before the game, so announcements work without waiting.
4. Tap "Announce lineup", and use the Goal/Point button during the game.

## Privacy

Everything stays on this device. Names and sounds are stored only in this browser and are never sent to any server, not even to the website that hosts this page. Use Export to move your team to another device.

## Build

```sh
npm install
npm run fetch-assets && npm run build
```

## Deploy

Copy `dist/` to any static host, including a sub-path. Run `npm run check:dist` after building to catch absolute paths, external URLs and oversized files.

### Publish your own copy

1. Fork this repository.
2. In your fork, open Settings, then Pages, and set Source to **GitHub Actions**.
3. Push to `main` (or run the "Deploy demo to GitHub Pages" workflow manually). The site appears at `https://<user>.github.io/<repo>/`.

The first run downloads about 660 MB of voices; later runs reuse a cache. As with any web host, GitHub sees ordinary page-request logs; the app itself never sends names, sounds or settings anywhere.

## Third-party licences

- **Project code:** MIT, provided as is, without warranty (see `LICENSE`).
- **Voices:** per [`public/voices/LICENSES.md`](public/voices/LICENSES.md): CC0, public domain, or CC BY 4.0 with attribution. The Arabic voice's licence is unclear; it is included by maintainer decision.
- **eSpeak NG** (inside the phonemizer WebAssembly): GPL-3.0-or-later. Full text in [`public/licenses/GPL-3.0.txt`](public/licenses/GPL-3.0.txt); corresponding source linked in [`public/voices/LICENSES.md`](public/voices/LICENSES.md#espeak-ng-gpl-30-or-later) (`@diffusionstudio/piper-wasm@1.0.0` and [espeak-ng](https://github.com/espeak-ng/espeak-ng)).
- **ONNX Runtime:** MIT.
- **Other npm dependencies:** under their own licences.
