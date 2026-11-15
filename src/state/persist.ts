import { clear, createStore, del, get, keys, set } from 'idb-keyval';
import type { AppState, SoundSlot } from '../domain/model';
import { blobBytes } from '../io/blob';

const store = createStore('fanfare', 'kv');

// Blobs are stored as { type, bytes } because structured clone of Blob is
// unreliable in some environments; the public API still uses Blob.
interface StoredBlob { type: string; bytes: ArrayBuffer }

async function putBlob(key: string, b: Blob): Promise<void> {
  const stored: StoredBlob = { type: b.type, bytes: await blobBytes(b) };
  await set(key, stored, store);
}

async function getBlob(key: string): Promise<Blob | null> {
  const v = (await get(key, store)) as unknown;
  if (v instanceof Blob) return v;
  if (v && typeof v === 'object' && 'bytes' in v && 'type' in v) {
    const s = v as StoredBlob;
    return new Blob([s.bytes], { type: s.type });
  }
  return null;
}

export async function loadState(): Promise<AppState | null> {
  const v = (await get('state', store)) as unknown;
  if (v && typeof v === 'object' && (v as { version?: unknown }).version === 1) {
    return v as AppState;
  }
  return null;
}

export async function saveState(s: AppState): Promise<void> {
  await set('state', s, store);
}

export async function saveSoundBlob(slot: SoundSlot, b: Blob | null): Promise<void> {
  if (b === null) await del(`sound:${slot}`, store);
  else await putBlob(`sound:${slot}`, b);
}

export function loadSoundBlob(slot: SoundSlot): Promise<Blob | null> {
  return getBlob(`sound:${slot}`);
}

export function saveSpeech(key: string, b: Blob): Promise<void> {
  return putBlob(`speech:${key}`, b);
}

export function loadSpeech(key: string): Promise<Blob | null> {
  return getBlob(`speech:${key}`);
}

export async function deleteSpeech(key: string): Promise<void> {
  await del(`speech:${key}`, store);
}

export async function listSpeechKeys(): Promise<string[]> {
  const all = await keys(store);
  return all
    .filter((k): k is string => typeof k === 'string' && k.startsWith('speech:'))
    .map((k) => k.slice('speech:'.length));
}

export async function clearAll(): Promise<void> {
  await clear(store);
}
