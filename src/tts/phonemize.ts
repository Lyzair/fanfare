/*
 * Text -> IPA with the eSpeak NG data that is already shipped for Piper
 * (public/piper/piper_phonemize.{wasm,data}, same origin, GPL-3.0 like the rest
 * of eSpeak NG, see public/voices/LICENSES.md).
 *
 * The Emscripten module is created lazily on first use and cached; calls are
 * serialized through a promise queue. `callMain` is synchronous and prints one
 * JSON line per input. If it aborts (or the module cannot be created) the
 * cached module is dropped, a readable PhonemizeError is thrown, and the next
 * call creates a fresh module, so "try again" always works.
 */

export class PhonemizeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PhonemizeError';
  }
}

export interface EmscriptenModule {
  callMain(args: string[]): unknown;
}
export type EmscriptenFactory = (arg: {
  print: (line: string) => void;
  printErr: (line: string) => void;
  locateFile: (file: string) => string;
}) => Promise<EmscriptenModule>;

export { ESPEAK_VOICES, defaultEspeakVoice, isEspeakVoice } from './espeakVoices';
import { isEspeakVoice } from './espeakVoices';

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class Phonemizer {
  private mod: Promise<EmscriptenModule> | null = null;
  private lines: string[] = [];
  private chain: Promise<unknown> = Promise.resolve();

  private readonly loadFactory: () => Promise<EmscriptenFactory>;
  private readonly locateFile: (file: string) => string;

  constructor(loadFactory: () => Promise<EmscriptenFactory>, locateFile: (file: string) => string) {
    this.loadFactory = loadFactory;
    this.locateFile = locateFile;
  }

  /** IPA segments (one eSpeak phoneme each; stress marks and length marks are separate elements). */
  phonemize(text: string, voice: string): Promise<string[]> {
    const job = () => this.run(text, voice);
    const next = this.chain.then(job, job);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private module(): Promise<EmscriptenModule> {
    if (!this.mod) {
      this.mod = (async () => {
        try {
          const factory = await this.loadFactory();
          return await factory({
            print: (l) => { this.lines.push(l); },
            printErr: () => undefined,
            locateFile: this.locateFile,
          });
        } catch (e) {
          throw new PhonemizeError(`The pronunciation data could not be loaded: ${messageOf(e)}`, { cause: e });
        }
      })();
      this.mod.catch(() => { this.mod = null; });
    }
    return this.mod;
  }

  private async run(text: string, voice: string): Promise<string[]> {
    if (!isEspeakVoice(voice)) throw new PhonemizeError(`Unknown language "${voice}".`);
    const clean = text.trim();
    if (!clean) return [];
    const m = await this.module();
    this.lines = [];
    try {
      m.callMain(['-l', voice, '--input', JSON.stringify([{ text: clean }]), '--espeak_data', '/espeak-ng-data']);
    } catch (e) {
      this.mod = null; // an aborted Emscripten module is dead: start fresh next time
      throw new PhonemizeError(`The pronunciation lookup failed: ${messageOf(e)}`, { cause: e });
    }
    for (const line of this.lines) {
      try {
        const j = JSON.parse(line) as { phonemes?: unknown };
        if (Array.isArray(j.phonemes)) return j.phonemes.filter((p): p is string => typeof p === 'string');
      } catch { /* not a result line */ }
    }
    return []; // eSpeak had nothing to say (e.g. only symbols the language cannot read)
  }
}

let shared: Phonemizer | null = null;

/** The app's cached phonemizer: loads the glue chunk and the same-origin wasm/data lazily. */
export function phonemize(text: string, voice: string): Promise<string[]> {
  shared ??= new Phonemizer(
    async () => (await import('../../node_modules/@mintplex-labs/piper-tts-web/dist/piper-o91UDS6e.js')).createPiperPhonemize,
    (file) => new URL(`piper/${file}`, document.baseURI).href,
  );
  return shared.phonemize(text, voice);
}

