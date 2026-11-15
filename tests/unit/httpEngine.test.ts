import { HttpTtsEngine, LocalAccessError, LOCAL_TTS_DEFAULT_URL, isLocalUrl } from '../../src/tts/httpEngine';
import { RoutingEngine } from '../../src/tts/routingEngine';
import { TtsUnavailableError, type TtsEngine } from '../../src/tts/engine';
import { initialState, reducer } from '../../src/state/reducer';
import { exportArchive, importArchive, ImportError } from '../../src/io/archive';

const BASE = 'http://127.0.0.1:5123';
const ORIGIN = 'https://club.example';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
const audio = (type = 'audio/wav') => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': type } });
const text = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain' } });

function engine(fn: (url: string, init?: RequestInit) => Promise<Response>, base = BASE) {
  const fetchFn = vi.fn(fn) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  return { e: new HttpTtsEngine(base, fetchFn, ORIGIN), fetchFn: fetchFn as unknown as ReturnType<typeof vi.fn> };
}

test('isLocalUrl', () => {
  expect(['http://localhost:5123', 'http://127.0.0.1:8000', 'https://localhost:1', 'http://localhost'].every(isLocalUrl)).toBe(true);
  expect(['http://192.168.1.5:5123', 'https://example.com', 'http://localhost.evil.com', 'http://user:pw@localhost:1',
    'http://localhost:1/x?y', 'file:///x', 'http://localhost:1/x', 'http://localhost:1?y', 'http://localhost:1#z', 'nonsense', '', 'http://[::1]:1']
    .some(isLocalUrl)).toBe(false);
  expect(isLocalUrl('http://localhost:5123/')).toBe(true); // a bare trailing slash is just the root
  expect(isLocalUrl(LOCAL_TTS_DEFAULT_URL)).toBe(true);
});

test('listVoices parses, filters to known LANGS, sends X-Fanfare and has a 5 s timeout signal', async () => {
  const { e, fetchFn } = engine(async () => json([
    { id: 'de-high', lang: 'de', label: 'German (high quality)' },
    { id: 'xx', lang: 'xx', label: 'Unknown language' },
    { id: 'club-1', lang: 'en', label: 'Club' },
    { nope: true },
  ]));
  expect(await e.listVoices()).toEqual([
    { id: 'de-high', lang: 'de', label: 'German (high quality)' },
    { id: 'club-1', lang: 'en', label: 'Club' },
  ]);
  const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(`${BASE}/voices`);
  expect((init.headers as Record<string, string>)['X-Fanfare']).toBe('1');
  expect(init.signal).toBeInstanceOf(AbortSignal);
});

test('a trailing slash on the base URL does not double up', async () => {
  const { e, fetchFn } = engine(async () => json([]), `${BASE}/`);
  await e.listVoices();
  expect(fetchFn.mock.calls[0][0]).toBe(`${BASE}/voices`);
});

test('synthesize POSTs JSON and returns the audio blob', async () => {
  const { e, fetchFn } = engine(async () => audio());
  const blob = await e.synthesize('Hallo Lea', 'de-high');
  expect(blob.type).toBe('audio/wav');
  expect(blob.size).toBe(3);
  const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(`${BASE}/synthesize`);
  expect(init.method).toBe('POST');
  const headers = init.headers as Record<string, string>;
  expect(headers['Content-Type']).toBe('application/json');
  expect(headers['X-Fanfare']).toBe('1');
  expect(JSON.parse(init.body as string)).toEqual({ text: 'Hallo Lea', voice: 'de-high' });
});

test('non-2xx responses become TtsUnavailableError carrying the server message', async () => {
  const { e } = engine(async () => text('unknown voice', 404));
  await expect(e.synthesize('x', 'nope')).rejects.toThrow(/unknown voice/);
  await expect(e.synthesize('x', 'nope')).rejects.toBeInstanceOf(TtsUnavailableError);
});

test('a response that is not audio is rejected', async () => {
  const { e } = engine(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }));
  await expect(e.synthesize('x', 'v')).rejects.toThrow(/audio/i);
});

test('403 and a network/CORS failure explain how to allow this website, with origin and command', async () => {
  for (const fn of [async () => text('forbidden', 403), async () => { throw new TypeError('Failed to fetch'); }]) {
    const { e } = engine(fn);
    for (const call of [() => e.listVoices(), () => e.synthesize('x', 'v')]) {
      const err = await call().then(() => null, (x: unknown) => x);
      expect(err).toBeInstanceOf(LocalAccessError);
      const a = err as LocalAccessError;
      expect(a).toBeInstanceOf(TtsUnavailableError);
      expect(a.origin).toBe(ORIGIN);
      expect(a.command).toBe(`fanfare-studio allow ${ORIGIN}`);
      expect(a.message).toContain(ORIGIN);
      expect(a.message).toContain('fanfare-studio allow https://club.example');
    }
  }
});

test('a timeout aborts the request and says so', async () => {
  vi.useFakeTimers();
  try {
    const { e } = engine((_u, init) => new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    }));
    const p = e.listVoices();
    const assertion = expect(p).rejects.toThrow(/did not answer within 5 seconds/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    const q = e.synthesize('x', 'v');
    const assertion2 = expect(q).rejects.toThrow(/120 seconds/);
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion2;
  } finally {
    vi.useRealTimers();
  }
});

test('uploadReference sends multipart with consent=true to the local URL only; deleteReference DELETEs', async () => {
  const { e, fetchFn } = engine(async (_u, init) => (init?.method === 'DELETE'
    ? new Response(null, { status: 204 })
    : json({ id: 'club-1a2b', lang: 'de', label: 'Max', warnings: ['very quiet'] }, { status: 201 })));
  const voice = await e.uploadReference(new Blob(['raw'], { type: 'audio/webm' }), { name: 'Max', lang: 'de' });
  expect(voice).toEqual({ id: 'club-1a2b', lang: 'de', label: 'Max', warnings: ['very quiet'] });
  const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(`${BASE}/references`);
  expect(init.method).toBe('POST');
  expect((init.headers as Record<string, string>)['X-Fanfare']).toBe('1');
  expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined(); // the browser sets the boundary
  const form = init.body as FormData;
  expect(form.get('consent')).toBe('true');
  expect(form.get('name')).toBe('Max');
  expect(form.get('lang')).toBe('de');
  expect((form.get('audio') as File).size).toBe(3);

  await e.deleteReference('club-1a2b');
  const [durl, dinit] = fetchFn.mock.calls[1] as [string, RequestInit];
  expect(durl).toBe(`${BASE}/references/club-1a2b`);
  expect(dinit.method).toBe('DELETE');
  expect((dinit.headers as Record<string, string>)['X-Fanfare']).toBe('1');
});

test('a rejected upload surfaces the server message', async () => {
  const { e } = engine(async () => text('consent must be true', 400));
  await expect(e.uploadReference(new Blob(['x']), { name: 'a', lang: 'de' })).rejects.toThrow(/consent must be true/);
});

class Fake implements TtsEngine {
  calls: Array<[string, string]> = [];
  preloads: string[] = [];
  private readonly tag: string;
  constructor(tag: string) { this.tag = tag; }
  async synthesize(t: string, v: string) { this.calls.push([t, v]); return new Blob([this.tag]); }
  async preload(v: string) { this.preloads.push(v); }
}

test('RoutingEngine sends local: ids to the http engine (prefix stripped) and others to piper', async () => {
  const piper = new Fake('piper');
  const local = new Fake('local');
  const r = new RoutingEngine(piper, () => local as unknown as HttpTtsEngine);
  expect(await (await r.synthesize('a', 'local:de-high')).text()).toBe('local');
  expect(local.calls).toEqual([['a', 'de-high']]);
  expect(await (await r.synthesize('b', 'de_DE-thorsten-medium')).text()).toBe('piper');
  expect(piper.calls).toEqual([['b', 'de_DE-thorsten-medium']]);
  await r.preload('local:de-high');
  await r.preload('de_DE-thorsten-medium');
  expect(piper.preloads).toEqual(['de_DE-thorsten-medium']);
});

test('RoutingEngine with a local voice but no server configured → TtsUnavailableError', async () => {
  const r = new RoutingEngine(new Fake('piper'), () => null);
  await expect(r.synthesize('a', 'local:de-high')).rejects.toBeInstanceOf(TtsUnavailableError);
});

test('setLocalTts ignores non-local URLs and disconnecting drops a local voice', () => {
  const s0 = initialState('en');
  expect(s0.localTts).toBeNull();
  const s1 = reducer(s0, { type: 'setLocalTts', url: 'http://127.0.0.1:5123' });
  expect(s1.localTts).toEqual({ url: 'http://127.0.0.1:5123' });
  expect(reducer(s1, { type: 'setLocalTts', url: 'https://evil.example' })).toBe(s1);
  const s2 = reducer(s1, { type: 'setVoice', voiceId: 'local:de-high' });
  const s3 = reducer(s2, { type: 'setLocalTts', url: null });
  expect(s3.localTts).toBeNull();
  expect(s3.voiceId.startsWith('local:')).toBe(false);
  expect(reducer(s0, { type: 'replaceAll', state: { ...s1, localTts: { url: 'http://evil.example' } } }).localTts).toBeNull();
  expect(reducer(s0, { type: 'replaceAll', state: { ...s1, localTts: undefined } as never }).localTts).toBeNull();
});

test('archive round-trips localTts; an old archive without it gives null; a non-local url is invalid-data', async () => {
  const s = reducer(initialState('en'), { type: 'setLocalTts', url: 'http://localhost:5123' });
  const back = await importArchive(await exportArchive({ state: s, sounds: {}, speech: new Map() }));
  expect(back.state.localTts).toEqual({ url: 'http://localhost:5123' });

  const { localTts: _drop, ...old } = initialState('en');
  const oldZip = await exportArchive({ state: old as never, sounds: {}, speech: new Map() });
  expect((await importArchive(oldZip)).state.localTts).toBeNull();

  const evil = await exportArchive({ state: { ...s, localTts: { url: 'http://192.168.1.5:5123' } }, sounds: {}, speech: new Map() });
  await expect(importArchive(evil)).rejects.toMatchObject({ code: 'invalid-data' });
  await expect(importArchive(evil)).rejects.toBeInstanceOf(ImportError);
});
