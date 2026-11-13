# Contributing

## Adding a language

1. Copy `src/i18n/en.ts` to `src/i18n/<code>.ts` and translate it. Keep every placeholder
   (`{name}`, `{number}`, `{position}`, `{home}`, `{opponent}`) and every `[ ... ]` section.
   Start the file with `// Translation: machine-assisted — native speakers, please review.`
   if it was not translated by a native speaker.
2. Add the code to `Lang` in `src/domain/model.ts`, and to `LANGS` and the pack table in `src/i18n/index.ts`.
3. Add a voice for it in `src/tts/voices.ts`.
4. Run `npm test`. The pack-completeness test fails if a key, sport or position is missing.
