# Sports Caller

Sports Caller is a single static web page where a sports club enters its players and an in-browser AI voice announces the lineup, like a stadium announcer.

**Privacy promise:** everything runs in your browser. Player data never leaves your device, and the page makes no requests to any origin other than its own: no CDNs, no analytics, no cloud text-to-speech.

## Build

```sh
npm install
npm run fetch-assets && npm run build
```

The output in `dist/` can be served from any static host, including a sub-path. Licensed under MIT.
