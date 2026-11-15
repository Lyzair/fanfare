import { AudioQueue, type AudioLike } from '../../src/audio/queue';

class FakeAudio implements AudioLike {
  src = '';
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  played: string[] = [];
  pauses = 0;
  rejectNext = false;
  play(): Promise<void> {
    this.played.push(this.src);
    if (this.rejectNext) {
      this.rejectNext = false;
      return Promise.reject(new Error('NotAllowedError'));
    }
    return Promise.resolve();
  }
  pause() {
    this.pauses++;
  }
  end() {
    this.onended?.();
  }
}

function setup() {
  const audio = new FakeAudio();
  const created: string[] = [];
  const revoked: string[] = [];
  let n = 0;
  const urls = {
    create: () => {
      const u = `blob:${++n}`;
      created.push(u);
      return u;
    },
    revoke: (u: string) => void revoked.push(u),
  };
  const q = new AudioQueue(() => audio, urls);
  return { audio, q, created, revoked };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const blob = () => new Blob(['x']);

test('plays items in order', async () => {
  const { audio, q } = setup();
  const p = q.play([blob(), blob(), blob()]);
  await tick();
  expect(audio.played).toHaveLength(1);
  audio.end();
  await tick();
  expect(audio.played).toHaveLength(2);
  audio.end();
  await tick();
  audio.end();
  await p;
  expect(audio.played).toHaveLength(3);
  expect(new Set(audio.played).size).toBe(3);
});

test('new play() stops the current sequence', async () => {
  const { audio, q } = setup();
  const p1 = q.play([blob(), blob(), blob()]);
  await tick();
  const first = audio.played[0];
  const p2 = q.play([blob()]);
  await p1;
  await tick();
  expect(audio.pauses).toBeGreaterThan(0);
  expect(audio.played).toHaveLength(2);
  expect(audio.played[1]).not.toBe(first);
  audio.end();
  await p2;
  expect(audio.played).toHaveLength(2);
});

test('stop() pauses and revokes object URLs', async () => {
  const { audio, q, created, revoked } = setup();
  const p = q.play([blob(), blob()]);
  await tick();
  q.stop();
  await p;
  expect(audio.pauses).toBeGreaterThan(0);
  expect(created).toHaveLength(1);
  expect(revoked).toEqual(created);
  expect(q.playing).toBe(false);
});

test('lazy item is resolved only when its turn comes', async () => {
  const { audio, q } = setup();
  const factory = vi.fn(async () => blob());
  const p = q.play([blob(), factory]);
  await tick();
  expect(factory).not.toHaveBeenCalled();
  audio.end();
  await tick();
  expect(factory).toHaveBeenCalledTimes(1);
  expect(audio.played).toHaveLength(2);
  audio.end();
  await p;
});

test('a failing item is skipped, the rest still plays', async () => {
  const { audio, q } = setup();
  const p = q.play([async () => { throw new Error('tts'); }, blob(), blob()]);
  await tick();
  expect(audio.played).toHaveLength(1);
  audio.onerror?.();
  await tick();
  expect(audio.played).toHaveLength(2);
  audio.end();
  await p;
});

test('rejected element play() is skipped', async () => {
  const { audio, q, created, revoked } = setup();
  audio.rejectNext = true;
  const p = q.play([blob(), blob()]);
  await tick();
  expect(audio.played).toHaveLength(2);
  audio.end();
  await p;
  expect(revoked.sort()).toEqual(created.sort());
});

test('every URL revoked exactly once', async () => {
  const { audio, q, created, revoked } = setup();
  const p = q.play([blob(), blob(), blob()]);
  await tick();
  audio.end();
  await tick();
  audio.onerror?.();
  await tick();
  q.stop();
  await p;
  expect(created).toHaveLength(3);
  expect([...revoked].sort()).toEqual([...created].sort());
});

test('unlock() calls play synchronously, only once', async () => {
  const { audio, q, revoked } = setup();
  q.unlock();
  expect(audio.played).toHaveLength(1);
  q.unlock();
  expect(audio.played).toHaveLength(1);
  await tick();
  expect(revoked).toHaveLength(1);
});

test('unlock() swallows play rejection', async () => {
  const { audio, q } = setup();
  audio.rejectNext = true;
  q.unlock();
  await tick();
});

test('subscribers hear true then false', async () => {
  const { audio, q } = setup();
  const calls: boolean[] = [];
  q.subscribe((v) => calls.push(v));
  const p = q.play([blob()]);
  await tick();
  expect(q.playing).toBe(true);
  audio.end();
  await p;
  expect(calls).toEqual([true, false]);
  expect(q.playing).toBe(false);
});

test('replaced sequence never reports false while the new one runs', async () => {
  const { audio, q } = setup();
  const calls: boolean[] = [];
  q.subscribe((v) => calls.push(v));
  const p1 = q.play([blob(), blob()]);
  await tick();
  const p2 = q.play([blob()]);
  await p1;
  await tick();
  expect(q.playing).toBe(true);
  expect(calls).toEqual([true]);
  audio.end();
  await p2;
  expect(calls).toEqual([true, false]);
});

test('every subscriber is told, and an unsubscribed one no longer', async () => {
  const { audio, q } = setup();
  const a: boolean[] = [], b: boolean[] = [];
  const offA = q.subscribe((v) => a.push(v));
  q.subscribe((v) => b.push(v));
  const p = q.play([blob()]);
  await tick();
  offA();
  audio.end();
  await p;
  expect(a).toEqual([true]);
  expect(b).toEqual([true, false]);
});
