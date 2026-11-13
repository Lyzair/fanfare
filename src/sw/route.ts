/** Pure request routing for the service worker (unit-tested; no SW globals). */
export type Strategy = 'precache' | 'network-first' | 'bypass';

export interface RouteRequest { url: string; method: string; mode?: string }
/** `scope` is the absolute SW scope URL; `precache` holds absolute URLs without query. */
export interface RouteContext { scope: string; precache: ReadonlySet<string> }

export function route(req: RouteRequest, ctx: RouteContext): Strategy {
  if (req.method !== 'GET') return 'bypass';
  const url = new URL(req.url);
  const scope = new URL(ctx.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return 'bypass';
  const rel = url.pathname.slice(scope.pathname.length);
  // Voice models are cached by the speech library (OPFS); never store them twice.
  if (rel.startsWith('voices/')) return 'bypass';
  if (req.mode === 'navigate' || rel === '' || rel === 'index.html') return 'network-first';
  return ctx.precache.has(url.origin + url.pathname) ? 'precache' : 'bypass';
}
