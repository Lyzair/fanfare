# Developing Fanfare

For people who build, test or publish Fanfare themselves. Using it: [README](../README.md) and the
[manual](manual/README.md). Hosting it: [self-hosting.md](self-hosting.md). Contributing: [CONTRIBUTING.md](../CONTRIBUTING.md).

## Build

```sh
npm ci
npm run build        # downloads the voices first (about 660 MB, once), then builds into dist/
```

## Deploy

Copy `dist/` to any static host, including a sub-path. Run `npm run check:dist` after building to catch absolute paths, external URLs and oversized files.

## Publish your own copy

1. Fork this repository.
2. In your fork, open Settings, then Pages, and set Source to **GitHub Actions**.
3. Push to `main` (or run the "Deploy demo to GitHub Pages" workflow manually). The site appears at `https://<user>.github.io/<repo>/`.

The first run downloads about 660 MB of voices; later runs reuse a cache. As with any web host, GitHub sees ordinary page-request logs; the app itself never sends names, sounds or settings anywhere.

## Local server and packages

```sh
npm run build && npm run serve:local        # http://localhost:8080 (8081..8099 if busy)
npm run serve:local -- --lan                # phones on the same Wi-Fi, over plain http (--https: optional, with risks)
npm run package:local -- --voices every     # release/fanfare-<version>-{all,none,<lang>}.zip/.tar.gz
```

What the local server does, its options and its security rules: [self-hosting.md, "Laptop with fanfare-local"](self-hosting.md#laptop-with-fanfare-local).

## Releases

Push a tag `v<version>` that matches `package.json` (`.github/workflows/release.yml`): it runs the tests, builds the
packages (all voices, no voices, one per language; `.zip` and `.tar.gz`) and `SHA256SUMS`, creates the GitHub release
(or adds to an existing one) and publishes the image `ghcr.io/lyzair/fanfare` for amd64, arm64 and arm/v7.

## Tests

- `npm test` (unit), `npx tsc --noEmit`, `npm run build && npm run check:dist && npm run test:e2e` (browser).
- `npm run test:py` (Python), `npm run build && npm run test:e2e:local` (the e2e suite against `fanfare-local.py`).
- Hosting and Docker: [self-hosting.md, "Tests"](self-hosting.md#tests).

## Third-party licences

- **Project code:** MIT, provided as is, without warranty (see `LICENSE`).
- **Voices:** per [`public/voices/LICENSES.md`](../public/voices/LICENSES.md): CC0, public domain, or CC BY 4.0 with attribution. The Arabic voice's licence is unclear; it is included by maintainer decision.
- **eSpeak NG** (inside the phonemizer WebAssembly): GPL-3.0-or-later. Full text in [`public/licenses/GPL-3.0.txt`](../public/licenses/GPL-3.0.txt); the exact corresponding source (package, commit and eSpeak NG revisions) is listed in [`public/voices/LICENSES.md`](../public/voices/LICENSES.md#espeak-ng-gpl-30-or-later).
- **ONNX Runtime:** MIT.
- **qrcode-generator** (the QR code for the phone remote, bundled and generated locally): MIT, © Kazuhiko Arase.
- **Other bundled libraries** (Preact, fflate, piper-tts-web: MIT; idb-keyval: Apache-2.0): their copyright and permission notices are shipped with the app in [`public/licenses/THIRD-PARTY-NOTICES.txt`](../public/licenses/THIRD-PARTY-NOTICES.txt). In the app, step 5 links to the licence overview.
