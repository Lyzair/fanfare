import { useEffect, useRef, useState } from 'preact/hooks';
import type { SpeechCache } from '../tts/speechCache';

/**
 * "Prepare voices": makes every clip of `texts` ahead of the game. One run at a time; `done` is true
 * only while the voice and the texts are still the ones that were prepared and every clip is there
 * (a run ends early, without an error, when an import or "Delete all" replaces the clips under it).
 */
export function usePrepare(speech: Pick<SpeechCache, 'prepare' | 'has'> | undefined, voiceId: string, texts: string[], onError: (e: unknown) => void) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const key = `${voiceId}\n${texts.map(x => x.trim()).join('\n')}`;
  const start = () => {
    if (preparing || !speech) return;
    const safe = (fn: () => void) => { if (mounted.current) fn(); };
    setDoneKey(null);
    setPreparing(true);
    setProgress({ done: 0, total: new Set(texts.map(x => x.trim())).size });
    speech.prepare(voiceId, texts, (done, total) => safe(() => setProgress({ done, total })))
      .then(() => safe(() => setDoneKey(key)), (e: unknown) => safe(() => onError(e)))
      .finally(() => safe(() => { setPreparing(false); setProgress(null); }));
  };
  const allReady = () => !!speech && texts.every(x => !x.trim() || speech.has(voiceId, x));
  return { preparing, progress, done: !preparing && doneKey === key && allReady(), start };
}
