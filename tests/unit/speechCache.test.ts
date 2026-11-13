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
  const c = new SpeechCache({ synthesize: async () => new Blob(['x']) } as unknown as TtsEngine, { save: async () => {}, load: async () => null });
  c.load(new Map([['v|a', new Blob(['x'])]]));
  expect(c.entries().size).toBe(1);
  c.clear();
  expect(c.entries().size).toBe(0);
});
