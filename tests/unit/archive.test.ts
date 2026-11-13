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
    version: 1, sport: 'football', lang: 'en', voiceId: 'v1', soundsEnabled: true,
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
