/** Test doubles for the phone remote: a fake EventSource and a scripted fetch. */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static CONNECTING = 0; static OPEN = 1; static CLOSED = 2;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<(e: { data: string }) => void>>();
  closed = false;
  url: string;
  constructor(url: string) { this.url = url; FakeEventSource.instances.push(this); }
  addEventListener(name: string, fn: (e: { data: string }) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
  }
  close() { this.closed = true; this.readyState = 2; }
  open() { this.readyState = 1; this.onopen?.(); }
  emit(name: string, data: unknown) { for (const fn of this.listeners.get(name) ?? []) fn({ data: JSON.stringify(data) }); }
  fail(closed: boolean) { this.readyState = closed ? 2 : 0; this.onerror?.(); }
  static reset() { FakeEventSource.instances = []; }
  static get last() { return FakeEventSource.instances[FakeEventSource.instances.length - 1]; }
}

export interface Call { method: string; url: string; headers: Record<string, string>; body: unknown }

/** fetch() stub: `routes` maps "METHOD path" to a response or a function; every call is recorded. */
export function fakeFetch(routes: Record<string, unknown | ((call: Call) => { status: number; json?: unknown } | unknown)>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = String(input);
    const call: Call = {
      method: init.method ?? 'GET', url, headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const path = url.replace(/^\.\//, '/').split('?')[0];
    let r: unknown = routes[`${call.method} ${path}`];
    if (typeof r === 'function') r = (r as (c: Call) => unknown)(call);
    if (r === undefined) r = { status: 404 };
    const res = r as { status?: number; json?: unknown };
    const status = res.status ?? 200;
    const json = 'json' in res ? res.json : r;
    return {
      ok: status >= 200 && status < 300, status,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => json, text: async () => JSON.stringify(json),
    } as unknown as Response;
  });
  return { fn, calls, find: (method: string, path: string) => calls.filter(c => c.method === method && c.url.replace(/^\.\//, '/').split('?')[0] === path) };
}
