import { useContext, useState } from 'preact/hooks';
import type { AppState } from '../domain/model';
import type { ActionEnv } from './actions';
import { useCustomSoundBlob } from './soundMemory';
import { ServicesContext } from './types';
import { useQueuePlaying } from './useQueuePlaying';

/**
 * What a panel needs to play something: the environment for the functions in `actions.ts` (queue,
 * speech, the user's custom sounds), whether the queue is playing, and the last speech error.
 * Null while there are no services (never inside the app).
 */
export function usePlayback(state: AppState) {
  const services = useContext(ServicesContext);
  const score = useCustomSoundBlob('score', state.customSounds.score);
  const intro = useCustomSoundBlob('intro', state.customSounds.intro);
  const playing = useQueuePlaying(services?.queue);
  const [error, setError] = useState<unknown>(null);
  if (!services) return null;
  const env: ActionEnv = {
    state, queue: services.queue, speech: services.speech, blobs: { score, intro },
    onStart: () => setError(null), onError: e => setError(e ?? true),
  };
  return { env, playing, error, setError, speech: services.speech };
}
