/*
 * The in-browser voice: @mintplex-labs/piper-tts-web 1.0.5 (Piper models on ONNX Runtime 1.18.0).
 *
 * - Everything is loaded from this page's own origin. The library's hard-coded download addresses
 *   are replaced by patches/@mintplex-labs+piper-tts-web+1.0.5.patch: voices from ./voices/ (laid
 *   out as the library's PATH_MAP names them), ONNX Runtime from ./ort/, the phonemizer from
 *   ./piper/. scripts/fetch-assets.mjs puts the files there; scripts/check-piper-patch.mjs fails
 *   the build if the patch is missing.
 * - The patch also makes the library's download fail on a non-2xx answer: otherwise an error page
 *   would be stored in the browser's private file system (OPFS) as if it were the voice model.
 * - Voices with `phoneme_type: "text"` (the Ukrainian one) are mapped to phoneme ids by the patch
 *   directly, as Piper does; all others go through eSpeak NG.
 * - The library keeps one global session and would reuse the first voice for every other one, so
 *   the session is reset when the voice changes, and all work runs one after the other.
 */
import type { TtsSession } from '@mintplex-labs/piper-tts-web';
import { VOICES } from './voices';

export interface TtsEngine {
  synthesize(text: string, voiceId: string): Promise<Blob>;
  preload(voiceId: string, onProgress?: (p: number) => void): Promise<void>;
}

export class TtsUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TtsUnavailableError';
  }
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

const PREDICT_TIMEOUT_MS = 60_000;

type PiperModule = typeof import('@mintplex-labs/piper-tts-web');

export class PiperEngine implements TtsEngine {
  private lib: Promise<PiperModule> | null = null;
  private session: TtsSession | null = null;
  private sessionVoice: string | null = null;
  /** Serializes all work: the library holds a single global session. */
  private chain: Promise<unknown> = Promise.resolve();

  preload(voiceId: string, onProgress?: (p: number) => void): Promise<void> {
    return this.enqueue(async () => {
      await this.sessionFor(voiceId, onProgress);
      onProgress?.(1);
    });
  }

  synthesize(text: string, voiceId: string): Promise<Blob> {
    return this.enqueue(async () => {
      const trimmed = text.trim();
      if (!trimmed) throw new TtsUnavailableError('Nothing to say: the text is empty.');
      const session = await this.sessionFor(voiceId);
      let wav: Blob;
      try {
        wav = await withTimeout(session.predict(trimmed), PREDICT_TIMEOUT_MS);
      } catch (e) {
        throw new TtsUnavailableError(`Speech synthesis failed: ${messageOf(e)}`, { cause: e });
      }
      // The library labels its output audio/x-wav; normalise the type.
      return new Blob([await wav.arrayBuffer()], { type: 'audio/wav' });
    });
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job, job);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private loadLib(): Promise<PiperModule> {
    if (!this.lib) {
      this.lib = import('@mintplex-labs/piper-tts-web').catch((e: unknown) => {
        this.lib = null;
        throw new TtsUnavailableError(`The speech engine could not be loaded: ${messageOf(e)}`, { cause: e });
      });
    }
    return this.lib;
  }

  private async sessionFor(voiceId: string, onProgress?: (p: number) => void): Promise<TtsSession> {
    if (!VOICES.some((v) => v.id === voiceId)) {
      throw new TtsUnavailableError(`Unknown voice "${voiceId}".`);
    }
    if (this.session && this.sessionVoice === voiceId) return this.session;
    const { TtsSession: Session } = await this.loadLib();
    // The library keeps one global session; drop it so the new voice loads.
    Session._instance = null;
    this.session = null;
    this.sessionVoice = null;
    try {
      const session = await Session.create({
        voiceId,
        wasmPaths: {
          onnxWasm: abs('ort/'),
          piperData: abs('piper/piper_phonemize.data'),
          piperWasm: abs('piper/piper_phonemize.wasm'),
        },
        progress: (p) => {
          if (onProgress && p.url.endsWith('.onnx') && p.total > 0) {
            onProgress(Math.min(1, p.loaded / p.total));
          }
        },
      });
      this.session = session;
      this.sessionVoice = voiceId;
      return session;
    } catch (e) {
      Session._instance = null;
      throw new TtsUnavailableError(`The voice "${voiceId}" could not be loaded: ${messageOf(e)}`, { cause: e });
    }
  }
}

/** The absolute address of a file that is served next to the page. */
const abs = (path: string): string => new URL(path, document.baseURI).href;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e: unknown) => { clearTimeout(t); reject(e); },
    );
  });
}
