import { deleteSpeech, listSpeechKeys, loadSpeech, saveSpeech } from '../state/persist';
import { TtsUnavailableError, type TtsEngine } from './engine';

export interface SpeechStore {
  save(k: string, b: Blob): Promise<void>;
  load(k: string): Promise<Blob | null>;
  remove(k: string): Promise<void>;
  keys(): Promise<string[]>;
}

const idbStore: SpeechStore = { save: saveSpeech, load: loadSpeech, remove: deleteSpeech, keys: listSpeechKeys };

/** Speech clips by `${voiceId}|${trimmed text}`: memory → store → engine. */
export class SpeechCache {
  private readonly mem = new Map<string, Blob>();
  private readonly pending = new Map<string, Promise<Blob>>();
  private readonly engine: TtsEngine;
  private readonly store: SpeechStore;
  /** Bumped by `clear` and `replace`: work that started before must not write its clip afterwards. */
  private epoch = 0;

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
    const p: Promise<Blob> = this.fetch(key, voiceId, text.trim()).finally(() => {
      if (this.pending.get(key) === p) this.pending.delete(key);
    });
    this.pending.set(key, p);
    return p;
  }

  async prepare(voiceId: string, texts: string[], onProgress: (done: number, total: number) => void): Promise<void> {
    const unique = [...new Set(texts.map((t) => t.trim()).filter((t) => t.length > 0))];
    const epoch = this.epoch;
    for (let i = 0; i < unique.length && epoch === this.epoch; i++) {
      await this.get(voiceId, unique[i]);
      onProgress(i + 1, unique.length);
    }
  }

  entries(): Map<string, Blob> {
    return new Map(this.mem);
  }

  /** Loads every stored clip into memory, once at start: Export and the Ready badges read memory. */
  async hydrate(): Promise<void> {
    const epoch = this.epoch;
    try {
      for (const key of await this.store.keys()) {
        if (this.mem.has(key)) continue;
        const blob = await this.store.load(key);
        if (epoch !== this.epoch) return;
        if (blob && !this.mem.has(key)) this.mem.set(key, blob);
      }
    } catch (e) {
      console.warn('Could not read speech clips from storage', e);
    }
  }

  /** Forget all in-memory clips (stored ones are removed by clearAll). */
  clear(): void {
    this.epoch++;
    this.mem.clear();
    this.pending.clear();
  }

  /** Replace all clips with `entries`, in memory and in storage. */
  replace(entries: Map<string, Blob>): void {
    this.clear();
    this.load(entries);
    void this.prune();
  }

  /** Adds `entries` to memory and storage. */
  load(entries: Map<string, Blob>): void {
    for (const [k, b] of entries) {
      this.mem.set(k, b);
      this.store.save(k, b).catch((e: unknown) => console.warn('Could not persist speech clip', e));
    }
  }

  /** Removes stored clips that are no longer in memory, so a replaced team's clips do not return on reload. */
  private async prune(): Promise<void> {
    const epoch = this.epoch;
    try {
      for (const key of await this.store.keys()) {
        if (epoch !== this.epoch) return;
        if (!this.mem.has(key)) await this.store.remove(key);
      }
    } catch (e) {
      console.warn('Could not remove old speech clips from storage', e);
    }
  }

  /** Keeps a finished clip, unless the cache was cleared or replaced since `epoch`. */
  private async keep(epoch: number, key: string, blob: Blob): Promise<void> {
    if (epoch !== this.epoch) return;
    this.mem.set(key, blob);
    try {
      await this.store.save(key, blob);
      // cleared while the write was under way: the write may have landed after the storage was emptied
      if (epoch !== this.epoch && !this.mem.has(key)) await this.store.remove(key);
    } catch (e) {
      console.warn('Could not persist speech clip', e);
    }
  }

  /**
   * Makes the clip again and replaces the old one only when that worked: if the engine fails
   * (e.g. the local server is off) the existing clip stays in memory and storage.
   */
  async regenerate(voiceId: string, text: string): Promise<Blob> {
    const key = SpeechCache.key(voiceId, text);
    const epoch = this.epoch;
    const inflight = this.pending.get(key);
    if (inflight) await inflight.catch(() => undefined);
    const blob = await this.synthesize(voiceId, text.trim());
    await this.keep(epoch, key, blob);
    return blob;
  }

  private async synthesize(voiceId: string, text: string): Promise<Blob> {
    try {
      return await this.engine.synthesize(text, voiceId);
    } catch (e) {
      if (e instanceof TtsUnavailableError) throw e;
      throw new TtsUnavailableError(`Speech synthesis failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
  }

  private async fetch(key: string, voiceId: string, text: string): Promise<Blob> {
    const epoch = this.epoch;
    let stored: Blob | null = null;
    try {
      stored = await this.store.load(key);
    } catch (e) {
      console.warn('Could not read speech clip from storage', e);
    }
    if (stored) {
      if (epoch === this.epoch) this.mem.set(key, stored);
      return stored;
    }
    const blob = await this.synthesize(voiceId, text);
    await this.keep(epoch, key, blob);
    return blob;
  }
}
