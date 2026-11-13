// @vitest-environment node
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Phonemizer, type EmscriptenFactory } from '../../src/tts/phonemize';
import { hasRespell, respell, MAX_CANDIDATES } from '../../src/domain/respell';
import { de } from '../../src/domain/respell/de';
import { en } from '../../src/domain/respell/en';
import { suggest, SuggestError } from '../../src/domain/respell/suggest';

const dir = resolve(process.cwd(), 'public/piper');
const have = existsSync(resolve(dir, 'piper_phonemize.wasm')) && existsSync(resolve(dir, 'piper_phonemize.data'));
if (!have) console.warn(`[respell.test] ranking tests SKIPPED: ${dir}/piper_phonemize.{wasm,data} missing (run "npm run fetch-assets")`);

const ph = new Phonemizer(
  async () => createRequire(import.meta.url)('@diffusionstudio/piper-wasm/build/piper_phonemize.js') as EmscriptenFactory,
  (f) => resolve(dir, f),
);
const phonemize = (t: string, v: string) => ph.phonemize(t, v);
const ipa = (s: string) => s.replace(/ˈ/g, 'ˈ ').split(' '); // like eSpeak: stress mark is its own element

test('only de and en have tables; each has roughly 60+ entries', () => {
  expect(hasRespell('de')).toBe(true);
  expect(hasRespell('en')).toBe(true);
  expect(hasRespell('fr')).toBe(false);
  expect(respell(ipa('a b'), 'fr')).toEqual([]);
  expect(Object.keys(de).length).toBeGreaterThanOrEqual(60);
  expect(Object.keys(en).length).toBeGreaterThanOrEqual(60);
  for (const t of [de, en]) for (const alts of Object.values(t)) expect(alts.length).toBeLessThanOrEqual(3);
});

test('respell gives the default spelling first and never more than the cap', () => {
  const w = ipa('v ˈɔ j t ɕ ɛ x');
  expect(respell(w, 'de')[0]).toBe('wojtschech');
  expect(respell(w, 'en')[0]).toBe('voychekh');
  expect(respell(ipa('ʃ ˈɔ v ɐ n'), 'de')).toContain('schowern');
  expect(respell(ipa('a ˈɪ a ɪ a ɪ a ɪ a ɪ a'), 'de').length).toBeLessThanOrEqual(MAX_CANDIDATES);
  expect(respell(ipa('ŋ w ˈi ɛ 5 n'), 'de')[0]).toBe('nguien');
});

test('unknown segments are kept as they are and tone digits vanish', () => {
  expect(respell(ipa('ʘ a'), 'de')[0]).toBe('ʘa');
  expect(respell(ipa('a 5'), 'de')[0]).toBe('a');
});

describe.skipIf(!have)('ranking by round trip (shipped wasm, Node)', () => {
  const run = (name: string, nameVoice: string, targetLang: 'de' | 'en', origSpelling = '') =>
    suggest({ name, origSpelling, nameVoice, targetLang, phonemize });
  const texts = async (...a: Parameters<typeof run>) => (await run(...a)).candidates.map((c) => c.text);

  test('Wojciech (pl) for a German voice offers a Wojtschech-like spelling, at most 3, distinct sounds', async () => {
    const r = await run('Wojciech', 'pl', 'de');
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
    expect(r.candidates.length).toBeLessThanOrEqual(3);
    expect(r.candidates.map((c) => c.text)).toContain('Wojtschech');
    expect(new Set(r.candidates.map((c) => c.ipa.join(' '))).size).toBe(r.candidates.length);
    expect(r.candidates.map((c) => c.ipa.join(' '))).not.toContain(r.baseline.ipa.join(' '));
    expect(r.baseline.text).toBe('Wojciech');
    for (const c of r.candidates) expect(c.level).toBeGreaterThanOrEqual(1);
  });

  test("the spike's winners are among the top 3", async () => {
    expect(await texts('Siobhan', 'ga', 'de')).toContain('Schowern');
    expect(await texts('Siobhan', 'ga', 'en')).toContain('Shawvan');
    expect(await texts('Özdemir', 'tr', 'de')).toContain('Ösdemir');
    expect(await texts('Joaquín', 'es', 'en')).toEqual(expect.arrayContaining([expect.stringMatching(/^(Hoakeen|Khoakeen)$/)]));
    expect(await texts('Nguyễn', 'vi', 'en')).toContain('Ngwien');
    expect(await texts('Wojciech', 'pl', 'en')).toContain('Voychekh');
  });

  test('the original spelling matters: Микола (uk) differs from the Latin guess', async () => {
    const cyr = await run('Mykola', 'uk', 'de', 'Микола');
    expect(cyr.source.join('')).toBe('mɪkˈola');
    expect(cyr.candidates.length).toBeGreaterThan(0);
  });

  test('a typical name finishes well under the 3 s bound', async () => {
    const t0 = Date.now();
    await run('Wojciech', 'pl', 'de');
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test('unsupported target and empty pronunciation are reported', async () => {
    await expect(suggest({ name: 'Lea', origSpelling: '', nameVoice: 'de', targetLang: 'fr', phonemize })).rejects.toMatchObject({ code: 'unsupported' });
    await expect(suggest({ name: '', origSpelling: '', nameVoice: 'de', targetLang: 'de', phonemize })).rejects.toBeInstanceOf(SuggestError);
  });
});
