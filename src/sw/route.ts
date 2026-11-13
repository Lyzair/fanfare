/** Pure request routing for the service worker (unit-tested; no SW globals). */
export type Strategy = 'precache' | 'runtime' | 'network-first' | 'bypass';

export interface RouteRequest { url: string; method: string; mode?: string; range?: boolean }
/** `scope` is the absolute SW scope URL; `precache` holds absolute URLs without query. */
export interface RouteContext { scope: string; precache: ReadonlySet<string> }

export function route(req: RouteRequest, ctx: RouteContext): Strategy {
  if (req.method !== 'GET' || req.range) return 'bypass'; // partial responses are never cached
  const url = new URL(req.url);
  const scope = new URL(ctx.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return 'bypass';
  const rel = url.pathname.slice(scope.pathname.length);
  // Voice models are cached by the speech library (OPFS); never store them twice.
  if (rel.startsWith('voices/')) return 'bypass';
  if (req.mode === 'navigate' || rel === '' || rel === 'index.html') return 'network-first';
  if (ctx.precache.has(url.origin + url.pathname)) return 'precache';
  // Cached on first use: non-threaded ORT variants and manual media.
  if (/^ort\/[^/]+\.wasm$/.test(rel) && !rel.endsWith('-threaded.wasm')) return 'runtime';
  if (rel.startsWith('manual/media/')) return 'runtime';
  return 'bypass';
}
