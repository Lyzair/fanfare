# Wide-screen layouts and docs sweep

## Intent

New users should see a short README that tells them what Fanfare is and how to start, without
developer and security detail. And the page should use the screen it is on: phones and tablets
in portrait keep the single column, while notebooks and 16:9 monitors get a wide layout the user
can pick.

## Part 1: Layouts

**Today:** five step cards in one column, at most 720 px wide (`main` in `src/ui/styles.css`).

**Breakpoints** (CSS only, no JavaScript measuring):
- below 900 px (phones, tablets in portrait): one column, as today.
- 900 px and wider (tablets in landscape, notebooks, monitors): the chosen wide layout.
- 1400 px and wider: layout A gets a third column.

**Two wide layouts, the user picks** (user decision: offer both):
- **A "Columns":** the cards flow into 2 columns (3 from 1400 px), in step order.
- **B "Game on the side"** (default, my call: it keeps Goal/Announce in view on match day): left
  column steps 1 and 2; right column steps 3, 4, 5. Step 3 stays in view while the left side
  scrolls (`position: sticky`). If the right column is taller than the screen, it scrolls normally.

**Choosing:** a small two-button switch in the header ("Layout": Columns / Game on the side),
shown only at 900 px and wider. The choice is a per-device display preference: stored in the
app state like the other settings (my call: it is not included in Export, since another device
may have another screen).

**Also:** the header, the welcome card and notices span the full width; the content is at most
1600 px wide and centred; the 44 px touch targets and the no-horizontal-scroll rule stay.

**Tests:** reducer test for the new setting; App test that the switch sets `data-layout` on
`main`; e2e: at 1920×1080 in layout B the step-3 card is beside step 1 and stays visible after
scrolling; at 1024×768 two columns; at 390×844 one column and no horizontal scroll (the
existing mobile test keeps passing). Labels in all 10 languages.

## Part 2: Docs sweep (both repos)

- **READMEs become short and user-first:** what it is, live demo, which download, using it in
  four steps, privacy in two lines, links to the manual and to the technical docs.
- **Technical content moves, nothing is lost:** Fanfare's phone-remote relay rules and HTTPS
  certificate details into `docs/self-hosting.md` (deduplicated with what is there); build,
  deploy, tests and "publish your own copy" into a new `docs/development.md`; the licence list
  stays as a short section with a link to `public/voices/LICENSES.md`. Studio: same split into
  `docs/development.md` (install variants, backends, protocol, security model, quality tooling).
- **All other docs** (manuals in 10 languages, `self-hosting`, `local-voice-server`, Raspberry Pi
  READMEs, Studio's docs): fix stale facts (e.g. old package names, "proof of concept", missing
  release downloads), cut repetition, keep the structure.
- **Not touched:** licence texts (`public/licenses/*`, `public/voices/LICENSES.md` apart from
  links), `docs/superpowers/*` (history).
- **Check:** every moved fact is findable in its new place; `npm test` (some tests read the
  README-local and licence files) and the link targets in the READMEs exist.

## Non-goals

- No redesign of the cards themselves, no new colours or fonts.
- No layout choice on phones (one column is the only sensible one there).
