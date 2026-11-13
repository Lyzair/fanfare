import { route } from '../../src/sw/route';

const scope = 'https://example.org/fanfare/';
const precache = new Set([
  'https://example.org/fanfare/index.html',
  'https://example.org/fanfare/assets/index-abc.js',
  'https://example.org/fanfare/ort/ort-wasm-simd.wasm',
]);
const ctx = { scope, precache };
const get = (url: string, mode = 'no-cors') => route({ url, method: 'GET', mode }, ctx);

test('navigations and index.html are network-first', () => {
  expect(get('https://example.org/fanfare/', 'navigate')).toBe('network-first');
  expect(get('https://example.org/fanfare/?test', 'navigate')).toBe('network-first');
  expect(get('https://example.org/fanfare/manual/en.html', 'navigate')).toBe('network-first');
  expect(get('https://example.org/fanfare/index.html')).toBe('network-first');
});

test('precached same-origin GETs are cache-first, ignoring the query string', () => {
  expect(get('https://example.org/fanfare/assets/index-abc.js')).toBe('precache');
  expect(get('https://example.org/fanfare/ort/ort-wasm-simd.wasm?x=1')).toBe('precache');
});

test('voices are never handled', () => {
  expect(get('https://example.org/fanfare/voices/de/de_DE-thorsten-medium.onnx')).toBe('bypass');
  const withVoicePrecached = new Set([...precache, 'https://example.org/fanfare/voices/x.onnx']);
  expect(route({ url: 'https://example.org/fanfare/voices/x.onnx', method: 'GET' }, { scope, precache: withVoicePrecached })).toBe('bypass');
});

test('cross-origin, non-GET, out-of-scope and unknown requests bypass', () => {
  expect(get('https://cdn.example.com/fanfare/assets/index-abc.js')).toBe('bypass');
  expect(route({ url: 'https://example.org/fanfare/assets/index-abc.js', method: 'POST' }, ctx)).toBe('bypass');
  expect(route({ url: 'https://example.org/fanfare/', method: 'POST', mode: 'navigate' }, ctx)).toBe('bypass');
  expect(get('https://example.org/other/assets/index-abc.js')).toBe('bypass');
  expect(get('https://example.org/fanfare/unknown.json')).toBe('bypass');
  expect(get('https://cdn.example.com/', 'navigate')).toBe('bypass');
});

test('non-threaded ORT variants and manual media are runtime-cached; threaded wasm is not', () => {
  expect(get('https://example.org/fanfare/ort/ort-wasm.wasm')).toBe('runtime');
  expect(get('https://example.org/fanfare/manual/media/en/a.png')).toBe('runtime');
  expect(get('https://example.org/fanfare/ort/ort-wasm-simd-threaded.wasm')).toBe('bypass');
});

test('range requests bypass', () => {
  expect(route({ url: 'https://example.org/fanfare/assets/index-abc.js', method: 'GET', range: true }, ctx)).toBe('bypass');
  expect(route({ url: 'https://example.org/fanfare/manual/media/en/a.png', method: 'GET', range: true }, ctx)).toBe('bypass');
});
