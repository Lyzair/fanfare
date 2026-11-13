import { useEffect, useState } from 'preact/hooks';
import type { CustomSound, SoundSlot } from '../domain/model';
import { loadSoundBlob } from '../state/persist';

/**
 * Custom sounds uploaded this session. Keeps them usable when persistent
 * storage is unavailable (e.g. private mode); storage stays the source of truth otherwise.
 */
const memory = new Map<SoundSlot, Blob>();

export const rememberSound = (slot: SoundSlot, blob: Blob | null) => {
  if (blob) memory.set(slot, blob); else memory.delete(slot);
};

export const recalledSound = (slot: SoundSlot): Blob | undefined => memory.get(slot);

/**
 * The user's custom blob for a slot, or null (use the default). Reloads whenever
 * the CustomSound object changes (the reducer makes a new one on every upload).
 */
export function useCustomSoundBlob(slot: SoundSlot, custom: CustomSound | undefined): Blob | null {
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    let cancelled = false;
    const mem = memory.get(slot);
    setBlob(custom ? mem ?? null : null);
    if (custom && !mem) {
      loadSoundBlob(slot).then(b => { if (!cancelled) setBlob(b); }, () => { /* fall back to default */ });
    }
    return () => { cancelled = true; };
  }, [slot, custom]);
  return blob;
}
