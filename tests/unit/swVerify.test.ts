import { fetchVerified } from '../../src/sw/verify';
import type { CacheMode } from '../../src/sw/verify';

const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const hashOf = async (b: ArrayBuffer) => new TextDecoder().decode(b);
const resp = (s: string, status = 200) => new Response(s, { status });

test('accepts a matching body on the first fetch', async () => {
  const modes: CacheMode[] = [];
  const r = await fetchVerified('https://e.org/app/ort/a.wasm', 'good', async (_u, m) => { modes.push(m); return resp('good'); }, hashOf);
  expect(modes).toEqual(['no-store']);
  expect(await hashOf(r.body)).toBe('good');
});

test('refetches with reload when the first copy is stale, then accepts', async () => {
  const modes: CacheMode[] = [];
  const r = await fetchVerified('https://e.org/app/assets/a.js', 'good', async (_u, m) => { modes.push(m); return resp(m === 'reload' ? 'good' : 'stale'); }, hashOf);
  expect(modes).toEqual(['no-store', 'reload']);
  expect(await hashOf(r.body)).toBe('good');
});

test('throws when even the reloaded copy mismatches or the response is not ok', async () => {
  await expect(fetchVerified('https://e.org/a/x.js', 'good', async () => resp('bad'), hashOf)).rejects.toThrow(/does not match/);
  await expect(fetchVerified('https://e.org/a/x.js', 'good', async () => resp('x', 404), hashOf)).rejects.toThrow(/HTTP 404/);
  void buf;
});
