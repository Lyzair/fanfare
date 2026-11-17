# Fanfare — Design Spec

> **Name:** the project is now called **Fanfare**; the companion local voice server is **Fanfare Studio** (decided 2026-11-13). It was first called `sports-caller`; the folders were renamed to `fanfare` and `fanfare-studio` on 2026-11-17.

## Purpose

A free, open-source single web page that clubs use on game day: enter the names of all
players (field and bench, positions optional) and an AI text-to-speech voice announces
them in a friendly, encouraging way. A big score button plays a celebration sound and an
optional scorer callout. Built for friendly club games, not pro stadiums.

## Requirements (from the request)

1. Easy to use, self-explanatory, simple single page.
2. Enter all player names; each player is **field** or **bench**; **positions are opt-in**.
3. An AI text-to-speech model speaks the callouts.
4. Each callout is an **editable text field**; default texts are friendly and encouraging.
5. Optional game sounds for a **score/goal button**.
6. Sound files are **replaceable** by the user.
7. **GDPR:** the static host never processes any user data. All data stays in the browser.
8. Data is **exportable/importable** as a zip (JSON + audio files).
9. Simple theme, **sport dropdown at the top**; football plus other team sports.

## Decisions

- **Sports:** football, handball, basketball, volleyball, field hockey, ice hockey,
  floorball. Each sport has its own accent colour, icon, position list, players-on-field
  count and score word ("Goal", "Basket", "Point").
- **Rosters are per sport.** Switching sport shows that sport's roster; nothing is lost.
- **Languages:** dropdown with German, English, French, Spanish, Italian, Dutch, Polish,
  Turkish, Ukrainian and Arabic (right-to-left), defaulting to the browser language. One
  translation file per language so native speakers can contribute. Each language has its
  own UI text, positions, default callouts and voice.
- **Match fields:** step 1 starts with **Home team** and **Opponent** text fields. They fill
  the `{home}` and `{opponent}` placeholders, so the default texts never need editing —
  for a new game you only change names and the opponent.
- **TTS:** Piper neural voices running fully in the browser (WebAssembly + ONNX).
  Voice model files and all WASM files are **served from the same origin** as the page.
  No cloud TTS, no Web Speech API (Chrome's Web Speech voices may be cloud-backed).
- **Pre-generation:** "Prepare voices" synthesizes every callout ahead of time so playback
  on game day is instant. Clips are cached by `(voiceId, text)`, so editing a text
  produces a fresh clip automatically.
- **Templates:** placeholders `{name}`, `{number}`, `{position}`, `{home}`, `{opponent}`. Square-bracket
  sections `[ ... ]` are dropped when any placeholder inside them is empty, so the
  defaults read naturally when no number/position is set.
- **fussball.de:** there is no public API, widgets can't be read and would leak visitors'
  IP addresses to a third party, and live fetching would need a proxy server. So the app never
  connects to fussball.de. Instead, coaches copy the squad list from their team page and
  paste it in; the parser recognises shirt numbers, position headings, `Last, First` names
  and coach entries. A collapsed "Coming from fussball.de?" hint explains this.
- **Default sounds** (score fanfare, lineup intro jingle) are synthesized in code — no
  third-party audio, no licensing questions. The user can replace each with any audio
  file and reset to default.
- **Storage:** IndexedDB on the device (autosave), plus a "Delete all data on this
  device" button. Nothing is ever sent anywhere.
- **Export format:** `.zip` containing `fanfare.json` (schema version 1),
  `sounds/<slot>.<ext>` for custom sounds, and `speech/<n>.wav` for generated clips.
  WAV, not MP3 (Piper outputs WAV; no encoder dependency).
- **Privacy enforcement:** a Content-Security-Policy meta tag restricting every fetch to
  `'self'`; system fonts only (no Google Fonts); an e2e test asserting no request leaves
  the page origin.
- **Stack:** Vite + TypeScript + Preact (4 kB), fflate (zip), idb-keyval (IndexedDB),
  @mintplex-labs/piper-tts-web (TTS). Vitest + Testing Library + Playwright.
- **License:** MIT.

## Out of scope (v1)

Offline/PWA install, match timer, substitution tracking, languages beyond the ten listed, MP3 export,
Web Speech fallback, any live fussball.de or DFBnet connection.

## Amendments (after this spec was written)

Decisions made during the build that change or extend the text above. The numbers are the rulings
(R..) in the build ledger; where this list and the text above disagree, this list is what was built.

- **Offline / PWA is in scope** (R36, R42, R44, R45): on an https origin a service worker precaches the
  app shell; the voice is kept by the speech library in the browser's private file system, not cached
  twice. "Out of scope: Offline/PWA install" above no longer holds.
- **One exception to "every request goes to the page's own origin"** (R16, R35): the optional local
  voice server. The Content-Security-Policy also allows `http://localhost:*` and `http://127.0.0.1:*`
  in `connect-src`; nothing is sent there before the user connects a server in step 4. Club voice
  recordings go only to that server and are never stored or exported (R29).
- **Guest team** (R33, R39): a team file (names, numbers, positions, hints; no clips or settings)
  shared by one coach and imported by the other; guests are announced first; a second score button.
- **"Say it like…" and ✨ Suggest** (R28, R34): pronunciation hints per name; suggestions for German
  and English voices.
- **In-app help and manuals** (R31, R32): welcome card, "Show me" per step, manuals in ten languages
  without absolute links.
- **Running it yourself** (R36, R40, R43, R48, R52 to R55): `fanfare-local.py`, Docker, reverse-proxy
  examples and the Raspberry Pi appliance.
- **HTTPS on the LAN is opt-in** (R46, R47, R53, R54): plain http by default; HTTPS only after the
  printed risk list is accepted, with a name-constrained local certificate authority.
- **Phone remote** (R38, R49, R50): only with `fanfare-local.py`, no third-party relay; the phone is
  sent only what the soundboard shows.
- **Licences** (R13, R18): project code MIT, provided as is; eSpeak NG inside the phonemizer under
  GPL-3.0-or-later with its corresponding source listed in `public/voices/LICENSES.md`; the Arabic
  voice is included by maintainer decision although its licence is unclear.
- **Every callout is editable** (final review, MF10): the two score callouts have their own text
  fields under "Change the standard texts", next to intro, field and bench.

