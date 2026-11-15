// @vitest-environment node
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Phonemizer, PhonemizeError, type EmscriptenFactory } from '../../src/tts/phonemize';
import { ESPEAK_VOICES, isEspeakVoice } from '../../src/tts/espeakVoices';

const dir = resolve(process.cwd(), 'public/piper');
const have = existsSync(resolve(dir, 'piper_phonemize.wasm')) && existsSync(resolve(dir, 'piper_phonemize.data'));
if (!have) {
  // Not hidden: unit tests run before the build downloads the assets in CI.
  console.warn(`[phonemize.test] SKIPPED: ${dir}/piper_phonemize.{wasm,data} missing (run "npm run fetch-assets")`);
}
const load = async (): Promise<EmscriptenFactory> =>
  createRequire(import.meta.url)('@diffusionstudio/piper-wasm/build/piper_phonemize.js') as EmscriptenFactory;
const locateFile = (f: string) => resolve(dir, f);
const make = () => new Phonemizer(load, locateFile);

describe.skipIf(!have)('phonemize (shipped wasm, Node)', () => {
  const p = make();
  test.each([
    ['Nguyễn', 'vi', 'ŋwˈiɛ5n'],
    ['Zoë', 'fr', 'zɔˈɛ'],
    ['Joaquín', 'es', 'xˌoakˈin'],
    ['Wojciech', 'pl', 'vˈɔjtɕɛx'],
    ['Özdemir', 'tr', 'œzdemˈɪr'],
    ['Микола', 'uk', 'mɪkˈola'],
  ])('%s [%s] -> %s', async (text, voice, ipa) => {
    expect((await p.phonemize(text, voice)).join('')).toBe(ipa);
  });

  test('every curated voice phonemizes and unknown voices are rejected readably', async () => {
    for (const v of ESPEAK_VOICES) {
      expect((await p.phonemize('Siobhan', v.code)).length, v.code).toBeGreaterThan(0);
    }
    expect(isEspeakVoice('xx-nope')).toBe(false);
    await expect(p.phonemize('Siobhan', 'xx-nope')).rejects.toBeInstanceOf(PhonemizeError);
    // the cached module is still usable afterwards
    expect((await p.phonemize('Lea', 'de')).length).toBeGreaterThan(0);
  });

  test('concurrent calls are serialized and many calls are fast', async () => {
    const t0 = Date.now();
    const all = await Promise.all(Array.from({ length: 30 }, (_, i) => p.phonemize(`Name${i}`, 'de')));
    expect(all.every((a) => a.length > 0)).toBe(true);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test('a module that aborts is re-created and the call can be retried', async () => {
    let created = 0;
    const flaky: EmscriptenFactory = async (arg) => {
      created++;
      const m = await (await load())(arg);
      if (created === 1) m.callMain = () => { throw new Error('abort(7)'); };
      return m;
    };
    const f = new Phonemizer(async () => flaky, locateFile);
    await expect(f.phonemize('Lea', 'de')).rejects.toBeInstanceOf(PhonemizeError);
    expect((await f.phonemize('Lea', 'de')).length).toBeGreaterThan(0);
    expect(created).toBe(2);
  });

  test('a module that cannot be created gives a readable error and can be retried', async () => {
    let n = 0;
    const f = new Phonemizer(async () => { if (n++ === 0) throw new Error('boom'); return load(); }, locateFile);
    await expect(f.phonemize('Lea', 'de')).rejects.toThrow(/could not be loaded/);
    expect((await f.phonemize('Lea', 'de')).length).toBeGreaterThan(0);
  });
});
