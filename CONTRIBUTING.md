# Contributing

## Adding a language

1. Copy `src/i18n/en.ts` to `src/i18n/<code>.ts` and translate it. Keep every placeholder
   (`{name}`, `{number}`, `{position}`, `{home}`, `{opponent}`) and every `[ ... ]` section.
   Start the file with `// Translation: machine-assisted — native speakers, please review.`
   if it was not translated by a native speaker.
2. Add the code to `Lang` in `src/domain/model.ts`, and to `LANGS` and the pack table in `src/i18n/index.ts`.
3. Add a voice for it in `src/tts/voices.ts`.
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
   `ESPEAK_VOICES` in `src/tts/phonemize.ts`).
3. Extend the "winners" test in `tests/unit/respell.test.ts` with a few names and the spelling
   you expect among the top 3. These tests run the shipped phonemizer in Node
   (`npm run fetch-assets` once; without the assets they are skipped with a warning).
4. Listen to the suggestions with a real voice of that language and adjust the tables. The
   distance weights live in `src/domain/respell/distance.ts`.
