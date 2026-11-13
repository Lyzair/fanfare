# Fanfare Implementation Plan

> **Name:** the project is now called **Fanfare**; the companion local voice server is **Fanfare Studio** (decided 2026-11-13). File paths of this plan/spec keep the old `sports-caller` slug.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, privacy-first single web page where a club enters its players (typed or pasted from fussball.de) plus home team and opponent, and an in-browser AI voice announces the lineup in one of 10 languages, with a score button, replaceable sounds, zip export/import and a sport switcher.

**Architecture:** Pure-TypeScript domain modules (sports catalog, template rendering, state reducer, archive, WAV synthesis, audio queue, speech cache) with no DOM dependency, wrapped by a thin Preact UI. Piper TTS runs in the browser from same-origin assets; state and audio blobs autosave to IndexedDB. A CSP meta tag plus an e2e network test guarantee no request leaves the page origin.

**Tech Stack:** Vite, TypeScript (strict), Preact, fflate, idb-keyval, @mintplex-labs/piper-tts-web, Vitest + jsdom + @testing-library/preact + fake-indexeddb, Playwright (Chromium).

**Spec:** `docs/superpowers/specs/2026-11-13-sports-caller-design.md`

## Global Constraints

- No runtime request may go to any origin other than the page's own. No CDNs, no Google Fonts, no analytics, no cloud TTS.
- CSP meta tag in `index.html`: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'`.
- Fonts: system font stack only.
- Vite `base: './'` so the build works from any static host sub-path (GitHub/Codeberg Pages).
- Languages: `de, en, fr, es, it, nl, pl, tr, uk, ar`, one pack per file in `src/i18n/`. Every pack has all UI strings, sport names, score words, positions, default templates and at least one Piper voice. The en/de copy is fixed by this plan; the other languages are same-meaning translations, and each such file is headed `// Translation: machine-assisted — native speakers, please review.`
- Arabic is right-to-left: `<html dir>` follows the pack, and CSS uses logical properties (`margin-inline-start`, not `margin-left`).
- Sports: `football`, `handball`, `basketball`, `volleyball`, `fieldhockey`, `icehockey`, `floorball`.
- Template placeholders: `{name}`, `{number}`, `{position}`, `{home}`, `{opponent}`; `[ ... ]` sections are dropped if any placeholder inside renders empty.
- Default templates must fit any team: they mention teams only through `{home}` / `{opponent}` inside `[ ]` sections, so between games a coach changes only names and the Opponent field.
- No live fussball.de connection: no widget, no fetch, no scraping. fussball.de data gets in only by the user's copy and paste.
- Default callouts must be friendly and encouraging — no rankings, no criticism, no "best player".
- Export archive: `fanfare.json` with `"version": 1`, `sounds/<slot>.<ext>`, `speech/<n>.wav`.
- Every file used at runtime (WASM, ONNX voice models, phonemizer data) is copied into `public/` by `scripts/fetch-assets.mjs`; voice files are git-ignored, not committed.
- License: MIT. Every bundled voice must have a license allowing redistribution, recorded in `public/voices/LICENSES.md`.

## Review Focus

1. **Phone autoplay policy (iOS Safari / Android Chrome):** the first tap on any play button must produce sound — `AudioQueue.unlock()` runs synchronously inside the click handler before any `await`. Test in Task 8 and Task 12.
2. **Button mashing / overlapping audio:** pressing Score while the lineup is being announced stops the lineup immediately and plays only the score sequence; never two clips at once. Test in Task 8.
3. **Messy names and pasted squad lists:** umlauts, accents, apostrophes, emoji, blank lines, duplicates, `"7 Max Müller"`, and a whole fussball.de squad list with position headings, `Last, First` names, age columns and coach entries. Trimmed, junk and coaches skipped, duplicates kept as distinct players, numbers and positions picked up, names in `First Last` order. Test in Task 4 and Task 11.
4. **Broken or foreign import file:** a non-zip, a zip without `fanfare.json`, wrong `version`, or a file over 200 MB shows a clear message and leaves current data untouched. Test in Task 7 and Task 14.
5. **Voice model unavailable** (assets missing, slow phone, offline after load): a readable error appears, and score sounds / custom sounds keep working. Test in Task 9 and Task 13.

---

## File Structure

```
index.html                     CSP meta, root div
vite.config.ts                 base './', vitest config (jsdom)
playwright.config.ts           webServer = vite preview
scripts/fetch-assets.mjs       downloads voices + copies ORT/piper wasm into public/
public/voices/LICENSES.md      voice licenses (committed); *.onnx(.json) ignored
src/main.tsx                   mounts <App/>
src/domain/model.ts            types: AppState, Roster, Player, SportId, Lang, SoundSlot
src/domain/sports.ts           SPORTS catalog (positions, colours, score word, templates)
src/i18n/index.ts              LANGS, LanguagePack, getPack, t, detectLang, defaultTemplates
src/i18n/<code>.ts             one language pack per language (de, en, fr, es, it, nl, pl, tr, uk, ar)
src/domain/template.ts         renderTemplate, calloutText
src/domain/roster.ts           parsePlayerLines (typed lists and fussball.de squad pastes)
src/state/reducer.ts           initialState, reducer(Action)
src/state/persist.ts           IndexedDB load/save/clear for state + blobs
src/audio/wav.ts               encodeWav
src/audio/defaultSounds.ts     synthFanfare, synthIntro, defaultSoundBlob
src/audio/queue.ts             AudioQueue
src/tts/voices.ts              VOICES catalog
src/tts/engine.ts              TtsEngine interface + PiperEngine
src/tts/speechCache.ts         SpeechCache
src/io/archive.ts              exportArchive, importArchive, ImportError
src/ui/App.tsx                 layout, store wiring, theme
src/ui/Header.tsx              sport + language dropdowns
src/ui/RosterPanel.tsx         step 1: match (home team, opponent) + players + fussball.de paste help
src/ui/CalloutPanel.tsx        step 2: texts, play, prepare voices, announce lineup
src/ui/GamePanel.tsx           step 3: score button + scorer
src/ui/SoundsPanel.tsx         step 4: voice choice, sounds on/off, replace/reset
src/ui/DataPanel.tsx           step 5: export/import/delete + privacy note
src/ui/styles.css              theme tokens, per-sport accent via [data-sport]
tests/unit/*.test.ts(x)        Vitest
tests/fixtures/                fussballde-kader.txt
CONTRIBUTING.md                how to add a language
tests/e2e/*.spec.ts            Playwright
```

---

### Task 1: Project scaffold with CSP and test tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `.gitignore`, `LICENSE`, `README.md`
- Test: `tests/unit/smoke.test.tsx`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: `npm run dev | build | preview | test | test:e2e | fetch-assets`; `<App/>` default export from `src/ui/App.tsx`.

- [ ] **Step 1:** `git init`, `npm create vite@latest . -- --template preact-ts`, then add dev deps `vitest jsdom @testing-library/preact @testing-library/user-event fake-indexeddb @playwright/test` and deps `fflate idb-keyval @mintplex-labs/piper-tts-web`. Remove template demo assets. `.gitignore`: `node_modules dist public/voices/*.onnx* public/ort public/piper test-results playwright-report`.
- [ ] **Step 2:** Set `base: './'` and `test: { environment: 'jsdom', include: ['tests/unit/**/*.test.ts?(x)'] }` in `vite.config.ts`; strict mode in `tsconfig.json`; add the CSP meta tag from Global Constraints and `<title>Fanfare</title>` to `index.html`. MIT `LICENSE`. README: one paragraph purpose + privacy promise + `npm run fetch-assets && npm run build`.
- [ ] **Step 3: Write tests**

```tsx
// tests/unit/smoke.test.tsx
test('App renders the product name', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fanfare');
});
```
```ts
// tests/e2e/smoke.spec.ts
test('page loads with CSP and no foreign requests', async ({ page, baseURL }) => {
  const foreign: string[] = [];
  page.on('request', r => { if (new URL(r.url()).origin !== new URL(baseURL!).origin) foreign.push(r.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fanfare');
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').count()).toBe(1);
  expect(foreign).toEqual([]);
});
```

- [ ] **Step 4:** Run `npm test` and `npx playwright install chromium && npm run build && npm run test:e2e`. Expected: both FAIL until `App` renders `<h1>Fanfare</h1>`; implement that; both PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "chore: scaffold vite preact app with CSP and test tooling"`

---

### Task 2: Domain model, sports catalog and language packs

**Files:**
- Create: `src/domain/model.ts`, `src/domain/sports.ts`, `src/i18n/index.ts`, `src/i18n/{de,en,fr,es,it,nl,pl,tr,uk,ar}.ts`, `CONTRIBUTING.md`
- Test: `tests/unit/i18n.test.ts`

**Interfaces:**
- Produces:
```ts
type Lang = 'de'|'en'|'fr'|'es'|'it'|'nl'|'pl'|'tr'|'uk'|'ar';
type SportId = 'football'|'handball'|'basketball'|'volleyball'|'fieldhockey'|'icehockey'|'floorball';
type SoundSlot = 'score' | 'intro';
type TemplateKey = 'intro' | 'field' | 'bench' | 'score';
interface Player { id: string; name: string; number: string; position: string; onField: boolean; customText: string | null }
interface Roster { homeTeam: string; opponent: string; showPositions: boolean; players: Player[]; templates: Record<TemplateKey, string> }
interface CustomSound { name: string; mime: string }          // blob stored separately, keyed by slot
interface AppState { version: 1; sport: SportId; lang: Lang; voiceId: string; soundsEnabled: boolean;
                     rosters: Partial<Record<SportId, Roster>>; customSounds: Partial<Record<SoundSlot, CustomSound>> }
interface SportDef { id: SportId; icon: string; accent: string; fieldPlayers: number; positionCount: number }
const SPORTS: Record<SportId, SportDef>;  const SPORT_IDS: SportId[];

// src/i18n/index.ts — en.ts is the reference pack; UiStrings = typeof en.ui
interface LanguagePack {
  code: Lang; nativeName: string; dir: 'ltr' | 'rtl';
  ui: UiStrings;
  sports: Record<SportId, { name: string; scoreWord: string; positions: string[] }>;  // positions in the same order as en
  staffHeadings: string[];                                                            // e.g. de: Trainer, Co-Trainer, Betreuer — used by the paste parser
  templates(sport: SportId): Record<TemplateKey, string>;
}
const LANGS: Lang[];                               // order shown in the dropdown: de, en, fr, es, it, nl, pl, tr, uk, ar
function getPack(lang: Lang): LanguagePack;
function t(lang: Lang, key: keyof UiStrings): string;
function detectLang(preferred: readonly string[]): Lang;   // first supported base code of navigator.languages, else 'en'
function defaultTemplates(sport: SportId, lang: Lang): Record<TemplateKey, string>;
```

- [ ] **Step 1: Write the failing tests**

```ts
test.each(LANGS)('%s pack is complete', lang => {
  const p = getPack(lang), en = getPack('en');
  expect(Object.keys(p.ui).sort()).toEqual(Object.keys(en.ui).sort());
  expect(Object.values(p.ui).every(v => v.trim() !== '')).toBe(true);
  for (const id of SPORT_IDS) {
    expect(p.sports[id].name).toBeTruthy(); expect(p.sports[id].scoreWord).toBeTruthy();
    expect(p.sports[id].positions).toHaveLength(SPORTS[id].positionCount);
    const tpl = p.templates(id);
    expect(tpl.field).toContain('{name}'); expect(tpl.bench).toContain('{name}');
    expect(tpl.intro).toContain('{home}'); expect(tpl.intro).toContain('{opponent}');
    expect(Object.values(tpl).join(' ')).not.toMatch(/\{(?!name\}|number\}|position\}|home\}|opponent\})[^}]*\}/);
  }
});
test('only Arabic is right-to-left', () =>
  expect(LANGS.filter(l => getPack(l).dir === 'rtl')).toEqual(['ar']));
test('detectLang', () => {
  expect(detectLang(['de-AT', 'en'])).toBe('de');
  expect(detectLang(['ja', 'fr-CA'])).toBe('fr');
  expect(detectLang(['ja'])).toBe('en');
});
test('field counts', () => {
  expect(SPORT_IDS.map(id => SPORTS[id].fieldPlayers)).toEqual([11, 7, 5, 6, 11, 6, 6]);
});
test('default score template uses the sport score word', () => {
  expect(defaultTemplates('volleyball', 'en').score).toContain('Point');
  expect(defaultTemplates('football', 'de').score).toContain('Toooor');
});
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/i18n.test.ts` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** Positions (en / de), in this order:
  - football, fieldhockey: Goalkeeper/Torwart, Defence/Abwehr, Midfield/Mittelfeld, Attack/Angriff
  - handball: Goalkeeper/Torwart, Left wing/Linksaußen, Left back/Rückraum links, Centre back/Rückraum Mitte, Right back/Rückraum rechts, Right wing/Rechtsaußen, Pivot/Kreisläufer
  - basketball: Point guard/Aufbauspieler, Shooting guard/Shooting Guard, Small forward/Flügelspieler, Power forward/Power Forward, Center/Center
  - volleyball: Setter/Zuspieler, Outside hitter/Außenangreifer, Opposite/Diagonalangreifer, Middle blocker/Mittelblocker, Libero/Libero
  - icehockey: Goaltender/Torhüter, Defence/Verteidigung, Centre/Center, Wing/Flügel
  - floorball: Goalkeeper/Torhüter, Defence/Verteidigung, Centre/Center, Attack/Angriff

  Score words en/de: Goal/Tor (football, handball, both hockeys, floorball), Basket/Korb, Point/Punkt. Icons: football ⚽, handball 🤾, basketball 🏀, volleyball 🏐, fieldhockey 🏑, icehockey 🏒, floorball 🏑 (told apart by accent colour). Accent colours need ≥ 4.5:1 contrast against white text.

  Default templates — exact copy for en and de (`{score}` is replaced with the sport's score word inside `templates()`; it is not a runtime placeholder; football/de uses `Toooor`):

  | key | en | de |
  |---|---|---|
  | intro | `Hello everyone and welcome[ to today's game against {opponent}]! Here comes the lineup[ of {home}]! Let's have a fair and fun game together!` | `Hallo zusammen und herzlich willkommen[ zum heutigen Spiel gegen {opponent}]! Hier kommt die Aufstellung[ von {home}]! Auf ein faires Spiel mit viel Spaß!` |
  | field | `And now[ on {position}][, number {number}]: {name}! Have fun and give it your all!` | `Und jetzt[ auf der Position {position}][, mit der Nummer {number}]: {name}! Viel Spaß und gib alles!` |
  | bench | `Ready to jump in from the bench: {name}! Great to have you with us!` | `Auf der Bank, bereit zum Einwechseln: {name}! Schön, dass du dabei bist!` |
  | score | `{score}[ for {home}]![ Well done, {name}!] Fantastic, keep it up!` | `{score}[ für {home}]![ Super gemacht, {name}!] Klasse, weiter so!` |

  Other languages (fr, es, it, nl, pl, tr, uk, ar): translate the en pack to the same meaning and friendly tone, keeping every `[ ]` section and placeholder; use the sport's usual local position names. Each of these files starts with `// Translation: machine-assisted — native speakers, please review.` `CONTRIBUTING.md` explains how to add a language: copy `src/i18n/en.ts`, translate it, add the code to `LANGS`, add a voice in `src/tts/voices.ts`, then run `npm test`.
- [ ] **Step 4:** Run the test — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add sports catalog, model types and language packs`

---

### Task 3: Template rendering

**Files:**
- Create: `src/domain/template.ts`
- Test: `tests/unit/template.test.ts`

**Interfaces:**
- Consumes: `Player`, `Roster`, `SportId`, `Lang`, `getPack` (Task 2)
- Produces:
```ts
function renderTemplate(template: string, vars: Record<string, string>): string;
function calloutText(player: Player, roster: Roster): string;      // customText ?? field/bench template
function scoreText(scorer: Player | null, roster: Roster): string;
function introText(roster: Roster): string;
```

- [ ] **Step 1: Write the failing tests**

```ts
test('fills placeholders', () => expect(renderTemplate('Hi {name}!', { name: 'Lea' })).toBe('Hi Lea!'));
test('drops a bracket section whose placeholder is empty', () =>
  expect(renderTemplate('And now[ on {position}][, number {number}]: {name}!', { name: 'Lea', position: '', number: '7' }))
    .toBe('And now, number 7: Lea!'));
test('keeps bracket text without placeholders, removes brackets', () =>
  expect(renderTemplate('Go[ team]!', {})).toBe('Go team!'));
test('unknown placeholders stay literal', () => expect(renderTemplate('{foo} {name}', { name: 'A' })).toBe('{foo} A'));
test('whitespace-only values count as empty', () => expect(renderTemplate('X[ {number}]', { number: '  ' })).toBe('X'));
test('customText wins over template', () => {
  expect(calloutText({ ...player, customText: 'Yay Lea' }, roster)).toBe('Yay Lea');
});
test('bench player uses bench template', () => {
  expect(calloutText({ ...player, onField: false }, roster)).toContain('bench');
});
test('positions hidden => position not spoken', () => {
  expect(calloutText({ ...player, position: 'Goalkeeper' }, { ...roster, showPositions: false })).not.toContain('Goalkeeper');
});
test('score text without scorer or home team', () => {
  expect(scoreText(null, roster)).toBe('Goal! Fantastic, keep it up!');
});
test('intro fills opponent and home', () => {
  expect(introText({ ...roster, homeTeam: 'FC Grün', opponent: 'SV Musterstadt' })).toBe(
    "Hello everyone and welcome to today's game against SV Musterstadt! Here comes the lineup of FC Grün! Let's have a fair and fun game together!");
});
test('intro without match fields still reads naturally', () => {
  expect(introText(roster)).toBe("Hello everyone and welcome! Here comes the lineup! Let's have a fair and fun game together!");
});
```
(`player`/`roster` fixtures: `en` football defaults, `name: 'Lea'`, `onField: true`, empty number/position, empty `homeTeam`/`opponent`.)

- [ ] **Step 2:** Run `npx vitest run tests/unit/template.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Algorithm: first process each `[...]` (non-nested): if any `{key}` inside maps to a known var whose trimmed value is empty → remove the section, else keep its inner text. Then substitute known `{key}`s with trimmed values. Finally collapse double spaces and trim. Vars passed by all three functions: `name`, `number`, `home` (= `roster.homeTeam`), `opponent`, and `position` only when `roster.showPositions`.
- [ ] **Step 4:** Run tests — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add callout template rendering`

---

### Task 4: State reducer and player paste parsing (incl. fussball.de squad lists)

**Files:**
- Create: `src/state/reducer.ts`, `src/domain/roster.ts`, `tests/fixtures/fussballde-kader.txt`
- Test: `tests/unit/reducer.test.ts`, `tests/unit/roster.test.ts`

**Interfaces:**
- Consumes: Task 2 types, `defaultTemplates`, `getPack`
- Produces:
```ts
interface ParsedPlayer { name: string; number: string; position: string }
function parsePlayerLines(text: string, positions: string[], staffHeadings: string[]): ParsedPlayer[];
function initialState(lang?: Lang): AppState;           // sport 'football', voiceId = first VOICES entry of lang (Task 9 provides VOICES; until then a constant)
function currentRoster(s: AppState): Roster;            // creates default roster for s.sport if absent
type Action =
 | { type: 'setSport'; sport: SportId } | { type: 'setLang'; lang: Lang } | { type: 'setVoice'; voiceId: string }
 | { type: 'setMatch'; home?: string; opponent?: string } | { type: 'togglePositions'; on: boolean }
 | { type: 'addPlayers'; text: string; onField: boolean }
 | { type: 'updatePlayer'; id: string; patch: Partial<Omit<Player,'id'>> }
 | { type: 'removePlayer'; id: string } | { type: 'movePlayer'; id: string; delta: -1 | 1 }
 | { type: 'setTemplate'; key: TemplateKey; text: string } | { type: 'resetTemplates' }
 | { type: 'setSoundsEnabled'; on: boolean }
 | { type: 'setCustomSound'; slot: SoundSlot; sound: CustomSound | null }
 | { type: 'replaceAll'; state: AppState };
function reducer(s: AppState, a: Action): AppState;     // pure, never mutates s
```

- [ ] **Step 1: Create the fixture** `tests/fixtures/fussballde-kader.txt`. If the user has supplied a real (anonymised) copy of a fussball.de squad list, use that and adapt the expected values below; otherwise use this approximation:

```
Torwart
1 Müller, Lea
Abwehr
4 Özdemir, Can 19
5 O'Neil, Zoë
Mittelfeld
8 Nowak, Jan
Angriff
9 Ferreira, José
Trainer
Schmidt, Klaus
```

- [ ] **Step 2: Write the failing tests**

```ts
const fb = getPack('de').sports.football.positions, staff = getPack('de').staffHeadings;
test('fussball.de squad paste: headings become positions, names swapped, staff skipped', () => {
  expect(parsePlayerLines(readFixture('fussballde-kader.txt'), fb, staff)).toEqual([
    { name: 'Lea Müller', number: '1', position: 'Torwart' },
    { name: 'Can Özdemir', number: '4', position: 'Abwehr' },
    { name: "Zoë O'Neil", number: '5', position: 'Abwehr' },
    { name: 'Jan Nowak', number: '8', position: 'Mittelfeld' },
    { name: 'José Ferreira', number: '9', position: 'Angriff' }]);
});
test('plain lines: trims, skips blanks, reads leading number', () => {
  expect(parsePlayerLines('  7 Max Müller \n\n#10 Zoë\nJosé 🙂\n  \n', fb, staff)).toEqual([
    { name: 'Max Müller', number: '7', position: '' }, { name: 'Zoë', number: '10', position: '' },
    { name: 'José 🙂', number: '', position: '' }]);
});
test('a single line with commas is a list of names', () =>
  expect(parsePlayerLines('Lea, Tom, Max', fb, staff).map(p => p.name)).toEqual(['Lea', 'Tom', 'Max']));
test('junk lines are skipped', () =>
  expect(parsePlayerLines('https://www.fussball.de/x\n---\n12.10.2026\nLea', fb, staff).map(p => p.name)).toEqual(['Lea']));
test('pasted positions switch "Use positions" on', () => {
  const s = reducer(initialState('de'), { type: 'addPlayers', text: 'Torwart\n1 Lea', onField: true });
  expect(currentRoster(s).showPositions).toBe(true);
});
test('duplicate names become distinct players', () => {
  const s = reducer(initialState('en'), { type: 'addPlayers', text: 'Max\nMax', onField: true });
  const ps = currentRoster(s).players; expect(ps).toHaveLength(2); expect(ps[0].id).not.toBe(ps[1].id);
});
test('rosters are kept per sport', () => {
  let s = reducer(initialState('en'), { type: 'addPlayers', text: 'Lea', onField: true });
  s = reducer(s, { type: 'setSport', sport: 'handball' });
  expect(currentRoster(s).players).toHaveLength(0);
  s = reducer(s, { type: 'setSport', sport: 'football' });
  expect(currentRoster(s).players[0].name).toBe('Lea');
});
test('setMatch updates only the given field', () => { /* setMatch {opponent:'SV X'} keeps homeTeam */ });
test('setLang swaps untouched templates and voice, keeps edited templates', () => {});
test('updatePlayer with empty name is ignored', () => {});
test('reducer does not mutate input', () => { const s = initialState('en'); const f = structuredClone(s); reducer(s, { type: 'setMatch', home: 'X' }); expect(s).toEqual(f); });
test('movePlayer at boundary is a no-op', () => {});
```

- [ ] **Step 3:** Run `npx vitest run tests/unit/reducer.test.ts tests/unit/roster.test.ts` — Expected: FAIL.
- [ ] **Step 4: Implement `parsePlayerLines`** — rules applied in order:
  1. Split on newlines and `;`. If the result is one line containing commas, split it on commas instead.
  2. Trim each line. Drop empty lines, lines without a letter, lines over 80 chars, and lines containing `http`, `www.` or `@`.
  3. Heading lines: a line equal (case-insensitive, trailing `:` ignored) to an entry of `positions` sets the current position for the lines that follow. A line equal to an entry of `staffHeadings` starts skipping lines until the next position heading.
  4. A leading `#?\d{1,3}` followed by whitespace or `.` becomes `number`. Trailing tokens without a letter (`19`, `(23)`, `–`) are removed.
  5. `Last, First` swap: if there are ≥ 2 player lines and every one has exactly one comma, rewrite each as `First Last`.
  6. Cap names at 60 chars.

  Reducer: IDs via `crypto.randomUUID()`. `addPlayers` uses the current sport's positions and the current language's `staffHeadings`, and sets `showPositions = true` if any parsed player has a position. `setLang` compares each template to `defaultTemplates(sport, oldLang)` and only swaps those that match, and switches `voiceId` to the first voice of the new language if the current one doesn't match it.
- [ ] **Step 5:** Run tests — Expected: PASS.
- [ ] **Step 6: Commit** — `feat: add app state reducer and squad paste parser`

---

### Task 5: IndexedDB persistence

**Files:**
- Create: `src/state/persist.ts`
- Test: `tests/unit/persist.test.ts` (imports `fake-indexeddb/auto`)

**Interfaces:**
- Consumes: `AppState`, `SoundSlot`
- Produces:
```ts
function loadState(): Promise<AppState | null>;          // null if nothing stored or version !== 1
function saveState(s: AppState): Promise<void>;
function saveSoundBlob(slot: SoundSlot, b: Blob | null): Promise<void>;   // null deletes
function loadSoundBlob(slot: SoundSlot): Promise<Blob | null>;
function saveSpeech(key: string, b: Blob): Promise<void>;
function loadSpeech(key: string): Promise<Blob | null>;
function listSpeechKeys(): Promise<string[]>;
function clearAll(): Promise<void>;
```

- [ ] **Step 1: Write the failing tests** — round-trip state; stored `{version: 2}` loads as `null`; sound blob round-trip and delete; speech round-trip and `listSpeechKeys`; after `clearAll()` everything returns `null`/`[]`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/persist.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** with `idb-keyval` `createStore('sports-caller', 'kv')`; keys `state`, `sound:<slot>`, `speech:<key>`.
- [ ] **Step 4:** Run tests — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: persist state and audio in IndexedDB`

---

### Task 6: WAV encoding and default sounds

**Files:**
- Create: `src/audio/wav.ts`, `src/audio/defaultSounds.ts`
- Test: `tests/unit/wav.test.ts`

**Interfaces:**
- Produces:
```ts
function encodeWav(samples: Float32Array, sampleRate: number): Blob;    // 16-bit PCM mono, type 'audio/wav'
function synthFanfare(sampleRate: number): Float32Array;                // score sound, ~1.8 s
function synthIntro(sampleRate: number): Float32Array;                  // lineup jingle, ~1.5 s
function defaultSoundBlob(slot: SoundSlot): Blob;                       // memoized, 22050 Hz
```

- [ ] **Step 1: Write the failing tests**

```ts
test('encodeWav writes a valid RIFF header', async () => {
  const b = encodeWav(new Float32Array(100), 22050);
  const v = new DataView(await b.arrayBuffer());
  expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
  expect(v.getUint32(24, true)).toBe(22050); expect(v.getUint16(34, true)).toBe(16);
  expect(b.size).toBe(44 + 200); expect(b.type).toBe('audio/wav');
});
test('samples are clipped to [-1, 1]', async () => { /* 2.0 encodes as 32767, -2.0 as -32768 */ });
test('fanfare length and peak', () => {
  const s = synthFanfare(22050);
  expect(s.length / 22050).toBeCloseTo(1.8, 1);
  expect(Math.max(...s.map(Math.abs))).toBeLessThanOrEqual(0.9);
  expect(s[0]).toBe(0); expect(s[s.length - 1]).toBeCloseTo(0, 2);       // no clicks
});
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/wav.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Fanfare: rising major arpeggio C5–E5–G5 (0.15 s each) then C6 held 1.35 s, each note a sum of fundamental + 2nd/3rd harmonics (brass-like), 10 ms attack / exponential release envelope, normalized to 0.9 peak. Intro: two-note "ding-dong" chime G5→E5, 0.75 s each, sine with exponential decay.
- [ ] **Step 4:** Run tests — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add WAV encoder and synthesized default sounds`

---

### Task 7: Zip export and import

**Files:**
- Create: `src/io/archive.ts`
- Test: `tests/unit/archive.test.ts`

**Interfaces:**
- Consumes: `AppState`, `SoundSlot`
- Produces:
```ts
interface ArchiveContent { state: AppState; sounds: Partial<Record<SoundSlot, Blob>>; speech: Map<string, Blob> }
function exportArchive(c: ArchiveContent): Promise<Blob>;      // application/zip
function importArchive(file: Blob): Promise<ArchiveContent>;   // throws ImportError
class ImportError extends Error { code: 'not-zip' | 'missing-json' | 'bad-version' | 'invalid-data' | 'too-large' }
const MAX_IMPORT_BYTES = 200 * 1024 * 1024;
```
Speech entries: zip `speech/<n>.wav`; the JSON gets a `speechIndex: Record<string /*n*/, string /*cache key*/>` field (dropped from the returned `state`).

- [ ] **Step 1: Write the failing tests**

```ts
test('round-trips state, custom sounds and speech clips', async () => { /* export then import: deep-equal state, blob bytes equal, map keys equal */ });
test('rejects non-zip', async () => await expect(importArchive(new Blob(['hello']))).rejects.toMatchObject({ code: 'not-zip' }));
test('rejects zip without json', async () => { /* zipSync({'a.txt': ...}) -> 'missing-json' */ });
test('rejects version 2', async () => { /* -> 'bad-version' */ });
test('rejects unknown sport id / players not an array', async () => { /* -> 'invalid-data' */ });
test('rejects oversized file before reading it', async () => {
  const big = { size: MAX_IMPORT_BYTES + 1, arrayBuffer: vi.fn() } as unknown as Blob;
  await expect(importArchive(big)).rejects.toMatchObject({ code: 'too-large' }); expect(big.arrayBuffer).not.toHaveBeenCalled();
});
test('ignores unexpected zip entries', async () => { /* extra 'evil/../x.js' entry does not throw and is not returned */ });
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/archive.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** with `fflate` `zip`/`unzip` (async). Validation: `version === 1`; `sport` and every roster key in `SPORT_IDS`; `lang` in `LANGS`; rosters have string `homeTeam`/`opponent` (missing → `''`); players have string `name`/`number`/`position`, boolean `onField`, `customText` string|null; missing `id` gets a fresh UUID. Only read `sounds/score.*`, `sounds/intro.*`, `speech/<digits>.wav`; mime from `customSounds[slot].mime`.
- [ ] **Step 4:** Run tests — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add zip export and validated import`

---

### Task 8: Audio queue

**Files:**
- Create: `src/audio/queue.ts`
- Test: `tests/unit/queue.test.ts`

**Interfaces:**
- Produces:
```ts
interface AudioLike { src: string; play(): Promise<void>; pause(): void; onended: (() => void) | null; onerror: (() => void) | null }
class AudioQueue {
  constructor(createAudio?: () => AudioLike, urls?: { create(b: Blob): string; revoke(u: string): void });
  unlock(): void;                                   // sync: plays a silent clip once, must be called inside a user gesture
  play(items: Array<Blob | (() => Promise<Blob>)>): Promise<void>;   // stops anything playing first; resolves when done or stopped
  stop(): void;
  readonly playing: boolean;
  onChange?: (playing: boolean) => void;
}
```

- [ ] **Step 1: Write the failing tests** (fake `AudioLike` whose `onended` the test fires)

```ts
test('plays items in order', async () => { /* 3 blobs → play() called 3 times with 3 different src, after each onended */ });
test('new play() stops the current sequence', async () => {
  // start [a,b,c]; after a starts, call play([x]); expect a paused, b/c never played, x played; first promise resolved
});
test('stop() pauses and revokes object URLs', () => { /* revoke called for every created URL */ });
test('lazy item is resolved only when its turn comes', async () => { /* factory not called until previous ended */ });
test('a failing item is skipped, the rest still plays', async () => { /* onerror or rejected factory → next item */ });
test('unlock() calls play synchronously', () => { /* fake.play called before unlock returns */ });
test('onChange reports true then false', async () => {});
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/queue.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Use one reused audio element (iOS unlocks per element). Track a sequence counter; each `play()` increments it and every awaited step bails if the counter changed.
- [ ] **Step 4:** Run tests — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add interruptible audio queue`

---

### Task 9: Piper TTS with self-hosted assets and speech cache

**Files:**
- Create: `scripts/fetch-assets.mjs`, `public/voices/LICENSES.md`, `src/tts/voices.ts`, `src/tts/engine.ts`, `src/tts/speechCache.ts`
- Modify: `package.json` (`"fetch-assets"`, `"prebuild": "node scripts/fetch-assets.mjs"`), `src/state/reducer.ts` (default voice from `VOICES`)
- Test: `tests/unit/speechCache.test.ts`, `tests/e2e/tts.spec.ts`

**Interfaces:**
- Consumes: `saveSpeech`, `loadSpeech` (Task 5)
- Produces:
```ts
interface VoiceDef { id: string; lang: Lang; label: string; license: string }
const VOICES: VoiceDef[];
interface TtsEngine { synthesize(text: string, voiceId: string): Promise<Blob>; preload(voiceId: string, onProgress?: (p: number) => void): Promise<void> }
class PiperEngine implements TtsEngine { constructor(assetBase: string /* './' */) }
class TtsUnavailableError extends Error {}
class SpeechCache {
  constructor(engine: TtsEngine, store?: { save(k: string, b: Blob): Promise<void>; load(k: string): Promise<Blob | null> });
  static key(voiceId: string, text: string): string;           // `${voiceId}|${text.trim()}`
  get(voiceId: string, text: string): Promise<Blob>;           // memory → IndexedDB → synthesize; concurrent calls for one key share one synthesis
  prepare(voiceId: string, texts: string[], onProgress: (done: number, total: number) => void): Promise<void>;  // sequential, deduped
  has(voiceId: string, text: string): boolean;                 // memory only, sync
  entries(): Map<string, Blob>;  load(entries: Map<string, Blob>): void;   // for export/import
}
```

- [ ] **Step 1: Spike — self-hosting.** Read the installed `@mintplex-labs/piper-tts-web` source. Determine (a) how ONNX Runtime WASM, piper-phonemize WASM/data and voice `.onnx`/`.onnx.json` URLs are resolved, (b) whether they can be pointed at `./ort/`, `./piper/`, `./voices/`. If a URL is hard-coded to a CDN or huggingface.co, add `patch-package` with a patch that replaces it with the relative path. Record the finding in a comment at the top of `src/tts/engine.ts`.
- [ ] **Step 2: Choose voices — one per language in `LANGS`.** German: `de_DE-thorsten-medium` (CC0). For every other language pick a Piper voice from `rhasspy/piper-voices` `voices.json` whose MODEL_CARD license permits redistribution; prefer `-medium`, use `-low` if that's the only permitted one. Total voice files ≤ 600 MB (static hosts such as GitHub Pages cap sites at 1 GB). If a language has no permitted voice, remove it from `LANGS` and note why in `LICENSES.md`. Write each voice's id, language, source URL and license into `public/voices/LICENSES.md` and `VOICES`, and add a unit test: every `Lang` in `LANGS` has at least one entry in `VOICES`.
- [ ] **Step 3:** Write `scripts/fetch-assets.mjs`: download each voice `.onnx` + `.onnx.json` from `https://huggingface.co/rhasspy/piper-voices/resolve/main/<lang>/<locale>/<name>/<quality>/` into `public/voices/` (skip if present, verify non-zero size), copy ORT `.wasm`/`.mjs` from `node_modules/onnxruntime-web/dist/` to `public/ort/` and phonemizer files to `public/piper/`. Run `npm run fetch-assets`; expected: files present, exit 0.
- [ ] **Step 4: Write failing unit tests** (fake engine counting calls, in-memory store)

```ts
test('get synthesizes once then serves from memory', async () => { /* two get() → engine called once */ });
test('falls back to store before engine', async () => { /* store has key → engine not called */ });
test('concurrent gets for the same key share one synthesis', async () => {});
test('editing text yields a new clip', async () => { /* get('v','A') then get('v','A!') → engine called twice */ });
test('prepare dedupes and reports progress', async () => { /* texts ['a','a','b'] → progress (1,2),(2,2) */ });
test('engine failure rejects get with TtsUnavailableError and caches nothing', async () => {});
```

- [ ] **Step 5:** Run `npx vitest run tests/unit/speechCache.test.ts` — Expected: FAIL. Implement `SpeechCache`; run again — Expected: PASS.
- [ ] **Step 6: Implement `PiperEngine`** wrapping the library; lazy-import it (`await import(...)`) so the app shell loads without it; wrap every library error in `TtsUnavailableError`.
- [ ] **Step 7: Write e2e test** `tests/e2e/tts.spec.ts`: on a dev-only page hook (`window.__tts` exposed when `import.meta.env.DEV` or `?test`), synthesize "Hallo Lea" with the German voice; assert the blob size > 10 000 bytes, `type` is `audio/wav`, that every request in the session had the page origin, and that no other voice's `.onnx` file was requested (voices load only when used). Run `npm run build && npm run test:e2e -- tts` — Expected: PASS.
- [ ] **Step 8: Commit** — `feat: add self-hosted piper TTS and speech cache`

---

### Task 10: App shell, header and theme

**Files:**
- Create: `src/ui/Header.tsx`, `src/ui/styles.css`
- Modify: `src/ui/App.tsx`, `src/main.tsx`
- Test: `tests/unit/app.test.tsx`

**Interfaces:**
- Consumes: `reducer`, `initialState`, `loadState`, `saveState`, `SPORTS`, `LANGS`, `getPack`, `t`, `detectLang`
- Produces: `App` holds `[state, dispatch]` via `useReducer`, loads persisted state on mount, autosaves (debounced 300 ms) on change; creates single `AudioQueue`, `SpeechCache(new PiperEngine('./'))` instances and passes them via a Preact context `ServicesContext: { queue: AudioQueue; speech: SpeechCache }`. Panels receive `{ state, dispatch }`. Root element gets `data-sport={state.sport}`; `<html lang>` and `<html dir>` follow `state.lang` and its pack's `dir`.

- [ ] **Step 1: Write failing tests**

```tsx
test('sport dropdown lists 7 sports with icons and switches theme', async () => {
  render(<App />); const sel = await screen.findByLabelText(/sport/i);
  expect(within(sel).getAllByRole('option')).toHaveLength(7);
  await userEvent.selectOptions(sel, 'handball');
  expect(document.querySelector('[data-sport="handball"]')).not.toBeNull();
});
test('language dropdown lists all 10 languages by native name', async () => {
  /* options text includes 'Deutsch', 'English', 'Français', 'Türkçe', 'Українська', 'العربية' */
});
test('language dropdown switches UI text', async () => { /* select 'fr' → heading of step 1 equals t('fr', …) */ });
test('Arabic switches the page to right-to-left', async () => { /* select 'ar' → document.documentElement.dir === 'rtl', lang === 'ar' */ });
test('first-run language follows navigator.languages', () => { /* stub ['tr-TR'] → Turkish */ });
test('state restored from IndexedDB on load', async () => { /* saveState with sport 'basketball' first */ });
test('panels are numbered steps 1–5 in order', () => { /* headings "1 …" … "5 …" */ });
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/app.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Layout: sticky top bar (icon + "Fanfare", sport `<select>`, language `<select>` showing 🌐 and each language's `nativeName`), then five `<section>` cards with numbered headings and a one-sentence hint under each (this is the "self-explanatory" requirement — every panel says what to do in plain words). CSS custom properties `--accent`, `--bg`, `--fg`, `--card`; `[data-sport=x] { --accent: … }` generated from `SPORTS`; light/dark via `prefers-color-scheme`; min touch target 44 px; single column under 640 px, 16 px gutters.
- [ ] **Step 4:** Run tests — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add app shell with sport and language switcher`

---

### Task 11: Roster panel (step 1)

**Files:**
- Create: `src/ui/RosterPanel.tsx`
- Test: `tests/unit/rosterPanel.test.tsx`

**Interfaces:**
- Consumes: `currentRoster`, `Action`s `setMatch | addPlayers | updatePlayer | removePlayer | movePlayer | togglePositions`, `getPack(lang).sports[sport].positions`

- [ ] **Step 1: Write failing tests**

```tsx
test('match fields "Home team" and "Opponent" sit at the top and dispatch setMatch', async () => {});
test('adding names via textarea creates field players', async () => { /* type "7 Lea\nTom", click "Add" → two rows, Lea #7 */ });
test('pasting the fussball.de fixture adds 5 players with positions and turns positions on', async () => {});
test('"Coming from fussball.de?" help is collapsed and explains copy & paste', async () => {});
test('Enter in the single-name box adds one player', async () => {});
test('field/bench toggle moves a player to the bench list', async () => {});
test('position column hidden until "Use positions" is checked', async () => {
  // no combobox labelled "Position"; check box → combobox appears with datalist of sport positions
});
test('counter warns when more field players than the sport allows', async () => {
  // football with 12 on field → text "12 / 11 on the field" with role="status"; not blocking
});
test('remove asks no confirmation but offers Undo for 5 s', async () => {});
```

- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement.** Two lists: "On the field" and "Bench". Each row: number input (3 chars), name input, optional position `<input list>` (allows free text), ⇄ field/bench button, ↑ ↓, 🗑. All inputs dispatch on `input` and keep focus (keyed by `player.id`). Placeholder text in the textarea: `One name per line — e.g. "7 Lea Müller"`.

  Step 1 starts with a **Match** card: two text fields, **Home team** (de: Heimmannschaft) and **Opponent** (de: Gegner), with the hint `These fill in {home} and {opponent} in the announcements — usually the only thing to change for a new game.` Below the paste box, a `<details>` titled **Coming from fussball.de?** (de: **Daten von fussball.de?**) with en copy: `Open your team page on fussball.de, select the squad list, copy it and paste it into the box above. Shirt numbers, positions and "Last, First" names are recognised automatically. This app never connects to fussball.de itself.` de copy: `Öffne die Mannschaftsseite auf fussball.de, markiere den Kader, kopiere ihn und füge ihn oben ins Feld ein. Rückennummern, Positionen und "Nachname, Vorname" werden automatisch erkannt. Diese App verbindet sich nie selbst mit fussball.de.`
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add roster panel`

---

### Task 12: Callout panel (step 2)

**Files:**
- Create: `src/ui/CalloutPanel.tsx`
- Test: `tests/unit/calloutPanel.test.tsx`

**Interfaces:**
- Consumes: `calloutText`, `introText`, `ServicesContext`, `defaultSoundBlob`, `loadSoundBlob`, actions `updatePlayer` (customText), `setTemplate`, `resetTemplates`
- Produces: `function lineupSequence(state: AppState, speech: SpeechCache, introSound: Blob | null): Array<Blob | (() => Promise<Blob>)>` exported from `CalloutPanel.tsx` (intro sound if enabled → intro text → field players in order → bench players in order).

- [ ] **Step 1: Write failing tests** (fake `SpeechCache`, spy `AudioQueue`)

```tsx
test('each player shows an editable text prefilled from the template', () => {});
test('editing a text stores customText; "↺" resets it to null', async () => {});
test('▶ on a row calls queue.unlock() synchronously, then plays that clip', async () => {
  // assert unlock called before any awaited promise resolves (spy order)
});
test('"Announce lineup" plays intro sound, intro text, field then bench', async () => {});
test('"Prepare voices" shows progress "3 / 5" and a ready badge per row', async () => {});
test('TTS failure shows a readable error and leaves the page usable', async () => {
  // fake speech.get rejects TtsUnavailableError → role="alert" with t('ttsError')
});
test('templates editor is collapsed in <details> and editing it updates untouched rows', async () => {});
test('Stop button visible only while playing', async () => {});
```

- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement.** Big primary button "📣 Announce lineup", secondary "Prepare voices (recommended before the game)". Row text uses `<textarea rows=2>`. The template editor sits in a collapsed `<details>` titled `Change the standard texts (rarely needed)`. Help line: `Use {name}, {number}, {position}, {home}, {opponent}. Text in [brackets] is skipped when a value is empty.` Each placeholder is also a clickable chip that inserts itself at the cursor.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add callout panel with lineup announcement`

---

### Task 13: Game panel (step 3) and sounds panel (step 4)

**Files:**
- Create: `src/ui/GamePanel.tsx`, `src/ui/SoundsPanel.tsx`
- Test: `tests/unit/gamePanel.test.tsx`, `tests/unit/soundsPanel.test.tsx`

**Interfaces:**
- Consumes: `scoreText`, `ServicesContext`, `defaultSoundBlob`, `saveSoundBlob`, `loadSoundBlob`, `VOICES`, actions `setSoundsEnabled | setCustomSound | setVoice`

- [ ] **Step 1: Write failing tests**

```tsx
// gamePanel
test('score button label uses sport score word', () => { /* basketball en → "🏀 Basket!" */ });
test('score with no scorer plays sound then generic text', async () => {});
test('choosing a scorer from the quick-pick includes their name', async () => {});
test('sounds disabled → only the spoken text plays', async () => {});
test('score still plays its sound when TTS fails', async () => { /* speech.get rejects → queue got the sound blob; alert shown */ });
// soundsPanel
test('voice select only lists voices of the current language', () => {});
test('uploading a file stores blob + name and shows "Reset to default"', async () => {});
test('non-audio file is rejected with a message', async () => { /* text/plain */ });
test('file > 10 MB is rejected', async () => {});
test('▶ preview plays the current sound for each slot', async () => {});
```

- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement.** Game panel: one large (min 120 px tall) accent-coloured score button; next to it a row of chips with field-player names (tap to pick scorer, tap again to clear; "Our team" when none). Sounds panel: voice `<select>`, "Play sounds" checkbox, and for each slot (`score`: "Score sound", `intro`: "Lineup intro") a ▶ preview, `<input type=file accept="audio/*">`, and reset. Accept `audio/*` MIME only, ≤ 10 MB.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add score button and sound settings`

---

### Task 14: Data panel (step 5) and privacy note

**Files:**
- Create: `src/ui/DataPanel.tsx`
- Modify: `README.md` (privacy section)
- Test: `tests/unit/dataPanel.test.tsx`

**Interfaces:**
- Consumes: `exportArchive`, `importArchive`, `ImportError`, `clearAll`, `loadSoundBlob`, `saveSoundBlob`, `saveSpeech`, `SpeechCache.entries/load`, action `replaceAll`

- [ ] **Step 1: Write failing tests**

```tsx
test('export downloads fanfare-YYYY-MM-DD.zip', async () => { /* spy URL.createObjectURL + anchor click; filename uses today */ });
test('import replaces state after confirm', async () => {});
test('import of a broken file shows the ImportError message and keeps state', async () => {
  // file "notes.txt" → role="alert" with t('import.not-zip'); roster unchanged
});
test('one message per ImportError code exists in every language', () => {});
test('"Delete all data on this device" asks to confirm, then clears storage and resets state', async () => {});
test('privacy note is visible and says nothing leaves the device', () => {});
```

- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement.** Every language pack carries the privacy note; en and de copy is exact, the others are translations. Privacy note copy (en): `🔒 Everything stays on this device. Names and sounds are stored only in this browser and are never sent to any server — not even to this website. Use Export to move your team to another device.` (de): `🔒 Alles bleibt auf diesem Gerät. Namen und Sounds werden nur in diesem Browser gespeichert und nie an einen Server gesendet – auch nicht an diese Webseite. Mit „Exportieren“ nimmst du dein Team auf ein anderes Gerät mit.` Use `window.confirm` for import/delete confirmations.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add export, import and delete-all with privacy note`

---

### Task 15: End-to-end game-day flow and privacy proof

**Files:**
- Create: `tests/e2e/gameday.spec.ts`
- Modify: `README.md` (usage + deploy: "copy `dist/` to any static host")

**Interfaces:**
- Consumes: the whole app

- [ ] **Step 1: Write the e2e test**

```ts
test('game day flow stays on-origin', async ({ page, baseURL }) => {
  const foreign: string[] = []; const posts: string[] = [];
  page.on('request', r => {
    if (new URL(r.url()).origin !== new URL(baseURL!).origin && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) foreign.push(r.url());
    if (r.method() !== 'GET') posts.push(r.url());
  });
  await page.goto('/');
  // select football, set Opponent "SV Musterstadt" → intro text contains it
  // add "7 Lea Müller\nTom\nZoë", move Zoë to bench, enable positions, set Lea to Goalkeeper
  // Prepare voices → wait for "3 / 3" (timeout 120 s)
  // Announce lineup → Stop button appears, then disappears
  // Score with scorer Lea
  // Export → capture download, reload page, Delete all data, Import the download → Lea #7 back
  // switch sport to volleyball → score button says "Point!"
  expect(foreign).toEqual([]); expect(posts).toEqual([]);
});
test('mobile viewport has no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 }); await page.goto('/');
  for (const lang of ['en', 'ar']) {   // Arabic: RTL layout must not overflow either
    await page.getByLabel(/language|sprache|اللغة/i).selectOption(lang);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  }
});
```

- [ ] **Step 2:** Run `npm run build && npm run test:e2e` — Expected: PASS (fix any defects found in the owning task's files; add a unit test there for each).
- [ ] **Step 3:** Run full suite `npm test && npm run test:e2e` — Expected: all PASS. Manually check on one phone (iOS or Android) that the first tap on "Announce lineup" makes sound.
- [ ] **Step 4: Commit** — `test: add game-day e2e flow and on-origin privacy check`

---

### Task 16: GitHub Pages demo deployment

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `README.md` (live-demo link + one-time setup note), `package.json` (`"check:dist"` script)
- Create: `scripts/check-dist.mjs`

**Interfaces:**
- Consumes: `npm ci`, `npm run build` (whose `prebuild` runs `scripts/fetch-assets.mjs` from Task 9)
- Produces: a workflow that publishes `dist/` to `https://<user>.github.io/<repo>/` on every push to `main` and on manual dispatch.

- [ ] **Step 1: Write `scripts/check-dist.mjs`** — exits non-zero, naming the file, if any of these hold: `dist/index.html` missing or without the CSP meta tag; any `dist/**/*.{html,js,css}` contains `src="/`, `href="/` or an `http(s)://` URL other than inside comments/licence headers (catches absolute paths that break under `/<repo>/` and third-party URLs); any file in `dist/` larger than 100 MB; total `dist/` size over 1 GB. Add `"check:dist": "node scripts/check-dist.mjs"`.
- [ ] **Step 2:** Run `npm run build && npm run check:dist` — Expected: PASS. Then temporarily add `<script src="/x.js">` to a copy of `dist/index.html` and confirm it FAILS naming that file; remove the copy.
- [ ] **Step 3: Write `.github/workflows/pages.yml`**: triggers `push: branches [main]` and `workflow_dispatch`; `permissions: { contents: read, pages: write, id-token: write }`; `concurrency: { group: pages, cancel-in-progress: true }`. Job `build`: `actions/checkout`, `actions/setup-node` (Node LTS, npm cache), `actions/cache` for `public/voices` keyed on `hashFiles('src/tts/voices.ts')`, `npm ci`, `npm test`, `npm run build`, `npm run check:dist`, `actions/upload-pages-artifact` with `path: dist`. Job `deploy` (needs build, `environment: github-pages`): `actions/deploy-pages`. Pin each action to its current major version.
- [ ] **Step 4:** Validate with `npx --yes @action-validator/cli .github/workflows/pages.yml` — Expected: no errors.
- [ ] **Step 5: README:** add a "Live demo" link placeholder `https://<user>.github.io/<repo>/` and a "Publish your own copy" section: fork → Settings → Pages → Source: **GitHub Actions** → push to `main`. Add one privacy sentence: the host (GitHub) sees ordinary page-request logs like any web host; the app itself never sends names, sounds or settings anywhere.
- [ ] **Step 6: Commit** — `ci: deploy demo to GitHub Pages`

---

### Task 17: Getting-started manuals in every language, with screenshots and GIFs

**Files:**
- Create: `docs/manual/<code>.md` for every code in `LANGS`, `docs/manual/README.md` (index linking each language by native name), `scripts/make-docs-media.mjs`, `scripts/build-manual.mjs`, `tests/unit/manual.test.ts`
- Generated (committed): `docs/manual/media/<code>/*.png`, `docs/manual/media/<code>/*.gif`
- Modify: `package.json` (devDeps `gifenc`, `pngjs`, `marked`; scripts `docs:media`, `postbuild`), `src/ui/App.tsx` (help link), all `src/i18n/*.ts` (`manualLink` string), `README.md` (link to `docs/manual/README.md`)

**Interfaces:**
- Consumes: the whole app (Tasks 10–14) via Playwright; `LANGS`, `getPack`
- Produces: `npm run docs:media` regenerates all screenshots/GIFs; `postbuild` renders `docs/manual/<code>.md` to `dist/manual/<code>.html` (+ media), so the manual is served from the same origin and works on GitHub Pages; header link "📖 <manualLink>" opens `./manual/<lang>.html` in the current language.

- [ ] **Step 1: Write failing test** `tests/unit/manual.test.ts`:
```ts
test.each(LANGS)('%s manual exists, has all sections and only existing media', lang => {
  const md = readFileSync(`docs/manual/${lang}.md`, 'utf8');
  expect(md.match(/^## /gm)?.length).toBe(7);                     // same section count in every language
  for (const [, src] of md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) expect(existsSync(`docs/manual/${src}`)).toBe(true);
  expect(md).not.toMatch(/https?:\/\/(?!github\.com)/);            // no third-party links
});
test('index links every language', () => { /* docs/manual/README.md contains `(${lang}.md)` for each LANGS entry */ });
```
- [ ] **Step 2:** Run `npx vitest run tests/unit/manual.test.ts` — Expected: FAIL.
- [ ] **Step 3: Write `scripts/make-docs-media.mjs`** (Node, Playwright Chromium, viewport 390×844 phone + 1280×800 desktop, `deviceScaleFactor: 2` for PNG, 1 for GIF). For each language, against `vite preview`:
  - fresh context, set language via the dropdown, load demo data: home `FC Example`, opponent `SV Sample`, players `1 Alex Demo`, `4 Sam Test`, `7 Kim Muster`, `9 Robin Probe` on the field and `12 Jo Beispiel` on the bench (fictional names only)
  - PNG screenshots: `01-overview.png` (desktop, full page), `02-players.png` (step 1), `03-announcements.png` (step 2), `04-game.png` (step 3 score button), `05-sounds.png` (step 4), `06-save.png` (step 5 with privacy note)
  - GIFs (phone viewport, ~6 fps, max 12 s, ≤ 1.5 MB each): `add-players.gif` (paste a list → players appear), `announce.gif` (Prepare voices → progress → Announce lineup → Stop), `score.gif` (pick scorer → press score button)
  - capture frames with `page.screenshot()` in a timed loop, encode with `gifenc` (256-colour palette per GIF) and `pngjs`; no system tools (no ffmpeg) needed
  - voice synthesis in GIF runs is replaced by the app's normal flow; if it takes long, cut the waiting frames (only keep every 10th frame while the progress counter runs)
- [ ] **Step 4:** Run `npm run build && npm run docs:media` — Expected: 6 PNG + 3 GIF per language under `docs/manual/media/<code>/`, every GIF ≤ 1.5 MB, total media ≤ 40 MB.
- [ ] **Step 5: Write the manuals.** Same 7 `##` sections in every language, short sentences, one image per step:
  1. What is Fanfare? (one paragraph + `01-overview.png`)
  2. Before the first game: pick sport and language, enter your team (`02-players.png`, `add-players.gif`), tip: paste your own squad from fussball.de
  3. On game day: fill in **Opponent**, press **Prepare voices** while you still have Wi-Fi, then **Announce lineup** (`03-announcements.png`, `announce.gif`)
  4. During the game: score button and scorer (`04-game.png`, `score.gif`)
  5. Your own sounds and voice (`05-sounds.png`)
  6. Save, move to another device, delete (`06-save.png`) + the privacy note in plain words
  7. Troubleshooting: no sound on iPhone (silent switch, tap once more), voice download slow (prepare at home), private window doesn't save (use Export), speaker via Bluetooth/cable
  en and de are written fully; the other languages translate the en manual, each file starting with `<!-- Translation: machine-assisted — native speakers, please review. -->`. Arabic manual starts with `<div dir="rtl">` and ends with `</div>`.
- [ ] **Step 6: Write `scripts/build-manual.mjs`** (`postbuild`): render each `docs/manual/<code>.md` with `marked` into `dist/manual/<code>.html` using a minimal same-origin HTML shell (system fonts, `lang`/`dir` set, the same CSP meta as `index.html`, max-width 720 px, images max-width 100%), copy `docs/manual/media/` to `dist/manual/media/`. Add the header link and `manualLink` string (en `Manual`, de `Anleitung`, others translated).
- [ ] **Step 7:** Run `npx vitest run tests/unit/manual.test.ts && npm run build && npm run check:dist && npm run test:e2e` — Expected: all PASS; open `dist/manual/de.html` via `vite preview` and confirm images and GIFs load.
- [ ] **Step 8: Commit** — `docs: add illustrated getting-started manuals in all languages`

---

### Task 18: Optional local voice server (prepare at home, play anywhere)

**Goal of this task:** voices from a high-quality model running on the user's own computer (`http://localhost`), generated at home, saved into the speech cache and the export zip, so the phone plays them on game day without the server. The companion server itself is a separate project; this task only adds the client side and documents the protocol.

**Files:**
- Create: `src/tts/httpEngine.ts`, `src/tts/routingEngine.ts`, `docs/local-voice-server.md`, `tests/unit/httpEngine.test.ts`, `tests/e2e/localVoice.spec.ts`, `tests/e2e/fixtures/mockVoiceServer.ts`
- Modify: `index.html` (CSP), `src/domain/model.ts` + `src/state/reducer.ts` (`localTts`), `src/io/archive.ts` (validate `localTts`), `src/ui/SoundsPanel.tsx`, `src/ui/App.tsx` (engine wiring), all `src/i18n/*.ts`, `scripts/check-dist.mjs` (expected CSP), `docs/manual/*.md` (section 5 paragraph)

**Interfaces:**
- Consumes: `TtsEngine`, `TtsUnavailableError`, `SpeechCache` (Task 9), `VOICES`, `AudioQueue`, SoundsPanel (Task 13), archive (Task 7)
- Produces:
```ts
// model.ts — AppState gains:  localTts: { url: string } | null      (default null; archive version stays 1, missing → null)
// reducer.ts — Action gains:  { type: 'setLocalTts'; url: string | null }   // url must pass isLocalUrl, else ignored
function isLocalUrl(url: string): boolean;     // http(s)://localhost or 127.0.0.1, any port, no path/query/credentials
interface RemoteVoice { id: string; lang: string; label: string }
class HttpTtsEngine implements TtsEngine {
  constructor(baseUrl: string, fetchFn?: typeof fetch);
  listVoices(): Promise<RemoteVoice[]>;          // GET {base}/voices, 5 s timeout
  synthesize(text: string, voiceId: string): Promise<Blob>;   // voiceId WITHOUT 'local:' prefix; POST {base}/synthesize, 120 s timeout
  preload(): Promise<void>;                      // no-op
}
class RoutingEngine implements TtsEngine {       // ids starting 'local:' → HttpTtsEngine (prefix stripped), others → PiperEngine
  constructor(piper: TtsEngine, getLocal: () => HttpTtsEngine | null);
}
const LOCAL_TTS_DEFAULT_URL = 'http://127.0.0.1:5123';
```

**Protocol** (`docs/local-voice-server.md`, the contract for the companion project):
- `GET /voices` → `200 application/json` `[{ "id": "de-high", "lang": "de", "label": "German (high quality)" }]` (`lang` is a code from `LANGS`)
- `POST /synthesize` body `application/json` `{ "text": "...", "voice": "de-high" }` → `200 audio/wav` (or `audio/mpeg`/`audio/ogg`); errors → `4xx/5xx` with `text/plain` message
- CORS on every response: `Access-Control-Allow-Origin: *`; preflight `OPTIONS` answers `Access-Control-Allow-Methods: GET, POST`, `Access-Control-Allow-Headers: Content-Type`, `Access-Control-Allow-Private-Network: true`
- Bind to `127.0.0.1` only (never `0.0.0.0`); no logging of request text
- Document the workflow: start server → enable in step 4 → pick a `local:` voice → **Prepare voices** → **Export** → import the zip on the phone.

- [ ] **Step 1: CSP.** `connect-src 'self' http://localhost:* http://127.0.0.1:*` in `index.html` and in `scripts/check-dist.mjs`' expected CSP. Update the Task 1/15 e2e "foreign request" filters only if they fail: requests to localhost are allowed **only** in `localVoice.spec.ts`; every other e2e still asserts zero non-origin requests.
- [ ] **Step 2: Write failing unit tests** `tests/unit/httpEngine.test.ts` (fake `fetch`):
```ts
test('isLocalUrl', () => {
  expect(['http://localhost:5123', 'http://127.0.0.1:8000', 'https://localhost:1'].every(isLocalUrl)).toBe(true);
  expect(['http://192.168.1.5:5123', 'https://example.com', 'http://localhost.evil.com', 'http://user:pw@localhost:1', 'http://localhost:1/x?y', 'file:///x'].some(isLocalUrl)).toBe(false);
});
test('listVoices parses and filters to known LANGS', async () => {});
test('synthesize POSTs JSON and returns the audio blob', async () => { /* body {text, voice}; content-type header */ });
test('non-2xx, network error, timeout and non-audio response → TtsUnavailableError with readable message', async () => {});
test('RoutingEngine sends local: ids to http engine (prefix stripped) and others to piper', async () => {});
test('RoutingEngine with local voice but no server configured → TtsUnavailableError', async () => {});
test('setLocalTts ignores non-local URLs; archive round-trips localTts and rejects a non-local url as invalid-data', () => {});
```
- [ ] **Step 3:** Run `npx vitest run tests/unit/httpEngine.test.ts` — Expected: FAIL. Implement; run again — Expected: PASS.
- [ ] **Step 4: UI (SoundsPanel).** Collapsed `<details>` **Local voice server (advanced)**: URL field (default `LOCAL_TTS_DEFAULT_URL`), **Connect** button → `listVoices()` → shows "✓ 3 voices found" or the readable error; **Disconnect** clears `localTts`. Connected voices for the current language appear in the voice `<select>` as an extra `<optgroup>` labelled "On this computer", values `local:<id>`. One-line hint under the field: en `Generate high-quality voices on your own computer, then Prepare voices and Export — your phone plays them without the server.` / de `Erzeuge hochwertige Stimmen auf deinem eigenen Computer, dann „Stimmen vorbereiten“ und „Exportieren“ – dein Handy spielt sie ohne Server ab.` A link to `docs/local-voice-server.md` is not needed in the app (the manual covers it). Add a component test: connect success lists voices in the select; failure shows `role="alert"`.
- [ ] **Step 5: Wiring.** `App` builds `SpeechCache(new RoutingEngine(new PiperEngine('./'), () => state.localTts ? new HttpTtsEngine(state.localTts.url) : null))` (read the current state through a ref so the cache isn't rebuilt). If the selected voice is `local:` and the server is unreachable, already-cached clips still play (cache hit before engine).
- [ ] **Step 6: e2e** `tests/e2e/localVoice.spec.ts` with `mockVoiceServer.ts` (Node `http` on `127.0.0.1:5123`, implements the protocol incl. CORS/PNA headers, returns `encodeWav`-style silent WAV): connect → select `local:mock-de` → add 2 players → Prepare voices `2 / 2` → Export → stop the mock server → reload → Delete all data → Import → Announce lineup plays (Stop button appears) with **no** request to 127.0.0.1 after import; all requests either page origin or `127.0.0.1:5123`.
- [ ] **Step 7: Docs.** Write `docs/local-voice-server.md` (protocol above + workflow + note that most high-quality GPU voice models have licence restrictions, check the model's licence before sharing generated audio). Add one short paragraph about the local voice server to section 5 of every `docs/manual/<code>.md` (keeps the 7-section structure).
- [ ] **Step 8:** Run `npm test && npx tsc --noEmit && npm run build && npm run check:dist && npm run test:e2e` — Expected: all PASS.
- [ ] **Step 9: Commit** — `feat: optional local voice server for prepare-at-home voices`

---

### Task 19: Final whole-project review and simplification (Fable)

**Runs after Task 18. Replaces the standard final review; all agents in this task use model `fable`.**

**Inputs:** the whole branch (`main..feat/sports-caller`), the spec, this plan, the ledger's `minor (deferred)`, `RECOMMEND FIX BEFORE MERGE`, `parked` and `Ruling:` lines.

- [ ] **Step 1: Review (read-only, Fable).** One reviewer reads the full branch diff package and the spec and reports, ranked:
  1. *Must fix before merge* — correctness, privacy (any path to a foreign origin), GPL/licence compliance (Ruling R18), data loss (incl. ledger items marked RECOMMEND FIX BEFORE MERGE), accessibility blockers, spec gaps.
  2. *Simplifications* — concrete, behaviour-preserving proposals for maintainability and readability: duplicated logic across panels (play helper, sound-blob preloading, `onChange` subscriptions, error alerts) pulled into one place; overly clever code made plain; dead code, unused exports, leftover provisional comments removed; long components split along clear responsibilities; consistent naming; types tightened where they remove runtime checks. Each proposal names files, the target shape, and why it is simpler — no new features, no new dependencies, no public behaviour change.
  3. *Triage of deferred minors* — fix now / leave (with one-line reason).
- [ ] **Step 2: Apply (Fable implementer, one dispatch).** Apply every must-fix and the accepted simplifications in small commits (`refactor: …`, `fix: …`), each keeping the suite green. Constraints: no behaviour change except must-fixes; tests are only changed where an internal API they target was simplified (never weakened); file structure from the plan may change only where the review justified it, and the README/plan file map is updated accordingly.
- [ ] **Step 3: Verify.** Run `npm test && npx tsc --noEmit && npm run build && npm run check:dist && npm run test:e2e` — Expected: all PASS. Report line counts before/after (`git diff --stat main..HEAD -- src`) and the number of exported symbols before/after.
- [ ] **Step 4: Scoped re-review (Fable).** Verdict each must-fix and each applied simplification (ADDRESSED / NOT ADDRESSED / BEHAVIOUR CHANGED); residuals are adjudicated by the controller and listed for the user.

---

### Task 20: "Say it like…" pronunciation hints

**Execution order:** run after Task 16 and **before Task 17** (so manuals/screenshots include it).

**Goal:** a coach preparing at home can fix how the voice pronounces a name without changing how it is displayed. Applies to players, Home team and Opponent.

**Files:**
- Modify: `src/domain/model.ts` (`Player.sayAs: string`, `Roster.homeSayAs: string`, `Roster.opponentSayAs: string`, all default `''`), `src/state/reducer.ts` (`updatePlayer` accepts `sayAs`; `setMatch` accepts `homeSayAs`/`opponentSayAs`), `src/io/archive.ts` (validate; missing → `''`), `src/domain/template.ts`, `src/ui/RosterPanel.tsx`, `src/ui/CalloutPanel.tsx`, `src/ui/GamePanel.tsx`, all `src/i18n/*.ts`
- Test: `tests/unit/template.test.ts`, `tests/unit/reducer.test.ts`, `tests/unit/archive.test.ts`, `tests/unit/rosterPanel.test.tsx`, `tests/unit/calloutPanel.test.tsx`

**Interfaces:**
```ts
function speechText(displayText: string, roster: Roster): string;
// replaces every occurrence of each player's display name (longest names first, whole-word, case-sensitive),
// roster.homeTeam and roster.opponent with their sayAs value when that value is non-empty; otherwise unchanged
```
Every place that sends text to the voice (`speech.get`, `speech.prepare`, `lineupSequence`, score) uses `speechText(...)`; every place that shows text keeps the display text. The speech-cache key is the speech text, so changing a hint regenerates that clip automatically. Custom-edited texts are covered too (the name inside them is replaced at speech time).

- [ ] **Step 1: Failing unit tests** (`template.test.ts`):
```ts
test('speechText swaps names for their sayAs', () => {
  // player {name:'Zoë', sayAs:'Tso-eh'}, opponent 'SV Musterstadt' sayAs 'Es Fau Musterstadt'
  expect(speechText('Go Zoë! We play SV Musterstadt.', roster)).toBe('Go Tso-eh! We play Es Fau Musterstadt.');
});
test('empty sayAs leaves text unchanged', () => {});
test('longer names win: "Lea Marie" sayAs before "Lea"', () => {});
test('whole-word only: "Leander" untouched when "Lea" has sayAs', () => {});
test('names with regex characters ("O\'Neil (C)") are matched literally', () => {});
```
Reducer + archive tests: `sayAs` round-trips; old archives without the fields import with `''`.
- [ ] **Step 2:** Run — Expected: FAIL. Implement `speechText` and wire every speech call through it. Run — Expected: PASS.
- [ ] **Step 3: UI.** In each roster row a small **🗣** toggle button (aria-label "Pronunciation") reveals one extra input **Say it like…** (placeholder en `e.g. Tso-eh`, de `z. B. Tso-eh`) and a **▶** that speaks just that hint (or the name if empty) with the current voice. Rows with a hint show the 🗣 button highlighted so it is visible later. Same for Home team and Opponent fields (one 🗣 each). One-line hint shown when the input is open — en: `Write the name the way it sounds. Only the voice uses this; the list still shows the real name.` / de: `Schreib den Namen so, wie er klingt. Nur die Stimme nutzt das; in der Liste steht weiter der echte Name.` All strings in all 10 packs.
- [ ] **Step 4: Panel tests:** toggling 🗣 shows the input; typing a hint dispatches; ▶ calls `speech.get` with the hint; CalloutPanel's Announce/▶ send `speechText` (hint) while the textarea still shows the real name; editing a hint changes the speech cache key (Ready badge disappears for that row).
- [ ] **Step 5:** Run `npm test && npx tsc --noEmit && npm run build && npm run test:e2e` — Expected: all PASS.
- [ ] **Step 6: Commit** — `feat: "say it like" pronunciation hints for names and teams`

---

### Task 18 addendum: "Your club's own announcer voice"

Extends Task 18 (same dispatch). Requires Fanfare Studio round 3 (reference-voice endpoints).

**Protocol additions** (`docs/local-voice-server.md`):
- `POST /references` — `multipart/form-data`: `audio` (wav/webm/ogg, ≤ 60 s, ≤ 10 MB), `name` (≤ 40 chars), `lang` (code from LANGS), `consent` (must be `"true"`, else 400). → `201 application/json` `{ "id": "club-…", "lang": "de", "label": "…" }`; the new voice then appears in `GET /voices`.
- `DELETE /references/{id}` → `204`. Removes the stored recording and the derived voice.
- Server keeps recordings only on its own disk, never returns the raw audio, never logs it.

**Fanfare UI (SoundsPanel, local-server section, only when connected):**
- [ ] **🎙 Record club voice** opens a dialog: reading text (≈ 15 s, friendly announcer copy per language, e.g. en: "Hello everyone and welcome! Today's lineup: number seven, Lea! On the bench, ready to jump in: Tom! Have a fair and fun game!"), Record/Stop with a visible 20 s countdown (auto-stop at 20 s), playback ▶ to check it, name field, language select (default current), and a required consent checkbox — en: `I am the speaker, or the speaker agreed that this voice may be used for our club's announcements.` / de: `Ich bin die sprechende Person, oder sie hat zugestimmt, dass diese Stimme für die Ansagen unseres Vereins genutzt wird.` Save is disabled until consent is ticked and a recording exists.
- [ ] Recording uses `navigator.mediaDevices.getUserMedia({audio:true})` + `MediaRecorder` only after the user clicks Record; the stream is stopped right after recording; the blob is sent only to the configured `isLocalUrl` server and discarded from memory afterwards (never persisted in IndexedDB, never in the export zip).
- [ ] Club voices show in the voice select's "On this computer" group with a 🗑 (calls DELETE after confirm).
- [ ] Readable errors: microphone denied, no microphone, server rejected (show server message).
- [ ] Tests: unit (mock `getUserMedia`/`MediaRecorder`/fetch): Save disabled without consent; upload goes only to the local URL with `consent=true`; stream tracks stopped after recording; recording not written to persist; delete flow. e2e: extend `mockVoiceServer.ts` with `/references` and run record → save → voice appears (Chromium fake media: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`).
- [ ] Manual (Task 17 already done by then → update section 5 in all languages): one paragraph on club voices incl. consent and "don't imitate famous voices".

---

### Task 21: In-app help — welcome card and "Show me" per step

**Execution order:** right after Task 17 (needs its media), before Task 18.

**Goal:** beginners learn Fanfare inside the page, without opening anything else. The manuals (Task 17, served at `./manual/<lang>.html`) stay the long form.

**Files:** Create `src/ui/WelcomeCard.tsx`, `src/ui/ShowMe.tsx`, `tests/unit/help.test.tsx`; modify `src/ui/App.tsx`, `src/ui/styles.css`, all `src/i18n/*.ts`, `scripts/build-manual.mjs` (only if media paths need exporting).

- [ ] **Welcome card** (top of the page, before step 1) shown on first visit: title `Welcome to Fanfare!`, three numbered lines (en: `Enter your team and today's opponent.` / `Press "Prepare voices" while you have Wi-Fi.` / `On game day: "Announce lineup" and celebrate every goal.`; de: `Gib dein Team und den heutigen Gegner ein.` / `Drück „Stimmen vorbereiten“, solange du WLAN hast.` / `Am Spieltag: „Aufstellung ansagen“ und jedes Tor feiern.`), buttons **Show me how** (opens `./manual/<lang>.html` in a new tab, `rel="noopener"`) and **Got it** (hides it). Dismissal is a per-device convenience in `localStorage` (`fanfare.welcomeDismissed`), wrapped in try/catch — if storage fails the card can be dismissed for the session. A **?** button in the top bar reopens it.
- [ ] **"▶ Show me"** link under each step's hint (steps 1–5) toggles an inline `<figure>` with that step's media for the current language: step 1 → `add-players.gif`, step 2 → `announce.gif`, step 3 → `score.gif`, step 4 → `05-sounds.png`, step 5 → `06-save.png`, from `./manual/media/<lang>/`. `<img loading="lazy">` is inserted only when opened (no media requests before the first click), `alt` text translated, `max-inline-size: 100%`, a **Hide** toggle. Respect `prefers-reduced-motion`: show the matching still PNG instead of the GIF.
- [ ] All strings in all 10 packs (en/de exact as above; others translated). Arabic RTL works.
- [ ] Tests: first visit shows the card; Got it hides it and persists; storage throwing → card still dismissible; ? reopens; Show me inserts the image only after click with the right `src` for the current language and step; reduced-motion → PNG; e2e: no image request under `manual/media` before clicking Show me, then exactly one same-origin request after.
- [ ] Run `npm test && npx tsc --noEmit && npm run build && npm run check:dist && npm run test:e2e` — all PASS.
- [ ] Commit — `feat: welcome card and inline "show me" help`

---

### Task 22: Guest team — share/import one team and announce both teams

**Execution order:** after Task 21, before Task 18.

**Goal:** the guest coach sends their player list (file by e-mail/USB); the home side imports it with one click; Fanfare announces guests and home team.

**Model changes** (`model.ts`, `reducer.ts`, `archive.ts` — archive version stays 1, missing fields default):
```ts
interface Roster { …existing; guestPlayers: Player[]; }            // default []
type TemplateKey = 'intro' | 'field' | 'bench' | 'score' | 'guestIntro' | 'guestScore';
// Actions: addGuestPlayers {text}, updateGuestPlayer, removeGuestPlayer, moveGuestPlayer, importGuestTeam {team: TeamFile}
interface TeamFile { fanfareTeam: 1; sport: SportId; teamName: string; players: Array<Pick<Player,'name'|'number'|'position'|'onField'|'sayAs'>>; teamSayAs: string }
function exportTeamFile(state: AppState): TeamFile;                 // current sport, home team = homeTeam/homeSayAs/players
function parseTeamFile(json: unknown): TeamFile;                     // throws ImportError('invalid-data'|'bad-version'); max 100 players, strings capped like elsewhere
```
`importGuestTeam` replaces `guestPlayers` (fresh ids), sets `opponent`/`opponentSayAs` from the file; a file whose `sport` differs from the current sport → readable error suggesting to switch sport (no silent import).

**Templates** (en/de exact; others translated; friendly):
| key | en | de |
|---|---|---|
| guestIntro | `A warm welcome to our guests[ from {opponent}]! Here is their lineup:` | `Ein herzliches Willkommen an unsere Gäste[ vom {opponent}]! Hier ist ihre Aufstellung:` |
| guestScore | `{score}[ for {opponent}]![ Well played, {name}!]` | `{score}[ für {opponent}]![ Gut gespielt, {name}!]` |
Guest players use the existing `field`/`bench` templates.

**UI:**
- Step 1: two tabs **Our team** / **Guests** (`role="tablist"`); Guests tab = same roster editor (reuse the component with a `side` prop — no copy-paste), plus **Import team file** (`accept=".json,application/json"`, ≤ 1 MB) and **Clear guests**.
- Step 5: **Share our team** → downloads `fanfare-team-<slug(homeTeam)|team>-YYYY-MM-DD.json` (same safe download as Export: anchor in DOM, revoke after 1 s) with the note en `This file contains names. Only send it to the other team's coach.` / de `Diese Datei enthält Namen. Schick sie nur an das Trainerteam der anderen Mannschaft.`
- Step 2: **📣 Announce lineup** plays guests first (guestIntro → guest field → guest bench) then home (intro → field → bench) when guests exist; extra buttons **Guests only** / **Home only**; Prepare voices covers both; guest rows appear in the list with their own ▶ and Ready badges.
- Step 3: second, smaller button **{score} for {opponent}** with guest scorer chips (only shown when guests exist).
- `speechText` also applies guest players' `sayAs`.

**Tests:** reducer (import replaces guests, sets opponent, fresh ids; sport mismatch error), parseTeamFile (valid, wrong marker/version, too many players, wrong types, extra fields dropped), exportTeamFile round-trip, archive with/without guestPlayers, panel tests for tabs/import/share/announce order (guests before home)/guest score, e2e: share team in one browser context → import as guests in a fresh context → Announce lineup sequence starts with the guest intro; no foreign requests.

- [ ] TDD each part; then `npm test && npx tsc --noEmit && npm run build && npm run check:dist && npm run test:e2e` — all PASS.
- [ ] Update manuals (all 10): section 2 paragraph "Playing against another Fanfare club? Swap team files" and section 3 mention of guests-first announcement; rerun `npm run docs:media` so screenshots show the Guests tab; media budgets still pass.
- [ ] Commit — `feat: guest team sharing and two-team announcements`

**Task 19 addition — docs freshness (after Step 3, before Step 4):** rerun `npm run build && npm run docs:media` so every screenshot/GIF shows the final UI; the Step 1 reviewer also checks that each manual (all 10) and the in-app help (Task 21) describe every shipped feature (guest team, Say it like…, local voice server, club voice, privacy/export) and nothing that no longer exists; mismatches are must-fix.
