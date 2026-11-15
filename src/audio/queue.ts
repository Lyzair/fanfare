import { encodeWav } from './wav';

export interface AudioLike {
  src: string;
  play(): Promise<void>;
  pause(): void;
  onended: (() => void) | null;
  onerror: (() => void) | null;
}

export interface UrlApi {
  create(b: Blob): string;
  revoke(u: string): void;
}

export type QueueItem = Blob | (() => Promise<Blob>);

/**
 * Single player for everything the app plays. Reuses one audio element
 * (iOS unlocks per element). Each play() bumps a sequence counter; every
 * awaited step bails when the counter changed.
 */
export class AudioQueue {
  private readonly listeners = new Set<(playing: boolean) => void>();
  private audio: AudioLike;
  private urls: UrlApi;
  private seq = 0;
  private unlocked = false;
  private _playing = false;
  /** Ends the item currently being waited on (used by stop / replacement). */
  private cancelCurrent: (() => void) | null = null;

  constructor(
    createAudio: () => AudioLike = () => new Audio() as unknown as AudioLike,
    urls: UrlApi = {
      create: URL.createObjectURL.bind(URL),
      revoke: URL.revokeObjectURL.bind(URL),
    },
  ) {
    this.audio = createAudio();
    this.urls = urls;
  }

  get playing(): boolean {
    return this._playing;
  }

  /** Calls `fn` whenever playing starts or ends; returns the function that unsubscribes. */
  subscribe(fn: (playing: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** Must be called synchronously inside a user gesture. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    const url = this.urls.create(encodeWav(new Float32Array(441), 44100));
    this.audio.src = url;
    let p: Promise<void>;
    try {
      p = this.audio.play();
    } catch {
      this.urls.revoke(url);
      return;
    }
    const done = () => this.urls.revoke(url);
    p.then(done, done);
  }

  stop(): void {
    this.halt();
    this.setPlaying(false);
  }

  async play(items: QueueItem[]): Promise<void> {
    this.halt();
    const mine = ++this.seq;
    this.setPlaying(true);
    try {
      for (const item of items) {
        if (mine !== this.seq) return;
        let blob: Blob;
        try {
          blob = typeof item === 'function' ? await item() : item;
        } catch {
          continue;
        }
        if (mine !== this.seq) return;
        await this.playOne(blob);
      }
    } finally {
      if (mine === this.seq) this.setPlaying(false);
    }
  }

  private halt(): void {
    this.seq++;
    this.cancelCurrent?.();
  }

  private setPlaying(v: boolean): void {
    if (this._playing === v) return;
    this._playing = v;
    for (const fn of this.listeners) fn(v);
  }

  private playOne(blob: Blob): Promise<void> {
    const audio = this.audio;
    const url = this.urls.create(blob);
    return new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        audio.onended = null;
        audio.onerror = null;
        this.cancelCurrent = null;
        this.urls.revoke(url);
        resolve();
      };
      this.cancelCurrent = () => {
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
        finish();
      };
      audio.onended = finish;
      audio.onerror = finish;
      audio.src = url;
      try {
        audio.play().catch(finish);
      } catch {
        finish();
      }
    });
  }
}
