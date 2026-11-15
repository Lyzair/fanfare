// @vitest-environment node
import { buildPrecache, isPrecached } from '../../scripts/precache.mjs';

const f = (path: string, hash = 'h') => ({ path, hash });

test('includes the app shell and the licence texts, and excludes voices, sw and threaded wasm', () => {
  const { entries } = buildPrecache([
    f('index.html'), f('assets/index-1.js'), f('assets/a.css'), f('ort/ort-wasm-simd.wasm'), f('ort/ort-wasm.wasm'), f('ort/ort-wasm-simd-threaded.wasm'),
    f('piper/piper_phonemize.data'), f('manual/en.html'), f('manual/media/en/a.png'), f('manual/media/de/a.gif'), f('manifest.webmanifest'), f('icons/icon-192.png'),
    f('voices/de/x.onnx'), f('voices/LICENSES.md'), f('licenses/GPL-3.0.txt'), f('licenses/VOICE-LICENSES.txt'), f('sw.js'), f('assets/a.js.map'),
  ]);
  expect(entries.map((e: { url: string }) => e.url)).toEqual([
    './assets/a.css', './assets/index-1.js', './icons/icon-192.png', './index.html',
    './licenses/GPL-3.0.txt', './licenses/VOICE-LICENSES.txt', './manifest.webmanifest',
    './manual/en.html', './ort/ort-wasm-simd.wasm', './piper/piper_phonemize.data',
  ]);
});

test('version is stable for the same content and changes with any hash or file', () => {
  const base = [f('index.html', '1'), f('assets/a.js', '2')];
  const v = buildPrecache(base).version;
  expect(buildPrecache([...base].reverse()).version).toBe(v);
  expect(buildPrecache([f('index.html', '1'), f('assets/a.js', '3')]).version).not.toBe(v);
  expect(buildPrecache([...base, f('assets/b.js', '4')]).version).not.toBe(v);
  expect(v).toMatch(/^[0-9a-f]{12}$/);
});

test('uses forward slashes and keeps every entry relative', () => {
  const { entries } = buildPrecache([f('manual\\en.html')]);
  expect(entries[0].url).toBe('./manual/en.html');
  expect(isPrecached('voices/a.onnx')).toBe(false);
  expect(isPrecached('assets/x.js')).toBe(true);
});
