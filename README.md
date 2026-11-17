# Fanfare

A stadium announcer for your sports club: enter your players, and a voice announces the lineup,
the goals and the scorers. It runs in your browser; nothing is uploaded.

**Try it:** https://lyzair.github.io/fanfare/

## Download (runs without internet)

Get a package from the [latest release](https://github.com/Lyzair/fanfare/releases/latest), unpack it and
double-click `start-fanfare` (needs Python 3.9 or newer).

- `fanfare-<version>-de`, `-en`, `-fr`, …: your language's voice only (about 100–150 MB). Most clubs want this.
- `fanfare-<version>-all`: every voice (about 700 MB).
- `fanfare-<version>-none`: no voices, for updating an existing folder (see `README-local.txt` inside).

Each comes as `.zip` and `.tar.gz`. With Docker: `docker run -d -p 127.0.0.1:8080:8080 ghcr.io/lyzair/fanfare:1`,
then open http://localhost:8080.

## How to use it

1. Enter your team and the opponent.
2. Paste your player list (one per line, e.g. `7 Lea Müller`) and move substitutes to the bench.
3. Before the game, tap **Prepare voices** once.
4. Tap **Announce lineup**, and use the **Goal** button during the game.

Also: announce the guest team too, fix how a name is pronounced, edit every text, use it offline, move everything
to another device, use a phone as a remote, and better voices with [Fanfare Studio](https://github.com/Lyzair/fanfare-studio).
The **[manual](docs/manual/README.md)** (in ten languages, also in the app) explains each step.

## Privacy

Names and sounds stay in your browser on this device. The page contacts no other server: no analytics, no cloud
voices. The only optional exception is a voice server you run yourself on your own computer.

## More

- [Hosting it yourself](docs/self-hosting.md): laptop without internet and the phone remote, Docker, Raspberry Pi, reverse proxies.
- [Fanfare Studio, the local voice server](docs/local-voice-server.md): how Fanfare talks to it.
- [Developing Fanfare](docs/development.md): build, tests, releases, publishing your own copy.
- [Contributing](CONTRIBUTING.md): adding a language or pronunciation suggestions.

## Licence

MIT, provided as is (`LICENSE`). The voices and bundled software have their own licences, among them eSpeak NG under
GPL-3.0-or-later: see [`public/voices/LICENSES.md`](public/voices/LICENSES.md) and the
[full list](docs/development.md#third-party-licences).
