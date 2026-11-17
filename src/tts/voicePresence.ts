import { useEffect, useState } from 'preact/hooks';
import { LOCAL_PREFIX } from './routingEngine';
import { voicePath } from './voices';

/**
 * Downloads of Fanfare may leave out voices (one package per language, one without voices).
 * A voice counts as missing only on a definite 404 for its small model card: offline, or on a
 * network error (the voice may already be cached) or any other status lets the engine decide.
 */
const known = new Map<string, Promise<boolean>>();

export function isVoicePresent(id: string, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<boolean> {
  // offline nothing is asked (it could only fail); the answer is not remembered
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(true);
  let p = known.get(id);
  if (!p) {
    // a plain GET of the small model card (the page only ever sends GET requests for its files)
    p = Promise.resolve()
      .then(() => fetchFn(`./voices/${voicePath(id)}.json`, { cache: 'no-store' }))
      .then(r => r?.status !== 404, () => true);
    known.set(id, p);
  }
  return p;
}

/** Forget remembered answers (tests). */
export function resetVoicePresence(): void {
  known.clear();
}

/** null while checking; voices of the user's own voice server always count as present. */
export function useVoicePresent(voiceId: string): boolean | null {
  const local = voiceId.startsWith(LOCAL_PREFIX);
  const [present, setPresent] = useState<boolean | null>(local ? true : null);
  useEffect(() => {
    if (local) { setPresent(true); return; }
    let live = true;
    setPresent(null);
    void isVoicePresent(voiceId).then(ok => { if (live) setPresent(ok); });
    return () => { live = false; };
  }, [voiceId, local]);
  return present;
}
