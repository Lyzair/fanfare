import { describe, expect, test, vi } from 'vitest';
import { zipSync, strToU8, unzipSync } from 'fflate';
import { exportArchive, importArchive, ImportError, MAX_IMPORT_BYTES } from '../../src/io/archive';
import type { AppState } from '../../src/domain/model';
import { defaultTemplates } from '../../src/i18n';

async function bytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await (b.arrayBuffer ? b.arrayBuffer() : new Response(b).arrayBuffer()));
}

function state(): AppState {
  return {
    version: 1, sport: 'football', lang: 'en', voiceId: 'v1', soundsEnabled: true, localTts: null,
    rosters: {
      football: {
        homeTeam: 'A', homeSayAs: 'Ay', homeOrigSpelling: 'Эй', homeNameLang: 'ru', opponent: 'B', opponentSayAs: 'Bee', opponentOrigSpelling: '', opponentNameLang: '', showPositions: true,
        players: [{ id: 'p1', name: 'Ann', number: '7', position: 'FW', onField: true, customText: null, sayAs: 'An', origSpelling: 'Анна', nameLang: 'ru' }],
        guestPlayers: [{ id: 'g1', name: 'Gus', number: '3', position: '', onField: false, customText: null, sayAs: 'Goose', origSpelling: '', nameLang: '' }],
        templates: defaultTemplates('football', 'en'),
      },
    },
    customSounds: { score: { name: 'goal.mp3', mime: 'audio/mpeg' } },
  };
}
const zipJson = (j: unknown, extra: Record<string, Uint8Array> = {}) =>
  new Blob([zipSync({ 'fanfare.json': strToU8(JSON.stringify(j)), ...extra }) as BlobPart]);

describe('archive', () => {
  test('round-trips state, custom sounds and speech clips', async () => {
    const s = state();
    const sound = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' });
    const clip = new Blob([new Uint8Array([9, 8])], { type: 'audio/wav' });
    const key = 'v1|Hello | world';
    const zip = await exportArchive({ state: s, sounds: { score: sound }, speech: new Map([[key, clip]]) });
    expect(zip.type).toBe('application/zip');
    const names = Object.keys(unzipSync(await bytes(zip)));
    expect(names).toContain('sounds/score.mp3');
    expect(names).toContain('speech/0.wav');
    const out = await importArchive(zip);
    expect(out.state).toEqual(s);
    expect(Array.from(await bytes(out.sounds.score!))).toEqual([1, 2, 3]);
    expect(out.sounds.score!.type).toBe('audio/mpeg');
    expect([...out.speech.keys()]).toEqual([key]);
    expect(Array.from(await bytes(out.speech.get(key)!))).toEqual([9, 8]);
  });

  test('rejects non-zip', async () => {
    await expect(importArchive(new Blob(['hello']))).rejects.toMatchObject({ code: 'not-zip' });
  });
  test('rejects zip without json', async () => {
    const b = new Blob([zipSync({ 'a.txt': strToU8('x') }) as BlobPart]);
    await expect(importArchive(b)).rejects.toMatchObject({ code: 'missing-json' });
  });
  test('rejects version 2', async () => {
    await expect(importArchive(zipJson({ ...state(), version: 2 }))).rejects.toMatchObject({ code: 'bad-version' });
  });
  test('rejects bad json', async () => {
    const b = new Blob([zipSync({ 'fanfare.json': strToU8('{nope') }) as BlobPart]);
    await expect(importArchive(b)).rejects.toMatchObject({ code: 'invalid-data' });
  });
  test('rejects unknown sport id / players not an array', async () => {
    await expect(importArchive(zipJson({ ...state(), sport: 'cricket' }))).rejects.toMatchObject({ code: 'invalid-data' });
    const s = state();
    (s.rosters.football as unknown as { players: unknown }).players = 'x';
    await expect(importArchive(zipJson(s))).rejects.toMatchObject({ code: 'invalid-data' });
  });
  test('rejects invalid voiceId, soundsEnabled, customSounds slot', async () => {
    await expect(importArchive(zipJson({ ...state(), voiceId: 3 }))).rejects.toMatchObject({ code: 'invalid-data' });
    await expect(importArchive(zipJson({ ...state(), soundsEnabled: 'y' }))).rejects.toMatchObject({ code: 'invalid-data' });
    await expect(importArchive(zipJson({ ...state(), customSounds: { other: { name: 'a', mime: 'b' } } }))).rejects.toMatchObject({ code: 'invalid-data' });
    await expect(importArchive(zipJson({ ...state(), customSounds: { score: { name: 1, mime: 'b' } } }))).rejects.toMatchObject({ code: 'invalid-data' });
  });
  test('rejects oversized file before reading it', async () => {
    const big = { size: MAX_IMPORT_BYTES + 1, arrayBuffer: vi.fn() } as unknown as Blob;
    await expect(importArchive(big)).rejects.toMatchObject({ code: 'too-large' });
    expect(big.arrayBuffer).not.toHaveBeenCalled();
  });
  test('ignores unexpected zip entries', async () => {
    const b = zipJson(state(), { 'evil/../x.js': strToU8('alert(1)'), 'speech/abc.wav': strToU8('x') });
    const out = await importArchive(b);
    expect(out.speech.size).toBe(0);
    expect(Object.keys(out.sounds)).toEqual([]);
  });
  test('sound without entry ignored; entry without file dropped', async () => {
    const s = state();
    s.customSounds = {};
    const out = await importArchive(zipJson(s, { 'sounds/intro.wav': strToU8('x') }));
    expect(out.sounds.intro).toBeUndefined();
    const out2 = await importArchive(zipJson(state()));
    expect(out2.state.customSounds).toEqual({});
  });
  test('fills missing templates, defaults, ids; drops unknown fields', async () => {
    const j = {
      version: 1, sport: 'football', lang: 'de', voiceId: 'v', soundsEnabled: false, extra: 1,
      rosters: { handball: { players: [{ name: 'x', number: '1', position: '', onField: false, customText: null, zzz: 1 }], templates: { intro: 'only' } } },
      customSounds: {},
    };
    const out = await importArchive(zipJson(j));
    expect(out.state).not.toHaveProperty('extra');
    const r = out.state.rosters.handball!;
    expect(r.homeTeam).toBe('');
    expect(r.opponent).toBe('');
    expect(r.homeSayAs).toBe('');
    expect(r.opponentSayAs).toBe('');
    expect(r.players[0].sayAs).toBe('');
    expect([r.players[0].origSpelling, r.players[0].nameLang, r.homeOrigSpelling, r.opponentNameLang]).toEqual(['', '', '', '']);
    expect(r.showPositions).toBe(false);
    expect(r.templates).toEqual(defaultTemplates('handball', 'de'));
    expect(r.guestPlayers).toEqual([]);
    expect(r.players[0].id).toMatch(/.+/);
    expect(r.players[0]).not.toHaveProperty('zzz');
  });
  test('guest players round-trip; old templates without guest keys get the defaults', async () => {
    const out = await importArchive(zipJson(state()));
    expect(out.state.rosters.football!.guestPlayers).toEqual(state().rosters.football!.guestPlayers);
    const j = state() as any;
    delete j.rosters.football.templates.guestIntro; delete j.rosters.football.templates.guestScore;
    const old = await importArchive(zipJson(j));
    expect(old.state.rosters.football!.templates).toEqual(defaultTemplates('football', 'en'));
  });
  test('invalid guest players are invalid-data', async () => {
    const j = state() as any;
    j.rosters.football.guestPlayers = [{ name: 5 }];
    await expect(importArchive(zipJson(j))).rejects.toMatchObject({ code: 'invalid-data' });
    j.rosters.football.guestPlayers = 'x';
    await expect(importArchive(zipJson(j))).rejects.toMatchObject({ code: 'invalid-data' });
  });
  test('non-string sayAs is invalid-data', async () => {
    for (const mutate of [
      (s: any) => { s.rosters.football.players[0].sayAs = 5; },
      (s: any) => { s.rosters.football.homeSayAs = 5; },
      (s: any) => { s.rosters.football.opponentSayAs = {}; },
    ]) {
      const s = state() as any;
      mutate(s);
      await expect(importArchive(zipJson(s))).rejects.toMatchObject({ code: 'invalid-data' });
    }
  });
  test('ImportError keeps name and instanceof', () => {
    const e = new ImportError('not-zip');
    expect(e).toBeInstanceOf(ImportError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ImportError');
  });
});

describe('archive hardening', () => {
  const player = (id: unknown, name: string) => ({ id, name, number: '', position: '', onField: true, customText: null });
  const withPlayers = (players: unknown[], guestPlayers: unknown[] = []) => {
    const s = state();
    return { ...s, customSounds: {}, rosters: { football: { ...s.rosters.football, players, guestPlayers } } };
  };

  test('a repeated player id within one list gets a fresh id', async () => {
    const out = await importArchive(zipJson(withPlayers([player('x', 'Ann'), player('x', 'Bea')])));
    const ps = out.state.rosters.football!.players;
    expect(ps[0].id).toBe('x');
    expect(ps[1].id).not.toBe('x');
    expect(ps[1].id).not.toBe('');
  });

  test('an id shared between home and guests gets a fresh id on the guest side', async () => {
    const out = await importArchive(zipJson(withPlayers([player('x', 'Ann')], [player('x', 'Gus'), player('', 'Hal')])));
    const r = out.state.rosters.football!;
    const ids = [...r.players, ...r.guestPlayers].map(p => p.id);
    expect(r.players[0].id).toBe('x');
    expect(new Set(ids).size).toBe(3);
    expect(ids.every(id => id !== '')).toBe(true);
  });

  test('entries outside the allow-list are never inflated', async () => {
    // 3 MB of zeros under a foreign name: with a 1 MB cap it would be "too large" if it were counted
    const out = await importArchive(zipJson(withPlayers([]), {
      'evil.bin': new Uint8Array(3 * 1024 * 1024), 'speech/../x.wav': new Uint8Array(4), 'sounds/other.mp3': new Uint8Array(4),
    }), { bytes: 1024 * 1024, entries: 10 });
    expect(out.speech.size).toBe(0);
    expect(out.sounds).toEqual({});
  });

  test('a small file that inflates past the cap is rejected as too large', async () => {
    const file = zipJson(withPlayers([]), { 'speech/0.wav': new Uint8Array(3 * 1024 * 1024) });
    expect(file.size).toBeLessThan(100 * 1024);
    await expect(importArchive(file, { bytes: 1024 * 1024, entries: 10 })).rejects.toMatchObject({ code: 'too-large' });
    // the default cap is far above this file
    await expect(importArchive(file)).resolves.toBeTruthy();
  });

  /** A zip whose `n` stored `speech/N.wav` entries all point at one shared data region and declare an original size of 0. */
  function sharedStoredZip(json: unknown, n: number, region: Uint8Array): Blob {
    const enc = (x: string) => strToU8(x);
    const local = (name: Uint8Array, data: Uint8Array) => {
      const h = new Uint8Array(30 + name.length + data.length);
      const v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true);
      v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, name.length, true);
      h.set(name, 30); h.set(data, 30 + name.length);
      return h;
    };
    const central = (name: Uint8Array, size: number, originalSize: number, offset: number) => {
      const h = new Uint8Array(46 + name.length);
      const v = new DataView(h.buffer);
      v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true);
      v.setUint32(20, size, true); v.setUint32(24, originalSize, true); v.setUint16(28, name.length, true);
      v.setUint32(42, offset, true);
      h.set(name, 46);
      return h;
    };
    const jsonData = enc(JSON.stringify(json));
    const l1 = local(enc('fanfare.json'), jsonData);
    const l2 = local(enc('speech/0.wav'), region);
    const dir = [central(enc('fanfare.json'), jsonData.length, jsonData.length, 0)];
    for (let i = 0; i < n; i++) dir.push(central(enc(`speech/${i}.wav`), region.length, 0, l1.length));
    const dirSize = dir.reduce((a, d) => a + d.length, 0);
    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true); v.setUint16(8, dir.length, true); v.setUint16(10, dir.length, true);
    v.setUint32(12, dirSize, true); v.setUint32(16, l1.length + l2.length, true);
    return new Blob([l1, l2, ...dir, end] as BlobPart[]);
  }

  test('stored entries that share one data region and declare size 0 count with the bytes they copy', async () => {
    const region = new Uint8Array(100 * 1024).fill(7);
    const speechIndex = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [String(i), `v|${i}`]));
    const file = sharedStoredZip({ ...withPlayers([]), speechIndex }, 200, region);
    expect(file.size).toBeLessThan(150 * 1024);
    // 200 x 100 KB = 20 MB would be copied
    await expect(importArchive(file, { bytes: 1024 * 1024, entries: 1000 })).rejects.toMatchObject({ code: 'too-large' });
    // the shape itself is readable: three such entries stay under the cap and import
    const small = await importArchive(sharedStoredZip({ ...withPlayers([]), speechIndex }, 3, region), { bytes: 1024 * 1024, entries: 1000 });
    expect(small.speech.size).toBe(3);
    expect((await bytes(small.speech.get('v|2')!)).length).toBe(region.length);
  });

  test('too many entries are rejected as too large', async () => {
    const extra: Record<string, Uint8Array> = {};
    for (let i = 0; i < 10; i++) extra[`speech/${i}.wav`] = new Uint8Array(1);
    await expect(importArchive(zipJson(withPlayers([]), extra), { bytes: 1024 * 1024, entries: 10 })).rejects.toMatchObject({ code: 'too-large' });
  });
});
