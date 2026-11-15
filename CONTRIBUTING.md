# Contributing

## Adding a language

1. Copy `src/i18n/en.ts` to `src/i18n/<code>.ts` and translate it. Keep every placeholder
   (`{name}`, `{number}`, `{position}`, `{home}`, `{opponent}`) and every `[ ... ]` section.
   Start the file with `// Translation: machine-assisted — native speakers, please review.`
   if it was not translated by a native speaker.
2. Add the code to `Lang` in `src/domain/model.ts`, and to `LANGS` and the pack table in `src/i18n/index.ts`.
3. Add a voice for it in `src/tts/voices.json` (and its licence in `public/voices/LICENSES.md`).
4. Run `npm test`. The pack-completeness test fails if a key, sport or position is missing.

## Adding pronunciation suggestions for a voice language (✨ Suggest)

✨ Suggest turns a name's real pronunciation (eSpeak NG IPA) into spellings the current voice
reads well. Only German and English have rule tables so far; every other voice language shows
"Suggestions are not available for this voice language yet." To add one (say French):

1. Copy `src/domain/respell/de.ts` to `src/domain/respell/fr.ts`. A table maps each eSpeak
   segment (length mark attached, e.g. `aː`; diphthongs and affricates such as `aɪ`, `tʃ` as one
   key) to at most 3 spellings in that language, most likely first. Tone digits map to `''`.
   Include sounds the language lacks (e.g. `ŋ`, `ɕ`, `x`), spelled with the nearest letters.
   Give a few of the alternatives genuinely different sounds, not only different letters: the
   ranking can only pick between candidates that sound different.
2. Register it in `TARGETS` in `src/domain/respell/index.ts`: `fr: { table: fr, espeakVoice: 'fr' }`.
   `espeakVoice` is the eSpeak voice that reads the respelling back (it must be listed in
   `ESPEAK_VOICES` in `src/tts/espeakVoices.ts`).
3. Extend the "winners" test in `tests/unit/respell.test.ts` with a few names and the spelling
   you expect among the top 3. These tests run the shipped phonemizer in Node
   (`npm run fetch-assets` once; without the assets they are skipped with a warning).
4. Listen to the suggestions with a real voice of that language and adjust the tables. The
   distance weights live in `src/domain/respell/distance.ts`.

## Where things are

- `src/domain/`: the data model, announcement templates, the paste parser and the respelling tables. No browser APIs.
- `src/state/`: the reducer (every change to the app state, and `normalizeState` for stored or imported states) and storage in IndexedDB.
- `src/io/`: export and import (zip archive, team file, downloads, reading files).
- `src/audio/`, `src/tts/`: the one audio queue, the default sounds, the in-browser voice, the local voice server client and the cache of speech clips.
- `src/ui/`: one panel per step (`RosterPanel`, `CalloutPanel`, `GamePanel` + `RemotePanel`, `SoundsPanel` + `LocalVoiceSection`, `DataPanel`). Everything a button can play goes through `actions.ts`; panels get the queue, the user's sounds and the last voice error from `usePlayback`.
- `src/remote/`, `src/pwa/`, `src/sw/`, `src/sw.ts`: the phone remote, the offline status and the service worker.
- `src/i18n/`: one language pack per file.
- `scripts/`: build helpers and `fanfare-local.py`, the local server (one standard-library file, on purpose). `deploy/`, `docker/`: hosting examples.

## Before a pull request

Run `npm test`, `npx tsc --noEmit` and `npm run build && npm run check:dist && npm run test:e2e`
(and `npm run test:e2e:local` if you touched `fanfare-local.py` or the phone remote). CI runs the unit,
Python, Docker and hosting tests only; the browser tests are not run there.
