# Fanfare

Fanfare is a single static web page where a sports club enters its players and an in-browser AI voice announces the lineup, like a stadium announcer.

**Privacy promise:** everything runs in your browser. Player data never leaves your device, and the page makes no requests to any origin other than its own: no CDNs, no analytics, no cloud text-to-speech. The one optional exception is a voice server that you run yourself on your own computer (`localhost` / `127.0.0.1` only), contacted only after you connect it in step 4 (see [docs/local-voice-server.md](docs/local-voice-server.md)).

**Live demo:** https://lyzair.github.io/fanfare/

## Download

Run Fanfare on your own computer, without internet: get a package from the [latest release](https://github.com/Lyzair/fanfare/releases/latest), unpack it and double-click `start-fanfare` (Python 3.9+ needed).

- `fanfare-<version>-all`: every voice (about 700 MB).
- `fanfare-<version>-<language>`, e.g. `-de`: only that language's voice (about 100–150 MB).
- `fanfare-<version>-none`: no voices, for updating: unpack it and move the language folders from your old `fanfare/voices/` into the new one (details in `README-local.txt`).

Each comes as `.zip` and `.tar.gz`; the manual is inside (`manual/`). Docker: `docker run -d -p 127.0.0.1:8080:8080 ghcr.io/lyzair/fanfare:1`.

## Usage

1. Open the page and enter your team and the opponent.
2. Paste your player list (one per line, e.g. `7 Lea Müller`) and move substitutes to the bench.
3. Tap "Prepare voices" once, before the game, so announcements work without waiting.
4. Tap "Announce lineup", and use the Goal/Point button during the game.

What else it does (each is explained in the manual):

- **Guest team:** the other coach sends a team file (step 5, "Share our team"); import it in step 1 and both teams are announced, guests first.
- **Say it like… and ✨ Suggest:** fix how the voice says a name without changing how it is shown; Suggest proposes spellings (German and English voices so far).
- **Your own texts:** every announcement and the standard texts, including the score calls, can be edited (step 2).
- **Offline:** on an https address (the demo, or your own host) the page installs itself and works without a network once the voices are prepared.
- **Export, Import, Delete all** (step 5): move your team, settings, sounds and prepared voice clips to another device as one zip file, or remove everything from this device.
- **Phone as remote:** with Fanfare running on a laptop (see below), a phone on the same Wi-Fi is the soundboard and the laptop plays the sound.
- **Local voice server and club voice (advanced):** better voices from Fanfare Studio on your own computer, and your club's own announcer voice, recorded with consent.

**Manual:** an illustrated getting-started guide in ten languages is in [docs/manual/README.md](docs/manual/README.md). The built site includes it too (the "Manual" link in the page header).

## Privacy

Everything stays on this device. Names and sounds are stored only in this browser and are never sent to any server, not even to the website that hosts this page. Use Export to move your team to another device.

## Build

```sh
npm ci
npm run build        # downloads the voices first (about 660 MB, once), then builds into dist/
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
npm run serve:local -- --lan                # phones on the same Wi-Fi, over plain http (add --https for HTTPS: optional, see below)
npm run package:local -- --voices every     # release/fanfare-<version>-{all,none,<lang>}.zip/.tar.gz for people without Node
```

The zip contains the built site, `fanfare-local.py`, `start-fanfare.sh` / `.command` / `.bat` and a `README-local.txt` (English and German). Unzip, double-click the start file, done.

- Default is `127.0.0.1:8080`. If the port is busy the next free one (up to 8099) is used and printed; an explicit `--port N` never falls back.
- `--lan` binds all interfaces and serves plain **http** (phones on the same Wi-Fi can use Fanfare, but cannot use offline mode or the microphone, which need https).
- `--lan --https` is **optional and has risks**. The first time it prints the risks and asks you to type `yes` (without a terminal it needs `--accept-ca-risk`, otherwise it falls back to http). It then creates a private local certificate authority (CA) and a server certificate in `~/.config/fanfare-local/` (`%APPDATA%\fanfare-local\` on Windows, `~/Library/Application Support/fanfare-local/` on macOS), never in the served folder or the zip, using the `openssl` command or the Python `cryptography` package (default port 8443, then 8444..8463). The CA is name-constrained (10/8, 172.16/12, 192.168/16, 100.64/10, 127/8, `localhost` and `*.local` only) and the server certificate is valid 825 days (Apple's limit).
  - Phones that trust the certificate trust everything signed with this laptop's key: limited to local network addresses, but that includes routers, NAS drives and smart-home devices on that Wi-Fi.
  - The key is stored unencrypted on the computer. Anyone with access to it or the user account could create fake certificates for local devices. Only use this on a computer you trust.
  - Remove it when no longer needed: `python3 scripts/fanfare-local.py --forget-ca` (or `start-fanfare --forget-ca`; `--yes` skips the question) and remove the certificate on each phone (Android: Settings > Security > Encryption & credentials > User credentials; iPhone: Settings > General > VPN & Device Management > profile > Remove).
  - Simpler alternatives: the online demo on the phone, or Fanfare directly on the laptop with its speakers.
- Phones open `https://<laptop-ip>:8443/trust.html` once to install the CA (Android and iOS steps, the risks, removal steps and the SHA-256 fingerprint to compare with the terminal). Only `/fanfare-ca.crt` (certificate, never a key) and `/trust.html` are served for this, and only over HTTPS.
- **Phone as remote ("soundboard mode").** With `--lan`, step 3 of the app on the laptop has **Use a phone as remote**: press **Activate speaker**, scan the QR code with a phone on the same Wi-Fi (or open the address shown), enter the 6-digit code, and the phone becomes a soundboard (goal, scorer, lineup, stop, intro sound). The laptop plays everything; the phone never plays audio. It only works with `fanfare-local.py` (there is no cloud relay, ever); on other hosts the panel just says so. Over plain http the connection is not encrypted, so others on the Wi-Fi could read player names and replay commands they intercept; the app warns about it, and `--https` fixes it (see the risks above). The relay lives in memory only: pairing codes are single-use and expire after 10 minutes (5 wrong tries lock the session), tokens are random and die with the session (End remote, or a new session), at most 3 phones per session, 5 commands per second per phone, only an allowlist of commands is forwarded, and the phone is only sent the names of the players on the field, never numbers, positions or texts. Only the laptop itself can start or end a session: the connection must come from the loopback address and address the server as `localhost`, `127.0.0.1` or `[::1]` on its own port (a name that merely resolves to the laptop, as in DNS rebinding, is refused); there is no secret to leak. A pairing lock after 5 wrong codes is lifted by **New code**, and each phone token may hold at most 2 event streams.
- Apart from that relay (`/remote/...`), the server answers GET and HEAD only, never lists folders, rejects path traversal, sends the same Content-Security-Policy as the page, contacts no other host, and logs only `METHOD /path STATUS` (never tokens, codes or query strings).
- Tests: `npm run test:py` (Python), `npm run build && npm run test:e2e:local` (the e2e suite against `fanfare-local.py`).

## Run Fanfare with Docker

```sh
docker compose up -d --build     # then open http://localhost:8080 (FANFARE_PORT=8090 if 8080 is taken)
FANFARE_IMAGE=ghcr.io/lyzair/fanfare:1 docker compose up -d --no-build   # or the ready-made image, no build
```

Builds the site and serves it with Caddy: plain HTTP on this computer, no access logs. HTTPS for phones
on your LAN is optional and **has risks** (the same name-constrained local certificate authority and risk list as
`fanfare-local --https`; certificates come from `fanfare-local.py --issue-certs`). Optional Fanfare Studio, updating and
removal: [docs/self-hosting.md](docs/self-hosting.md). The phone remote needs `fanfare-local`.

Behind your own reverse proxy (Caddy, Traefik, Nginx Proxy Manager: examples in `deploy/`) or as a **Raspberry Pi club-house
appliance** that serves `http://fanfare.local` and updates itself (`deploy/raspberry-pi/README.md`): see the same document. Images
for amd64, arm64 and arm/v7 are published with every release (`ghcr.io/lyzair/fanfare`) and can be built yourself.

## Third-party licences

- **Project code:** MIT, provided as is, without warranty (see `LICENSE`).
- **Voices:** per [`public/voices/LICENSES.md`](public/voices/LICENSES.md): CC0, public domain, or CC BY 4.0 with attribution. The Arabic voice's licence is unclear; it is included by maintainer decision.
- **eSpeak NG** (inside the phonemizer WebAssembly): GPL-3.0-or-later. Full text in [`public/licenses/GPL-3.0.txt`](public/licenses/GPL-3.0.txt); the exact corresponding source (package, commit and eSpeak NG revisions) is listed in [`public/voices/LICENSES.md`](public/voices/LICENSES.md#espeak-ng-gpl-30-or-later).
- **ONNX Runtime:** MIT.
- **qrcode-generator** (the QR code for the phone remote, bundled and generated locally): MIT, © Kazuhiko Arase.
- **Other bundled libraries** (Preact, fflate, piper-tts-web: MIT; idb-keyval: Apache-2.0): their copyright and permission notices are shipped with the app in [`public/licenses/THIRD-PARTY-NOTICES.txt`](public/licenses/THIRD-PARTY-NOTICES.txt). In the app, step 5 links to the licence overview.
