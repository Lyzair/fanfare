import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAll, listSpeechKeys, loadSoundBlob, loadSpeech, loadState,
  saveSoundBlob, saveSpeech, saveState,
} from '../../src/state/persist';
import { set, createStore } from 'idb-keyval';
import type { AppState } from '../../src/domain/model';

async function text(b: Blob | null): Promise<string | null> {
  if (!b) return null;
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsText(b);
  });
}

beforeEach(async () => { await clearAll(); });

describe('persist', () => {
  it('returns null when nothing stored', async () => {
    expect(await loadState()).toBeNull();
  });
  it('round-trips state', async () => {
    const s = { version: 1, foo: 'bar' } as unknown as AppState;
    await saveState(s);
    expect(await loadState()).toEqual(s);
  });
  it('loads version 2 as null', async () => {
    await saveState({ version: 2 } as unknown as AppState);
    expect(await loadState()).toBeNull();
  });
  it('loads garbage as null', async () => {
    await set('state', 'garbage', createStore('sports-caller', 'kv'));
    expect(await loadState()).toBeNull();
  });
  it('round-trips and deletes sound blobs', async () => {
    await saveSoundBlob('score', new Blob(['abc'], { type: 'audio/mpeg' }));
    const b = await loadSoundBlob('score');
    expect(b?.type).toBe('audio/mpeg');
    expect(await text(b)).toBe('abc');
    await saveSoundBlob('score', null);
    expect(await loadSoundBlob('score')).toBeNull();
  });
  it('round-trips speech and lists keys', async () => {
    await saveSpeech('a', new Blob(['x'], { type: 'audio/wav' }));
    await saveSpeech('b', new Blob(['y']));
    expect(await text(await loadSpeech('a'))).toBe('x');
    expect((await listSpeechKeys()).sort()).toEqual(['a', 'b']);
    expect(await loadSpeech('zzz')).toBeNull();
  });
  it('clearAll empties everything', async () => {
    await saveState({ version: 1 } as unknown as AppState);
    await saveSoundBlob('intro', new Blob(['q']));
    await saveSpeech('a', new Blob(['x']));
    await clearAll();
    expect(await loadState()).toBeNull();
    expect(await loadSoundBlob('intro')).toBeNull();
    expect(await listSpeechKeys()).toEqual([]);
  });
});
