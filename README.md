# Fanfare

Fanfare is a single static web page where a sports club enters its players and an in-browser AI voice announces the lineup, like a stadium announcer.

**Privacy promise:** everything runs in your browser. Player data never leaves your device, and the page makes no requests to any origin other than its own: no CDNs, no analytics, no cloud text-to-speech.

**Live demo:** https://<user>.github.io/<repo>/

## Usage

1. Open the page and enter your team and the opponent.
2. Paste your player list (one per line, e.g. `7 Lea Müller`) and move substitutes to the bench.
3. Tap "Prepare voices" once, before the game, so announcements work without waiting.
4. Tap "Announce lineup", and use the Goal/Point button during the game.

**Manual:** an illustrated getting-started guide in ten languages is in [docs/manual/README.md](docs/manual/README.md). The built site includes it too (the "Manual" link in the page header).

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

## Run Fanfare on your own computer

No internet at all? Fanfare also runs from a laptop with a tiny local server (Python 3.9 or newer, nothing else to install):

```sh
npm run build && npm run serve:local        # http://localhost:8080 (8081..8099 if busy)
npm run serve:local -- --lan                # phones on the same Wi-Fi, over HTTPS
npm run package:local                       # release/fanfare-local-<version>.zip for people without Node
```

The zip contains the built site, `fanfare-local.py`, `start-fanfare.sh` / `.command` / `.bat` and a `README-local.txt` (English and German). Unzip, double-click the start file, done.

- Default is `127.0.0.1:8080`. If the port is busy the next free one (up to 8099) is used and printed; an explicit `--port N` never falls back.
- `--lan` binds all interfaces and serves **HTTPS** (default port 8443, then 8444..8463). Phones need HTTPS for offline mode and the microphone. On first run a private local CA and a server certificate are created in `~/.config/fanfare-local/` (`%APPDATA%\fanfare-local\` on Windows, `~/Library/Application Support/fanfare-local/` on macOS), never in the served folder or the zip, using the `openssl` command or the Python `cryptography` package. The CA is name-constrained (private ranges 10/8, 172.16/12, 192.168/16, 100.64/10, 127/8, `localhost` and `*.local` only), and the server certificate is valid 825 days (Apple's limit). Without either, it falls back to plain http and says how to get HTTPS. `--lan --http` forces plain http.
- Phones open `https://<laptop-ip>:8443/trust.html` once to install the CA (Android and iOS steps, with the SHA-256 fingerprint to compare with the terminal). Only `/fanfare-ca.crt` (certificate, never a key) and `/trust.html` are served for this, and only over HTTPS.
- The server answers GET and HEAD only, never lists folders, rejects path traversal, sends the same Content-Security-Policy as the page, contacts no other host, and logs only `METHOD /path STATUS`.
- Tests: `npm run test:py` (Python), `npm run build && npm run test:e2e:local` (the e2e suite against `fanfare-local.py`).

## Third-party licences

- **Project code:** MIT, provided as is, without warranty (see `LICENSE`).
- **Voices:** per [`public/voices/LICENSES.md`](public/voices/LICENSES.md): CC0, public domain, or CC BY 4.0 with attribution. The Arabic voice's licence is unclear; it is included by maintainer decision.
- **eSpeak NG** (inside the phonemizer WebAssembly): GPL-3.0-or-later. Full text in [`public/licenses/GPL-3.0.txt`](public/licenses/GPL-3.0.txt); corresponding source linked in [`public/voices/LICENSES.md`](public/voices/LICENSES.md#espeak-ng-gpl-30-or-later) (`@diffusionstudio/piper-wasm@1.0.0` and [espeak-ng](https://github.com/espeak-ng/espeak-ng)).
- **ONNX Runtime:** MIT.
- **Other npm dependencies:** under their own licences.
