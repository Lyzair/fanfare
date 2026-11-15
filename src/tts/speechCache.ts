import { deleteSpeech, loadSpeech, saveSpeech } from '../state/persist';
import { TtsUnavailableError, type TtsEngine } from './engine';

export interface SpeechStore {
  save(k: string, b: Blob): Promise<void>;
  load(k: string): Promise<Blob | null>;
  remove(k: string): Promise<void>;
}

const idbStore: SpeechStore = { save: saveSpeech, load: loadSpeech, remove: deleteSpeech };

/** Speech clips by `${voiceId}|${trimmed text}`: memory → store → engine. */
export class SpeechCache {
  private readonly mem = new Map<string, Blob>();
  private readonly pending = new Map<string, Promise<Blob>>();
  private readonly engine: TtsEngine;
  private readonly store: SpeechStore;

  constructor(engine: TtsEngine, store: SpeechStore = idbStore) {
    this.engine = engine;
    this.store = store;
  }

  static key(voiceId: string, text: string): string {
    return `${voiceId}|${text.trim()}`;
  }

  has(voiceId: string, text: string): boolean {
    return this.mem.has(SpeechCache.key(voiceId, text));
  }

  get(voiceId: string, text: string): Promise<Blob> {
    const key = SpeechCache.key(voiceId, text);
    const hit = this.mem.get(key);
    if (hit) return Promise.resolve(hit);
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const p = this.fetch(key, voiceId, text.trim()).finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }

  async prepare(voiceId: string, texts: string[], onProgress: (done: number, total: number) => void): Promise<void> {
    const unique = [...new Set(texts.map((t) => t.trim()).filter((t) => t.length > 0))];
    for (let i = 0; i < unique.length; i++) {
      await this.get(voiceId, unique[i]);
      onProgress(i + 1, unique.length);
    }
  }

  /** Forgets one clip (memory and storage) so the next `get` synthesizes it again. */
  async evict(voiceId: string, text: string): Promise<void> {
    const key = SpeechCache.key(voiceId, text);
    const inflight = this.pending.get(key);
    if (inflight) await inflight.catch(() => undefined); // let a running synthesis finish first
    this.mem.delete(key);
    try {
      await this.store.remove(key);
    } catch (e) {
      console.warn('Could not remove speech clip from storage', e);
    }
  }

  entries(): Map<string, Blob> {
    return new Map(this.mem);
  }

  /** Forget all in-memory clips (stored ones are removed by clearAll). */
  clear(): void {
    this.mem.clear();
    this.pending.clear();
  }

  /** Replace all in-memory clips with `entries` (and persist them). */
  replace(entries: Map<string, Blob>): void {
    this.mem.clear();
    this.load(entries);
  }

  load(entries: Map<string, Blob>): void {
    for (const [k, b] of entries) {
      this.mem.set(k, b);
      this.store.save(k, b).catch((e: unknown) => console.warn('Could not persist speech clip', e));
    }
  }

  private async fetch(key: string, voiceId: string, text: string): Promise<Blob> {
    let stored: Blob | null = null;
    try {
      stored = await this.store.load(key);
    } catch (e) {
      console.warn('Could not read speech clip from storage', e);
    }
    if (stored) {
      this.mem.set(key, stored);
      return stored;
    }
    let blob: Blob;
    try {
      blob = await this.engine.synthesize(text, voiceId);
    } catch (e) {
      if (e instanceof TtsUnavailableError) throw e;
      throw new TtsUnavailableError(`Speech synthesis failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
    this.mem.set(key, blob);
    try {
      await this.store.save(key, blob);
    } catch (e) {
      console.warn('Could not persist speech clip', e);
    }
    return blob;
  }
}
