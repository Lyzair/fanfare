# Wide-screen layouts and docs sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two user-selectable wide layouts for screens ≥ 900 px, and short user-first READMEs with the technical detail moved into docs, in both repos.

**Architecture:** A per-device preference `'game-side' | 'columns'` in `localStorage` (same pattern as `fanfare.welcomeDismissed` in `src/ui/App.tsx`), exposed as `data-layout` on `<main>`; CSS grid with media queries does the rest. Step cards get `data-step` so CSS can place them. Docs: move, deduplicate, don't delete.

**Tech Stack:** Preact + TypeScript, plain CSS, Vitest, Playwright; Markdown.

**Spec:** `docs/superpowers/specs/2026-11-17-layout-and-docs-design.md`

Repos: `F` = `/home/rene/Projects/fanfare`, `S` = `/home/rene/Projects/fanfare-studio`. Work on branch `layout-docs` in each; no push.

## Global Constraints

- Breakpoints: < 900 px one column (unchanged); ≥ 900 px chosen wide layout; ≥ 1400 px layout A has 3 columns. Content max width 1600 px, centred.
- Default layout: `game-side` (B). Storage key `fanfare.layout`, values `game-side` | `columns`; anything else → default. Not part of the app state, Export or Import.
- The layout switch is visible only at ≥ 900 px; touch targets ≥ 44 px; no horizontal scroll at 360 px (existing e2e) in ltr and rtl.
- Labels in all 10 language packs (`src/i18n/*.ts`; `en.ts` defines keys).
- Docs: no fact is dropped, only moved; licence texts and `docs/superpowers/*` untouched.

## Review Focus

1. Arabic (rtl) at ≥ 900 px: columns mirror correctly and nothing overflows: e2e in Task 1 checks `scrollWidth` at 1920 in `ar`.
2. `localStorage` throws (private mode): the app still renders with the default layout: unit test in Task 1.
3. Right column in layout B taller than the screen (step 4 and 5 open): sticky must not hide content: sticky applies to the step-3 card only, the column scrolls with the page; e2e scrolls to the bottom and checks step 5 is visible.
4. A README link that points at a moved section: Task 2/3 check every relative link target exists.
5. Tests that read docs (`tests/unit/licences.test.ts` reads README-local; `tests/python/test_hosting.py` reads docs): keep passing.

---

### Task 1 (F): Layout preference, switch and CSS

**Files:**
- Create: `src/ui/layout.ts`, `src/ui/LayoutSwitch.tsx`
- Modify: `src/ui/App.tsx` (data-layout on `main`, `data-step={n}` on each card, pass layout to Header), `src/ui/Header.tsx` (render `LayoutSwitch`), `src/ui/styles.css`, `src/i18n/*.ts`
- Test: `tests/unit/layout.test.tsx`, `tests/e2e/layout.spec.ts`

**Interfaces:**
- Produces: `type Layout = 'game-side' | 'columns'`; `loadLayout(): Layout`; `saveLayout(l: Layout): void` (both swallow storage errors); `useLayout(): [Layout, (l: Layout) => void]`.
- Produces: `<LayoutSwitch lang layout onChange />`: a `role="group"` with `aria-label` = `layoutLabel`, two `button`s with `aria-pressed`, texts `layoutGameSide` / `layoutColumns`; class `layout-switch`.
- i18n keys: `layoutLabel` (en "Layout"), `layoutGameSide` (en "Game on the side"), `layoutColumns` (en "Columns").

- [ ] **Step 1: Failing unit tests**: `loadLayout()` → `'game-side'` when nothing stored, when the value is `'xyz'`, and when `localStorage.getItem` throws; `saveLayout('columns')` then `loadLayout()` → `'columns'`; rendering `App` shows `main[data-layout="game-side"]` and five `section[data-step]`; clicking "Columns" sets `data-layout="columns"`, `aria-pressed="true"` on that button, and stores `columns`.
- [ ] **Step 2:** `npx vitest run tests/unit/layout.test.tsx`: FAIL (module missing).
- [ ] **Step 3: Implement** module, switch, App/Header wiring, i18n (real translations, 10 packs).
- [ ] **Step 4: CSS** in `styles.css`:
  - `.layout-switch { display: none }`; at `min-width: 900px` show it (inline-flex, buttons ≥ 44 px, pressed state visible).
  - `@media (min-width: 900px)`: `main { max-width: 1600px }`; header inner width matches.
    - `main[data-layout="columns"]`: `grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start`; at `min-width: 1400px` `repeat(3, …)`.
    - `main[data-layout="game-side"]`: `grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start`; `[data-step="1"], [data-step="2"]` → column 1; `[data-step="3"], [data-step="4"], [data-step="5"]` → column 2 with `grid-row` 1/2/3 for 3/4/5 and steps 1/2 spanning (`[data-step="1"] { grid-row: 1 / span 2 }`, `[data-step="2"] { grid-row: 3 / span 10 }` or an equivalent that keeps them stacked); `[data-step="3"] { position: sticky; top: 8px }`.
    - Welcome card and notices: `grid-column: 1 / -1`.
- [ ] **Step 5: e2e** `tests/e2e/layout.spec.ts`:
  - 1920×1080, default: step-3 card's left edge > step-1 card's right edge (side by side); after `window.scrollTo(0, 600)` with ≥ 3 players, step-3 card's top is within the viewport; scroll to bottom: step-5 card visible.
  - 1920×1080, click "Columns": cards 1, 2, 3 have three distinct x positions; `ar`: `scrollWidth <= 1920`.
  - 1024×768: two distinct x positions among cards 1 and 2 (columns) or 1 and 3 (game-side).
  - 390×844: switch not visible; all cards share one x position.
- [ ] **Step 6:** `npm test`, `npm run build`, `npm run check:dist`, `npx playwright test`: all pass.
- [ ] **Step 7:** screenshots at 390×844, 1024×768, 1920×1080 (both layouts) into the scratchpad and look at them; fix anything that looks broken.
- [ ] **Step 8: Commit** `feat: wide-screen layouts (game on the side / columns), chosen per device`.

### Task 2 (F): Docs sweep

**Files:**
- Modify: `README.md`, `docs/self-hosting.md`, `docs/self-hosting.de.md`, `docs/local-voice-server.md`, `docs/manual/*.md` (10), `docs/manual/README.md`, `deploy/raspberry-pi/README*.md`, `CONTRIBUTING.md`, `scripts/local/README-local.txt` (only stale facts)
- Create: `docs/development.md`

README target shape (≈ 40 lines): title + one-sentence what; live demo; **Download** (as now, 3 bullets); **How to use** (4 steps); **Features** (one line each, link to manual); **Privacy** (2 lines); **More**: links to manual, `docs/self-hosting.md` (own server, Docker, Raspberry Pi, phone remote over Wi-Fi), `docs/local-voice-server.md` (Fanfare Studio), `docs/development.md` (build, tests, publish your own copy); **Licence** (MIT + one line pointing at `public/voices/LICENSES.md` and `public/licenses/`).

Moves:
- README "Build", "Deploy", "Publish your own copy", `serve:local`/`package:local` commands, tests → `docs/development.md`.
- README "Run Fanfare on your own computer" relay/HTTPS/server rules → `docs/self-hosting.md` (merge with its existing HTTPS and local-server sections; one copy only).
- README "Run Fanfare with Docker" → already in `self-hosting.md`; README keeps the one-line docker command under Download.
- README licence bullets → `docs/development.md` "Third-party licences" (full list), README keeps the short line.

- [ ] **Step 1:** Write `docs/development.md` and the new README; merge the moved text into `self-hosting.md` (de: matching short additions).
- [ ] **Step 2:** Sweep the other files: stale names (`fanfare-local-<version>.zip`, "Unzip this folder", "proof of concept"), dead references, repeated paragraphs; manuals: check each mentions the downloads/update path only if it already covers installation (no new sections).
- [ ] **Step 3: Link check**: for every relative link in changed `.md` files, the target file (and `#anchor` heading, if any) exists. A short script in the scratchpad, output read.
- [ ] **Step 4:** `npm test` and `python -m unittest discover -s tests/python`: pass.
- [ ] **Step 5: Commit** `docs: user-first README; technical detail moved to docs/development.md and docs/self-hosting.md`.

### Task 3 (S): Docs sweep

**Files:**
- Modify: `README.md`, `docs/model-choice.md`, `docs/eval.md`, `samples/README.md`, `voices/README.md`, `pyproject.toml` (description: drop "proof of concept")
- Create: `docs/development.md`

README target shape (≈ 40 lines): what it is (one paragraph); **Download** (as now); **Start** (start files, first-start download, link to manual); **Connect Fanfare** (3 lines); **Docker** (`docker run` line, link to manual §7, ROCm/CUDA build link); **Privacy and security** (4 bullets: local only, allowed websites, no logs of texts, watermark); **More**: manual EN/DE, `docs/development.md`, `docs/model-choice.md`; **Licence**.

Moves: install variants table, backends/hardware, voices.toml, speed, protocol, security details, "why stdlib server", quality checks, tests, Docker details (volumes, hardening, smoke), workflow → `docs/development.md` (sections kept as they are, minimal edits).

- [ ] **Step 1:** Write `docs/development.md` (moved sections) and the new README.
- [ ] **Step 2:** Sweep the other docs for stale facts.
- [ ] **Step 3:** Link check as in Task 2.
- [ ] **Step 4:** `uv run pytest tests/test_package.py` (manual/package tests): pass; `uv run python scripts/package.py --out /tmp-free-scratch` builds (README and manuals present).
- [ ] **Step 5: Commit** `docs: user-first README; developer detail in docs/development.md`.
