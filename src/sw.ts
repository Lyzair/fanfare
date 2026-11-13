/// Service worker: precaches the app shell (list injected at build time by
/// scripts/build-sw.mjs), serves it cache-first and index.html network-first.
/// Voice models are deliberately not handled (the speech library caches them).
import { route } from './sw/route';

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
const CACHE = PREFIX + __VERSION__;
const HASH_HEADER = 'x-fanfare-hash';
const NETWORK_TIMEOUT_MS = 4000;

const scope = sw.registration.scope;
const abs = (u: string) => new URL(u, scope).href;
const precache: ReadonlySet<string> = new Set(__PRECACHE__.map(e => abs(e.url)));
const indexUrl = abs('./index.html');

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
  const queue = [...__PRECACHE__];
  const worker = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const url = abs(e.url);
      if (await cache.match(url)) continue;
      let res = await previousCopy(url, e.hash);
      if (!res) {
        const net = await fetch(url, { cache: 'no-store' });
        if (!net.ok) throw new Error(`precache ${e.url}: HTTP ${net.status}`);
        const headers = new Headers(net.headers);
        headers.set(HASH_HEADER, e.hash);
        res = new Response(net.body, { status: net.status, statusText: net.statusText, headers });
      }
      await cache.put(url, res);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

async function activate(): Promise<void> {
  for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
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
  const strategy = route({ url: e.request.url, method: e.request.method, mode: e.request.mode }, { scope, precache });
  if (strategy === 'precache') e.respondWith(cacheFirst(e.request));
  else if (strategy === 'network-first') e.respondWith(networkFirst(e.request));
}) as (e: never) => void);
