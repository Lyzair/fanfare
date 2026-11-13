#!/usr/bin/env node
// Regenerates the screenshots and GIFs of the manuals: docs/manual/media/<lang>/*.png|gif
//
// Usage:  npm run build && npm run docs:media [-- --lang de,en]
// Starts `vite preview` on a private port against dist/ and stops it at the end.
// Uses only the fictional demo team below. Fails when a GIF exceeds 1.5 MB or the
// total media exceeds 40 MB.
import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import gifenc from 'gifenc';
import pngjs from 'pngjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const { PNG } = pngjs;

const PORT = 4180;
const BASE = `http://localhost:${PORT}/`;
const OUT = 'docs/manual/media';
const MAX_GIF = 1.5 * 1024 * 1024;
const MAX_TOTAL = 40 * 1024 * 1024;
const MAX_GIF_MS = 12_000;
const FPS = 6;

const DEMO = {
  home: 'FC Example',
  opponent: 'SV Sample',
  field: '1 Alex Demo\n4 Sam Test\n7 Kim Muster\n9 Robin Probe',
  bench: '12 Jo Beispiel',
  // the guest team arrives as a team file, exactly like a real swap between two clubs
  guests: {
    fanfareTeam: 1, sport: 'football', teamName: 'SV Sample', teamSayAs: '',
    players: [
      { name: 'Pat Gast', number: '3', position: '', onField: true, sayAs: '' },
      { name: 'Mika Besuch', number: '8', position: '', onField: true, sayAs: '' },
      { name: 'Noor Visitor', number: '11', position: '', onField: false, sayAs: '' },
    ],
  },
  guestSayAs: 'Mee-ka Bezoosh',
};
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- GIF helpers ----------

/** Captures page frames in a timed loop; `thin()` keeps only every 10th frame (long waits). */
function startRecorder(page, clip) {
  const frames = [];
  let running = true;
  let thinning = false;
  let n = 0;
  const loop = (async () => {
    while (running) {
      const t0 = Date.now();
      const buf = await page.screenshot({ type: 'png', scale: 'css', clip });
      n++;
      if (!thinning || n % 10 === 0) frames.push({ buf, t: t0, thin: thinning });
      await sleep(Math.max(0, 1000 / FPS - (Date.now() - t0)));
    }
  })();
  return {
    thin(on) { thinning = on; },
    async stop() { running = false; await loop; return frames; },
  };
}

function boxResize(src, w, h, tw) {
  if (tw >= w) return { data: src, width: w, height: h };
  const th = Math.round((h * tw) / w);
  const out = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor((y * h) / th), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / th));
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor((x * w) / tw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / tw));
      let r = 0, g = 0, b = 0, c = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * w + xx) * 4;
        r += src[i]; g += src[i + 1]; b += src[i + 2]; c++;
      }
      const o = (y * tw + x) * 4;
      out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c; out[o + 3] = 255;
    }
  }
  return { data: out, width: tw, height: th };
}

function encodeGif(frames, width, colors) {
  const decoded = frames.map((f) => {
    const p = PNG.sync.read(f.buf);
    return { ...boxResize(p.data, p.width, p.height, width), delay: f.delay };
  });
  // merge identical consecutive frames
  const merged = [];
  for (const f of decoded) {
    const prev = merged[merged.length - 1];
    if (prev && Buffer.compare(prev.data, f.data) === 0) prev.delay += f.delay;
    else merged.push({ ...f });
  }
  // one palette per GIF, built from up to 8 evenly spread frames
  const picks = Array.from({ length: Math.min(8, merged.length) }, (_, i) => merged[Math.floor((i * merged.length) / Math.min(8, merged.length))]);
  const sample = Buffer.concat(picks.map((f) => f.data));
  const palette = quantize(sample, colors, { format: 'rgb444' });
  const enc = GIFEncoder();
  for (const f of merged) {
    enc.writeFrame(applyPalette(f.data, palette, 'rgb444'), f.width, f.height, { palette, delay: Math.min(f.delay, 1500) });
  }
  enc.finish();
  return { bytes: Buffer.from(enc.bytes()), frames: merged.length };
}

async function saveGif(file, frames) {
  frames.forEach((f, i) => {
    f.delay = f.thin ? 200 : i + 1 < frames.length ? Math.min(frames[i + 1].t - f.t, 1500) : 700;
  });
  const total = frames.reduce((s, f) => s + Math.min(f.delay, 1500), 0);
  if (total > MAX_GIF_MS + 500) throw new Error(`${file}: ${total} ms is longer than ${MAX_GIF_MS} ms`);
  let last;
  for (const [width, colors] of [[390, 128], [360, 64], [320, 64], [280, 48], [240, 32]]) {
    last = encodeGif(frames, width, colors);
    if (last.bytes.length <= 1.1 * 1024 * 1024) break;
  }
  if (last.bytes.length > MAX_GIF) throw new Error(`${file}: ${last.bytes.length} bytes exceeds the 1.5 MB GIF budget`);
  await writeFile(file, last.bytes);
}

// ---------- page helpers ----------

async function setup(page, pack, { bench = true } = {}) {
  // the first-visit welcome card would shift the layout of every screenshot
  await page.addInitScript(() => { try { localStorage.setItem('fanfare.welcomeDismissed', '1'); } catch {} });
  await page.goto(BASE);
  await page.locator('header select').nth(1).selectOption(pack.code);
  await page.locator('header select').first().selectOption('football');
  const dir = await page.evaluate(() => document.documentElement.dir);
  if (dir !== pack.dir) throw new Error(`${pack.code}: expected dir=${pack.dir}, got ${dir}`);
  await page.locator('#match-home').fill(DEMO.home);
  await page.locator('#match-opponent').fill(DEMO.opponent);
  await page.getByLabel(pack.ui.pasteLabel).fill(DEMO.field);
  await page.getByRole('button', { name: pack.ui.addToField, exact: true }).click();
  if (bench) {
    await page.getByLabel(pack.ui.pasteLabel).fill(DEMO.bench);
    await page.getByRole('button', { name: pack.ui.addToBench, exact: true }).click();
  }
  await importGuests(page, pack);
}

/** Imports the demo guest team through the Guests tab, then returns to Our team. */
async function importGuests(page, pack) {
  await page.getByRole('tab', { name: new RegExp(`^${pack.ui.tabGuests}`) }).click();
  await page.getByLabel(pack.ui.importTeam).setInputFiles({
    name: 'fanfare-team-sv-sample.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(DEMO.guests)),
  });
  await page.getByText(DEMO.guests.players[0].name).first().waitFor({ state: 'attached' });
  await page.getByRole('tab', { name: new RegExp(`^${pack.ui.ourTeam}`) }).click();
}

const card = (page, n) => page.locator(`section.card[aria-labelledby="step${n}-title"]`);

async function scrollToCard(page, n) {
  await card(page, n).evaluate((el) => {
    const bar = document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - bar - 8);
  });
  await sleep(200);
}

const clipFor = (h) => ({ x: 0, y: 0, width: PHONE.width, height: h });

async function waitStopVisible(page, pack) {
  const stop = page.getByRole('button', { name: pack.ui.stopPlaying, exact: true }).first();
  await stop.waitFor({ state: 'visible', timeout: 60_000 });
  return stop;
}

// ---------- per-language run ----------

async function runLang(browser, pack, outDir) {
  await mkdir(outDir, { recursive: true });
  const written = [];
  const png = async (loc, name, opts = {}) => {
    const file = join(outDir, name);
    // the sticky header would cover the top of a tall element screenshot
    await loc.page().addStyleTag({ content: '.topbar { position: static !important; }' });
    await loc.screenshot({ path: file, animations: 'disabled', ...opts });
    written.push(file);
  };

  // 01 overview: desktop
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2, locale: 'en-US' });
    const page = await ctx.newPage();
    await setup(page, pack);
    await sleep(400);
    const file = join(outDir, '01-overview.png');
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    written.push(file);
    await ctx.close();
  }

  // everything else: phone
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, locale: 'en-US', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('dialog', (d) => void d.accept());
  await page.goto(BASE);
  await page.locator('header select').nth(1).selectOption(pack.code);
  await page.locator('header select').first().selectOption('football');
  if ((await page.evaluate(() => document.documentElement.dir)) !== pack.dir) throw new Error(`${pack.code}: wrong dir`);
  await page.locator('#match-home').fill(DEMO.home);
  await page.locator('#match-opponent').fill(DEMO.opponent);

  // add-players.gif: paste a list -> players appear
  {
    await scrollToCard(page, 1);
    const rec = startRecorder(page, clipFor(700));
    await sleep(600);
    await page.getByLabel(pack.ui.pasteLabel).fill(DEMO.field);
    await sleep(900);
    await page.getByRole('button', { name: pack.ui.addToField, exact: true }).click();
    await sleep(1200);
    await page.getByLabel(pack.ui.pasteLabel).fill(DEMO.bench);
    await sleep(700);
    await page.getByRole('button', { name: pack.ui.addToBench, exact: true }).click();
    await sleep(1500);
    const file = join(outDir, 'add-players.gif');
    await saveGif(file, await rec.stop());
    written.push(file);
    await importGuests(page, pack);
  }

  // announce.gif: prepare voices -> progress -> announce -> stop
  {
    await scrollToCard(page, 2);
    const rec = startRecorder(page, clipFor(700));
    await sleep(700);
    await page.getByRole('button', { name: pack.ui.prepareVoices, exact: true }).click();
    rec.thin(true); // keep every 10th frame while the progress counter runs
    await page.getByText(pack.ui.prepareDone, { exact: true }).waitFor({ timeout: 240_000 });
    rec.thin(false);
    await sleep(800);
    await page.getByRole('button', { name: pack.ui.announceLineup, exact: true }).click();
    await waitStopVisible(page, pack);
    await sleep(1800);
    await page.getByRole('button', { name: pack.ui.stopPlaying, exact: true }).first().click();
    await sleep(900);
    const file = join(outDir, 'announce.gif');
    await saveGif(file, await rec.stop());
    written.push(file);
    await page.getByRole('button', { name: pack.ui.stopPlaying, exact: true }).first().waitFor({ state: 'hidden' });
    await scrollToCard(page, 2);
    await png(card(page, 2), '03-announcements.png');
  }

  // score.gif + 04: pick scorer -> press score button
  {
    await scrollToCard(page, 3);
    const rec = startRecorder(page, clipFor(520));
    await sleep(600);
    const chip = page.getByRole('button', { name: '7 Kim Muster', exact: true });
    await chip.click();
    await sleep(1000);
    await page.locator('.score-button').click();
    await waitStopVisible(page, pack);
    await sleep(1500);
    await page.getByRole('button', { name: pack.ui.stopPlaying, exact: true }).first().click();
    await sleep(800);
    const file = join(outDir, 'score.gif');
    await saveGif(file, await rec.stop());
    written.push(file);
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
    await png(card(page, 3), '04-game.png');
  }

  await png(card(page, 4), '05-sounds.png');
  await png(card(page, 5), '06-save.png');

  // 02 players: the Guests tab (imported team) with one row's "Say it like..." hint open
  {
    await page.getByRole('tab', { name: new RegExp(`^${pack.ui.tabGuests}`) }).click();
    const row = page.getByRole('listitem').filter({ has: page.locator('input[value="Mika Besuch"]') });
    await row.getByRole('button', { name: pack.ui.pronunciation, exact: true }).click();
    await row.getByLabel(pack.ui.sayAsLabel).fill(DEMO.guestSayAs);
    await sleep(300);
    await scrollToCard(page, 1);
    await png(card(page, 1), '02-players.png');
  }
  await ctx.close();
  return written;
}

// ---------- main ----------

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(BASE)).ok) return; } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('vite preview did not start');
}

async function main() {
  if (!existsSync('dist/index.html')) throw new Error('dist/ is missing: run `npm run build` first');
  const arg = process.argv.indexOf('--lang');
  const only = arg > -1 ? process.argv[arg + 1].split(',') : null;

  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const { LANGS, getPack } = await vite.ssrLoadModule('/src/i18n/index.ts');
  const langs = LANGS.filter((l) => !only || only.includes(l));

  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  const killPreview = () => { try { process.kill(-preview.pid); } catch { /* already gone */ } };
  process.on('SIGINT', () => { killPreview(); process.exit(130); });
  let browser;
  const files = [];
  try {
    await waitForServer();
    browser = await chromium.launch();
    for (const lang of langs) {
      const t0 = Date.now();
      const dir = join(OUT, lang);
      await rm(dir, { recursive: true, force: true });
      files.push(...(await runLang(browser, getPack(lang), dir)));
      console.log(`${lang}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  } finally {
    await browser?.close();
    killPreview();
    await vite.close();
  }

  // report every file and enforce the budgets over everything on disk
  let total = 0;
  for (const lang of await readdir(OUT)) {
    for (const f of await readdir(join(OUT, lang))) {
      const size = (await stat(join(OUT, lang, f))).size;
      total += size;
      if (f.endsWith('.gif') && size > MAX_GIF) throw new Error(`${lang}/${f}: ${size} bytes exceeds 1.5 MB`);
      if (!only || only.includes(lang)) console.log(`${(size / 1024).toFixed(0).padStart(7)} KB  ${lang}/${f}`);
    }
  }
  console.log(`total media: ${(total / 1048576).toFixed(1)} MB`);
  if (total > MAX_TOTAL) throw new Error('total media exceeds 40 MB');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
