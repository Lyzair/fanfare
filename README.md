# Fanfare

Fanfare is a single static web page where a sports club enters its players and an in-browser AI voice announces the lineup, like a stadium announcer.

**Privacy promise:** everything runs in your browser. Player data never leaves your device, and the page makes no requests to any origin other than its own: no CDNs, no analytics, no cloud text-to-speech.

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

Copy `dist/` to any static host, including a sub-path. Licensed under MIT.
