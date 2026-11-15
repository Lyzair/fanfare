# Local voice server (prepare at home, play anywhere)

Fanfare can use voices from a high-quality text-to-speech model that runs on **your own computer**.
You generate the clips at home, Fanfare stores them in its speech cache and puts them into the
export zip, and on game day the phone plays them **without** the server.

This document is the protocol Fanfare speaks. The reference implementation is **Fanfare Studio**
(a separate project). Any server that follows this protocol works.

## Workflow

1. Start the voice server on your computer (Fanfare Studio: `fanfare-studio`).
2. In Fanfare, step 4, open **Local voice server (advanced)** and press **Connect**
   (default address `http://127.0.0.1:5123`).
3. Pick a voice from the **On this computer** group of the voice list (ids look like `local:de-high`).
4. Press **Prepare voices** (step 2). Listen to the clips; if one has a stray syllable, press
   **↻ Regenerate** on its row.
5. **Export** (step 5) and import the zip on the phone. On game day the phone plays the cached
   clips; the server is not needed. Clips already in the cache are always played from the cache,
   even if the server is off.

## Rules for the client (Fanfare)

- The only address that works is `http://localhost[:port]` or `http://127.0.0.1[:port]`, with no
  user name, path, query or fragment. The page's Content-Security-Policy allows exactly
  `http://localhost:*` and `http://127.0.0.1:*` besides its own origin, so an `https://` address
  on this computer is blocked by the browser: the server must speak plain http.
- Fanfare never contacts the server before you press **Connect** (or Record/Save/Delete in the
  club-voice dialog, or Prepare/Play with a `local:` voice).
- Every request carries the header `X-Fanfare: 1`.
- Timeouts: voice list 5 s, synthesis 120 s.

## Rules for the server

- Bind to `127.0.0.1` only, never `0.0.0.0`. Do not log request bodies (player names).
- `GET /voices` -> `200 application/json`

  ```json
  [{ "id": "de-high", "lang": "de", "label": "German (high quality)" }]
  ```

  `lang` is one of `de en fr es it nl pl tr uk ar`; entries with another language are ignored.
- `POST /synthesize`, `Content-Type: application/json`, body `{ "text": "...", "voice": "de-high" }`
  -> `200` with `audio/wav` (`audio/mpeg` or `audio/ogg` also work). Errors are `4xx/5xx` with a
  `text/plain` message, which Fanfare shows (unknown voice `404`, empty text `400`, ...).
- Synthesis requests are answered one at a time; a clip may take many seconds on a slow CPU.

### Which websites may use the server (allow-list)

Every website open in your browser can send requests to `127.0.0.1`. To keep unknown websites from
using your voice server (burning CPU, listing or deleting voices), the server must check the
`Origin` header of browser requests:

- Allowed by default: `http://localhost:*` and `http://127.0.0.1:*`. Other origins (for example the
  site where you host Fanfare) must be allowed explicitly. Fanfare Studio: `fanfare-studio allow <origin>`,
  or the prompt it shows once in its terminal.
- An allowed origin is answered with `Access-Control-Allow-Origin: <that origin>` and `Vary: Origin`
  (never `*`). An unknown origin gets `403 text/plain` **without** CORS headers, so the browser does not
  let the page read the answer.
- Requests without an `Origin` header (curl, scripts) are allowed: they do not come from a web page.
- Fanfare sends `X-Fanfare: 1` on every request. This custom header makes the browser send a
  **preflight** (`OPTIONS`) first, so even uploads (`multipart/form-data` is otherwise a "simple" request)
  are never sent by a website the server does not allow. `POST /references` and
  `DELETE /references/{id}` must answer `400` when the header is missing.
- Preflight `OPTIONS` -> `204` with `Access-Control-Allow-Methods: GET, POST, DELETE`,
  `Access-Control-Allow-Headers: Content-Type, X-Fanfare` and `Access-Control-Allow-Private-Network: true`
  (Private Network Access).

When the server answers `403`, or the browser reports a CORS/network failure (it looks the same as a
server that is off), Fanfare shows this website's address and the command to run, for example
`fanfare-studio allow https://club.example`, with a copy button.

## Your club's own announcer voice (optional)

The server may clone a voice from a short recording (Fanfare Studio does, with its Chatterbox backend).
Fanfare records the sample in the browser (about 15 seconds, auto-stop at 20 s) and uploads it
**only** to the configured local server.

- `POST /references`, `multipart/form-data` with the fields
  `audio` (wav/webm/ogg, up to 60 s and 10 MB), `name` (up to 40 characters), `lang` (`de en fr es it nl pl tr ar`; Ukrainian is not supported for club voices) and `consent` (must be `"true"`, otherwise `400`)
  -> `201 application/json` `{ "id": "club-1a2b3c4d", "lang": "de", "label": "...", "warnings": [] }`.
  `warnings` are short notes (for example very quiet) that Fanfare shows after saving. Other errors are
  `text/plain` (`400` unusable audio, `413` too large).
- The new voice then appears in `GET /voices` with an id starting `club-`.
- `DELETE /references/{id}` -> `204`: removes the stored recording and the derived voice (`404` if unknown;
  Fanfare treats that as already deleted).
- The server keeps recordings only on its own disk, never returns the raw audio and never logs it.

Fanfare keeps the recording only in memory while the dialog is open: it is never written to
IndexedDB, the speech cache or the export zip, and it is dropped right after upload. The microphone is
opened only after you press **Record** and is switched off as soon as recording stops.

**Consent and fairness.** A voice is personal data. Record only yourself or someone who agreed that the
voice may be used for your club's announcements (Fanfare asks for a tick before saving), and never
imitate famous people or anyone who has not agreed. Delete a club voice whenever the person asks: the
**🗑** button next to the voice removes it from the server.

## Notes on models, licences and AI marking

- Fanfare Studio, the reference implementation, puts an inaudible watermark into every clip that
  marks it as AI-generated. Do not try to remove it.
- Its Ukrainian voice uses Piper (a GPL-3.0 engine, with eSpeak NG) when that is installed alongside.
- Many high-quality voice models have licence restrictions. Check the licence of the model and of each
  voice before you share generated audio outside your club.
