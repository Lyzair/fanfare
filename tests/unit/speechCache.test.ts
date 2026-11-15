import { SpeechCache } from '../../src/tts/speechCache';
import { TtsUnavailableError, type TtsEngine } from '../../src/tts/engine';
import { VOICES } from '../../src/tts/voices';
import { LANGS } from '../../src/i18n';
import { PATH_MAP } from '@mintplex-labs/piper-tts-web';

class FakeEngine implements TtsEngine {
  calls: Array<{ text: string; voiceId: string }> = [];
  fail = false;
  private release: (() => void) | null = null;
  gate: Promise<void> | null = null;

  hold(): void {
    this.gate = new Promise((r) => { this.release = r; });
  }
  open(): void {
    this.release?.();
  }

  async synthesize(text: string, voiceId: string): Promise<Blob> {
    this.calls.push({ text, voiceId });
    if (this.gate) await this.gate;
    if (this.fail) throw new Error('boom');
    return new Blob([`${voiceId}:${text}`], { type: 'audio/wav' });
  }
  async preload(): Promise<void> {}
}

function memStore() {
  const m = new Map<string, Blob>();
  return {
    m,
    async save(k: string, b: Blob) { m.set(k, b); },
    async load(k: string) { return m.get(k) ?? null; },
    async remove(k: string) { m.delete(k); },
    async keys() { return [...m.keys()]; },
  };
}

test('key is voice id and trimmed text', () => {
  expect(SpeechCache.key('v', '  Hallo Lea ')).toBe('v|Hallo Lea');
});

test('get synthesizes once then serves from memory', async () => {
  const e = new FakeEngine();
  const c = new SpeechCache(e, memStore());
  const a = await c.get('v', 'A');
  const b = await c.get('v', 'A');
  expect(e.calls).toHaveLength(1);
  expect(b).toBe(a);
  expect(c.has('v', 'A')).toBe(true);
  expect(c.has('v', 'B')).toBe(false);
});

test('synthesized clip is persisted to the store', async () => {
  const e = new FakeEngine();
  const s = memStore();
  const c = new SpeechCache(e, s);
  await c.get('v', ' A ');
  expect(s.m.has('v|A')).toBe(true);
  expect(e.calls[0].text).toBe('A');
});

test('falls back to store before engine', async () => {
  const e = new FakeEngine();
  const s = memStore();
  const stored = new Blob(['x'], { type: 'audio/wav' });
  s.m.set(SpeechCache.key('v', 'A'), stored);
  const c = new SpeechCache(e, s);
  expect(await c.get('v', 'A')).toBe(stored);
  expect(e.calls).toHaveLength(0);
  expect(c.has('v', 'A')).toBe(true);
});

test('concurrent gets for the same key share one synthesis', async () => {
  const e = new FakeEngine();
  e.hold();
  const c = new SpeechCache(e, memStore());
  const p1 = c.get('v', 'A');
  const p2 = c.get('v', 'A ');
  await Promise.resolve();
  e.open();
  const [a, b] = await Promise.all([p1, p2]);
  expect(a).toBe(b);
  expect(e.calls).toHaveLength(1);
});

test('editing text yields a new clip', async () => {
  const e = new FakeEngine();
  const c = new SpeechCache(e, memStore());
  const a = await c.get('v', 'A');
  const b = await c.get('v', 'A!');
  expect(e.calls).toHaveLength(2);
  expect(b).not.toBe(a);
});

test('a different voice yields a new clip', async () => {
  const e = new FakeEngine();
  const c = new SpeechCache(e, memStore());
  await c.get('v1', 'A');
  await c.get('v2', 'A');
  expect(e.calls).toHaveLength(2);
});

test('prepare dedupes and reports progress', async () => {
  const e = new FakeEngine();
  const c = new SpeechCache(e, memStore());
  const progress: Array<[number, number]> = [];
  await c.prepare('v', ['a', 'a', 'b'], (d, t) => progress.push([d, t]));
  expect(progress).toEqual([[1, 2], [2, 2]]);
  expect(e.calls.map((x) => x.text)).toEqual(['a', 'b']);
});

test('prepare runs sequentially', async () => {
  const e = new FakeEngine();
  e.hold();
  const c = new SpeechCache(e, memStore());
  const p = c.prepare('v', ['a', 'b'], () => {});
  await new Promise((r) => setTimeout(r, 0));
  expect(e.calls).toHaveLength(1);
  e.open();
  await p;
  expect(e.calls).toHaveLength(2);
});

test('engine failure rejects get with TtsUnavailableError and caches nothing', async () => {
  const e = new FakeEngine();
  e.fail = true;
  const s = memStore();
  const c = new SpeechCache(e, s);
  await expect(c.get('v', 'A')).rejects.toBeInstanceOf(TtsUnavailableError);
  expect(c.has('v', 'A')).toBe(false);
  expect(s.m.size).toBe(0);
  e.fail = false;
  await c.get('v', 'A');
  expect(e.calls).toHaveLength(2);
});

test('entries and load round-trip clips', async () => {
  const e = new FakeEngine();
  const c = new SpeechCache(e, memStore());
  await c.get('v', 'A');
  const exported = c.entries();
  const c2 = new SpeechCache(new FakeEngine(), memStore());
  c2.load(exported);
  expect(c2.has('v', 'A')).toBe(true);
  expect(await c2.get('v', 'A')).toBe(exported.get('v|A'));
});

test('every language has a voice', () => {
  for (const lang of LANGS) {
    expect(VOICES.some((v) => v.lang === lang), lang).toBe(true);
  }
});

test('every voice is known to the piper library and has a licence', () => {
  for (const v of VOICES) {
    expect(PATH_MAP[v.id as keyof typeof PATH_MAP], v.id).toBeTruthy();
    expect(v.license).not.toBe('unverified');
  }
});

test('clear forgets in-memory clips', () => {
  const c = new SpeechCache({ synthesize: async () => new Blob(['x']) } as unknown as TtsEngine, { save: async () => {}, load: async () => null, remove: async () => {}, keys: async () => [] });
  c.load(new Map([['v|a', new Blob(['x'])]]));
  expect(c.entries().size).toBe(1);
  c.clear();
  expect(c.entries().size).toBe(0);
});

test('replace swaps all in-memory clips', () => {
  const c = new SpeechCache({ synthesize: async () => new Blob(['x']) } as unknown as TtsEngine, { save: async () => {}, load: async () => null, remove: async () => {}, keys: async () => [] });
  c.load(new Map([['v|a', new Blob(['x'])]]));
  c.replace(new Map([['v|b', new Blob(['y'])]]));
  expect([...c.entries().keys()]).toEqual(['v|b']);
});

test('evict removes a clip from memory and storage, so the next get synthesizes again', async () => {
  const e = new FakeEngine();
  const s = memStore();
  const c = new SpeechCache(e, s);
  await c.get('v', 'Hallo');
  expect(c.has('v', 'Hallo')).toBe(true);
  expect(s.m.size).toBe(1);
  await c.evict('v', ' Hallo ');
  expect(c.has('v', 'Hallo')).toBe(false);
  expect(s.m.size).toBe(0);
  await c.get('v', 'Hallo');
  expect(e.calls).toHaveLength(2);
  expect(c.has('v', 'Hallo')).toBe(true);
});

test('evict waits for a running synthesis and still removes its result', async () => {
  const e = new FakeEngine();
  const s = memStore();
  const c = new SpeechCache(e, s);
  e.hold();
  const first = c.get('v', 'Hallo');
  const ev = c.evict('v', 'Hallo');
  e.open();
  await first;
  await ev;
  expect(c.has('v', 'Hallo')).toBe(false);
  expect(s.m.size).toBe(0);
});

test('evict leaves other clips alone and survives a failing store', async () => {
  const e = new FakeEngine();
  const s = { ...memStore(), async remove() { throw new Error('idb'); } };
  const c = new SpeechCache(e, s);
  await c.get('v', 'A');
  await c.get('v', 'B');
  await c.evict('v', 'A');
  expect(c.has('v', 'A')).toBe(false);
  expect(c.has('v', 'B')).toBe(true);
});

test('regenerate replaces the clip only on success; a failing engine keeps the old clip', async () => {
  const e = new FakeEngine();
  const s = memStore();
  const c = new SpeechCache(e, s);
  const old = await c.get('v', 'Hallo');
  e.fail = true;
  await expect(c.regenerate('v', 'Hallo')).rejects.toBeInstanceOf(TtsUnavailableError);
  expect(c.has('v', 'Hallo')).toBe(true);
  expect(await c.get('v', 'Hallo')).toBe(old);
  expect(s.m.get('v|Hallo')).toBe(old);
  e.fail = false;
  const fresh = await c.regenerate('v', ' Hallo ');
  expect(fresh).not.toBe(old);
  expect(await c.get('v', 'Hallo')).toBe(fresh);
  expect(s.m.get('v|Hallo')).toBe(fresh);
});

const flush = () => new Promise(r => setTimeout(r, 0));

test('hydrate loads every stored clip, so has/entries see them after a reload', async () => {
  const s = memStore();
  const first = new SpeechCache(new FakeEngine(), s);
  await first.get('v', 'A');
  await first.get('v', 'B');
  // "reload": a new cache over the same storage
  const e = new FakeEngine();
  const c = new SpeechCache(e, s);
  expect(c.has('v', 'A')).toBe(false);
  await c.hydrate();
  expect(c.has('v', 'A')).toBe(true);
  expect([...c.entries().keys()].sort()).toEqual(['v|A', 'v|B']);
  expect(e.calls).toHaveLength(0);
});

test('hydrate survives a failing store and never replaces a newer clip in memory', async () => {
  const broken = { ...memStore(), async keys(): Promise<string[]> { throw new Error('idb'); } };
  await expect(new SpeechCache(new FakeEngine(), broken).hydrate()).resolves.toBeUndefined();
  const s = memStore();
  s.m.set('v|A', new Blob(['old']));
  const c = new SpeechCache(new FakeEngine(), s);
  const fresh = await c.regenerate('v', 'A');
  await c.hydrate();
  expect(await c.get('v', 'A')).toBe(fresh);
});

test('replace prunes stored clips that are not in the new set', async () => {
  const s = memStore();
  const c = new SpeechCache(new FakeEngine(), s);
  await c.get('v', 'Old team');
  const kept = new Blob(['k']);
  c.replace(new Map([['v|New team', kept]]));
  await flush();
  expect([...s.m.keys()]).toEqual(['v|New team']);
  // after a reload the previous team's clip does not come back
  const again = new SpeechCache(new FakeEngine(), s);
  await again.hydrate();
  expect([...again.entries().keys()]).toEqual(['v|New team']);
});

test('clear during a running synthesis keeps the clip out of memory and storage', async () => {
  const e = new FakeEngine();
  const s = memStore();
  const c = new SpeechCache(e, s);
  e.hold();
  const running = c.get('v', 'Lea');
  await flush(); // the store lookup is done, the engine is working
  c.clear();
  s.m.clear(); // what clearAll() does
  e.open();
  await running;
  await flush();
  expect(c.has('v', 'Lea')).toBe(false);
  expect(c.entries().size).toBe(0);
  expect(s.m.size).toBe(0);
});

test('clear during regenerate and replace during a get drop the late result too', async () => {
  const e = new FakeEngine();
  const s = memStore();
  const c = new SpeechCache(e, s);
  e.hold();
  const regen = c.regenerate('v', 'Lea');
  await flush();
  c.clear();
  const get = c.get('v', 'Tom');
  await flush();
  c.replace(new Map());
  e.open();
  await Promise.all([regen, get]);
  await flush();
  expect(c.entries().size).toBe(0);
  expect(s.m.size).toBe(0);
});

test('prepare stops after clear: no further clips are made', async () => {
  const e = new FakeEngine();
  const s = memStore();
  const c = new SpeechCache(e, s);
  e.hold();
  const run = c.prepare('v', ['A', 'B', 'C'], () => undefined);
  await flush();
  c.clear();
  e.open();
  await run;
  await flush();
  expect(e.calls.map(x => x.text)).toEqual(['A']);
  expect(s.m.size).toBe(0);
});

test('a get started after clear is not removed from pending by the cleared one', async () => {
  const e = new FakeEngine();
  const c = new SpeechCache(e, memStore());
  e.hold();
  const before = c.get('v', 'A');
  await flush();
  c.clear();
  const after1 = c.get('v', 'A');
  await flush();
  e.open();
  await before;
  const after2 = c.get('v', 'A'); // still the same running request, not a third synthesis
  await Promise.all([after1, after2]);
  expect(e.calls).toHaveLength(2);
});

test('a storage write that is under way when the cache is cleared is undone', async () => {
  const s = memStore();
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const slow = { ...s, async save(k: string, b: Blob) { await gate; s.m.set(k, b); } };
  const c = new SpeechCache(new FakeEngine(), slow);
  const running = c.get('v', 'Lea'); // synthesized, now writing
  await flush();
  c.clear();
  s.m.clear(); // clearAll()
  release();
  await running;
  await flush();
  expect(s.m.size).toBe(0);
  expect(c.entries().size).toBe(0);
});
