/// Service worker: precaches the app shell (list injected at build time by
/// scripts/build-sw.mjs), serves it cache-first and index.html network-first.
/// Voice models are deliberately not handled (the speech library caches them).
import { route } from './sw/route';
import { fetchVerified } from './sw/verify';

declare const __PRECACHE__: { url: string; hash: string }[];
declare const __VERSION__: string;

interface ExtEvent extends Event { waitUntil(p: Promise<unknown>): void }
interface FetchEv extends ExtEvent { request: Request; respondWith(r: Promise<Response> | Response): void }
interface SwScope {
  registration: { scope: string };
  clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: string, listener: (e: never) => void): void;
}
const sw = self as unknown as SwScope;

const PREFIX = 'fanfare-shell-';
const RT_PREFIX = 'fanfare-rt-';
const CACHE = PREFIX + __VERSION__;
const RUNTIME = RT_PREFIX + __VERSION__;
const HASH_HEADER = 'x-fanfare-hash';
const NETWORK_TIMEOUT_MS = 4000;

const scope = sw.registration.scope;
const abs = (u: string) => new URL(u, scope).href;
const PRECACHE = __PRECACHE__;
const precache: ReadonlySet<string> = new Set(PRECACHE.map(e => abs(e.url)));
const indexUrl = abs('./index.html');

async function hashOf(body: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  return Array.from(d, b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function previousCopy(url: string, hash: string): Promise<Response | undefined> {
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX) || name === CACHE) continue;
    const hit = await (await caches.open(name)).match(url);
    if (hit?.headers.get(HASH_HEADER) === hash) return hit;
  }
  return undefined;
}

async function install(): Promise<void> {
  const cache = await caches.open(CACHE);
  const queue = [...PRECACHE];
  const worker = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const url = abs(e.url);
      if (await cache.match(url)) continue;
      let res = await previousCopy(url, e.hash);
      if (!res) {
        const { response, body } = await fetchVerified(url, e.hash, (u, cacheMode) => fetch(u, { cache: cacheMode }), hashOf);
        const headers = new Headers(response.headers);
        headers.set(HASH_HEADER, e.hash);
        res = new Response(body, { status: 200, statusText: response.statusText, headers });
      }
      await cache.put(url, res);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

async function activate(): Promise<void> {
  for (const name of await caches.keys()) if ((name.startsWith(PREFIX) || name.startsWith(RT_PREFIX)) && name !== CACHE && name !== RUNTIME) await caches.delete(name);
  await sw.clients.claim();
}

const noQuery = (u: string) => { const x = new URL(u); return x.origin + x.pathname; };

async function cached(url: string): Promise<Response | undefined> {
  const cache = await caches.open(CACHE);
  const u = noQuery(url);
  return (await cache.match(u.endsWith('/') ? indexUrl : u)) ?? (await cache.match(indexUrl));
}

async function networkFirst(req: Request): Promise<Response> {
  const fallback = await cached(req.url);
  const net = fetch(req);
  if (!fallback) return net;
  net.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('slow network')), NETWORK_TIMEOUT_MS));
  try { return await Promise.race([net, timeout]); } catch { return fallback; }
}

async function runtimeFirst(req: Request): Promise<Response> {
  const cache = await caches.open(RUNTIME);
  const key = noQuery(req.url);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) await cache.put(key, res.clone());
  return res;
}

async function cacheFirst(req: Request): Promise<Response> {
  const hit = await (await caches.open(CACHE)).match(noQuery(req.url));
  return hit ?? fetch(req);
}

sw.addEventListener('install', ((e: ExtEvent) => { e.waitUntil(install()); }) as (e: never) => void);
sw.addEventListener('activate', ((e: ExtEvent) => { e.waitUntil(activate()); }) as (e: never) => void);
sw.addEventListener('message', ((e: { data?: { type?: string } }) => {
  if (e.data?.type === 'SKIP_WAITING') void sw.skipWaiting();
}) as (e: never) => void);
sw.addEventListener('fetch', ((e: FetchEv) => {
  const strategy = route({ url: e.request.url, method: e.request.method, mode: e.request.mode, range: e.request.headers.has('range') }, { scope, precache });
  if (strategy === 'precache') e.respondWith(cacheFirst(e.request));
  else if (strategy === 'runtime') e.respondWith(runtimeFirst(e.request));
  else if (strategy === 'network-first') e.respondWith(networkFirst(e.request));
}) as (e: never) => void);
