/*
 * Spike finding (Task 9, @mintplex-labs/piper-tts-web 1.0.5, read from the
 * installed dist/piper-tts-web.js):
 *
 * - ONNX Runtime WASM: configurable. `TtsSession.create({ wasmPaths })` sets
 *   `ort.env.wasm.wasmPaths = wasmPaths.onnxWasm` (a directory prefix). The
 *   library imports `onnxruntime-web/wasm` and was built against ORT 1.18.0,
 *   which we pin; fetch-assets copies its ort-wasm*.wasm files to ./ort/.
 *   (ORT 1.18 has no .mjs loaders; threaded variants use a blob: worker,
 *   covered by `worker-src blob:`, and only when crossOriginIsolated.)
 * - piper-phonemize WASM + espeak-ng data: configurable via
 *   `wasmPaths.piperWasm` / `wasmPaths.piperData` (Emscripten locateFile).
 *   Copied from @diffusionstudio/piper-wasm@1.0.0 to ./piper/. The JS glue is
 *   already bundled in the library. Note: a new phonemizer module is created
 *   per text chunk, so the 18 MB .data is re-requested per synthesis (served
 *   from the HTTP cache after the first time).
 * - Voice .onnx / .onnx.json: HARD-CODED to huggingface.co (`HF_BASE`), with
 *   OPFS caching guarded by `url.match("https://huggingface.co")`. Patched
 *   via patch-package (patches/@mintplex-labs+piper-tts-web+1.0.5.patch):
 *   HF_BASE -> "./voices", the two OPFS guards -> `url.startsWith(HF_BASE+"/")`
 *   (OPFS caching keeps working), the CDN defaults -> "./ort/", "./piper/…",
 *   and fetchBlob now throws on a non-2xx response (otherwise a 404 page would
 *   be parsed as a model and cached in OPFS). Files are laid out under
 *   public/voices/ exactly as PATH_MAP names them.
 * - Only voices listed in the library's PATH_MAP can be used. The library
 *   always phonemizes with espeak, so voices with `phoneme_type: "text"`
 *   (e.g. uk_UA-ukrainian_tts-medium) produce wrong phoneme ids; we use
 *   uk_UA-lada-x_low instead.
 * - TtsSession is a process-wide singleton (`TtsSession._instance`); creating
 *   a session for another voice silently reuses the first model. We reset
 *   `_instance` before switching voices.
 * - Everything runs on the main thread; no eval/new Function. Works under the
 *   page CSP (`'wasm-unsafe-eval'`, `connect-src 'self'`).
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
  private readonly base: string;
  private lib: Promise<PiperModule> | null = null;
  private session: TtsSession | null = null;
  private sessionVoice: string | null = null;
  /** Serializes all work: the library holds a single global session. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(assetBase = './') {
    this.base = assetBase;
  }

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

  private abs(path: string): string {
    return new URL(path, new URL(this.base, document.baseURI)).href;
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
          onnxWasm: this.abs('ort/'),
          piperData: this.abs('piper/piper_phonemize.data'),
          piperWasm: this.abs('piper/piper_phonemize.wasm'),
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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e: unknown) => { clearTimeout(t); reject(e); },
    );
  });
}
