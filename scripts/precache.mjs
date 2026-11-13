// Pure helpers that decide what the service worker precaches (see tests/unit/precache.test.ts).
import { createHash } from 'node:crypto';

const INCLUDE = [/^index\.html$/, /^assets\//, /^ort\//, /^piper\//, /^manual\//, /^manifest\.webmanifest$/, /^icons\//];
// Voices are cached by the speech library in OPFS; threaded ORT builds need
// cross-origin isolation, which a static host does not provide.
const EXCLUDE = [/^voices\//, /^sw\.js$/, /\.map$/, /-threaded\.wasm$/];

const norm = (p) => p.replace(/\\/g, '/');

export function isPrecached(path) {
  const p = norm(path);
  return INCLUDE.some((re) => re.test(p)) && !EXCLUDE.some((re) => re.test(p));
}

/** files: [{ path (relative to dist), hash }] -> { entries: [{ url, hash }], version } */
export function buildPrecache(files) {
  const entries = files
    .map((f) => ({ url: './' + norm(f.path), hash: f.hash, path: norm(f.path) }))
    .filter((f) => isPrecached(f.path))
    .map(({ url, hash }) => ({ url, hash }))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  const version = createHash('sha256').update(entries.map((e) => `${e.url}:${e.hash}`).join('\n')).digest('hex').slice(0, 12);
  return { entries, version };
}
