import { TtsUnavailableError, type TtsEngine } from './engine';
import type { HttpTtsEngine } from './httpEngine';

export const LOCAL_PREFIX = 'local:';

/** Voice ids starting with "local:" go to the user's own voice server, everything else to Piper. */
export class RoutingEngine implements TtsEngine {
  private readonly piper: TtsEngine;
  private readonly getLocal: () => HttpTtsEngine | null;

  constructor(piper: TtsEngine, getLocal: () => HttpTtsEngine | null) {
    this.piper = piper;
    this.getLocal = getLocal;
  }

  synthesize(text: string, voiceId: string): Promise<Blob> {
    if (!voiceId.startsWith(LOCAL_PREFIX)) return this.piper.synthesize(text, voiceId);
    const local = this.getLocal();
    if (!local) {
      return Promise.reject(new TtsUnavailableError('This voice comes from a local voice server, but none is connected. Connect one in step 4.'));
    }
    return local.synthesize(text, voiceId.slice(LOCAL_PREFIX.length));
  }

  preload(voiceId: string, onProgress?: (p: number) => void): Promise<void> {
    if (voiceId.startsWith(LOCAL_PREFIX)) return Promise.resolve();
    return this.piper.preload(voiceId, onProgress);
  }
}
