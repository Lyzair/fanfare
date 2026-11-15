import type { Lang } from '../domain/model';
import { LANGS } from '../i18n';
import { TtsUnavailableError, type TtsEngine } from './engine';

/** Where Fanfare Studio listens by default. */
export const LOCAL_TTS_DEFAULT_URL = 'http://127.0.0.1:5123';

const VOICES_TIMEOUT_MS = 5_000;
const SYNTHESIZE_TIMEOUT_MS = 120_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const SHORT_TIMEOUT_MS = 15_000;

/**
 * Only http(s)://localhost or http(s)://127.0.0.1 (any port) is a local voice server:
 * no credentials, path (other than a bare "/"), query or fragment. Keeps the app from ever
 * talking to another computer.
 */
export function isLocalUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return false;
  if (u.username !== '' || u.password !== '') return false;
  if (u.pathname !== '/' || u.search !== '' || u.hash !== '') return false;
  if (/[?#]/.test(url)) return false; // "http://x:1?" parses with an empty query
  return true;
}

/**
 * Languages the server accepts for POST /references. Mirrors Fanfare Studio's README
 * ("Club voices": `lang` is one of de en fr es it nl pl tr ar; Chatterbox has no Ukrainian).
 */
export const CLUB_VOICE_LANGS: readonly Lang[] = ['de', 'en', 'fr', 'es', 'it', 'nl', 'pl', 'tr', 'ar'];

/** Upload file extension for a recorded blob type. */
export function recordingExtension(mime: string): string {
  switch (mime.split(';')[0].trim().toLowerCase()) {
    case 'audio/ogg': return 'ogg';
    case 'audio/mp4': case 'audio/m4a': case 'audio/x-m4a': return 'm4a';
    case 'audio/wav': case 'audio/x-wav': case 'audio/wave': return 'wav';
    default: return 'webm';
  }
}

export interface RemoteVoice { id: string; lang: string; label: string }
/** A voice made from an uploaded recording; `warnings` come from the server (e.g. very quiet). */
export interface ClubVoice extends RemoteVoice { warnings: string[] }

/**
 * The server could not be reached, or refused this website (403, or a browser-side CORS failure
 * that looks like a network error). The fix is always the same: allow this origin on the server.
 */
export class LocalAccessError extends TtsUnavailableError {
  readonly origin: string;
  readonly command: string;
  constructor(origin: string, options?: { cause?: unknown }) {
    const command = `fanfare-studio allow ${origin}`;
    super(
      `Fanfare Studio did not answer, or it does not allow this website yet. This website's address is ${origin}. `
      + `Make sure Fanfare Studio is running, then run this command once on that computer: ${command}`,
      options,
    );
    this.name = 'LocalAccessError';
    this.origin = origin;
    this.command = command;
  }
}

const HEADERS = { 'X-Fanfare': '1' };

export class HttpTtsEngine implements TtsEngine {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  private readonly origin: string;

  constructor(baseUrl: string, fetchFn?: typeof fetch, origin?: string) {
    this.base = baseUrl.replace(/\/+$/, '');
    // resolved late so that a stubbed global fetch is picked up
    this.fetchFn = fetchFn ?? ((input, init) => fetch(input, init));
    this.origin = origin ?? (typeof location === 'undefined' ? 'this website' : location.origin);
  }

  async listVoices(): Promise<RemoteVoice[]> {
    const res = await this.request('/voices', { method: 'GET', headers: { ...HEADERS } }, VOICES_TIMEOUT_MS);
    let data: unknown;
    try { data = await res.json(); } catch { throw new TtsUnavailableError('The voice server sent an answer that is not a voice list.'); }
    if (!Array.isArray(data)) throw new TtsUnavailableError('The voice server sent an answer that is not a voice list.');
    const voices: RemoteVoice[] = [];
    for (const v of data as unknown[]) {
      if (typeof v !== 'object' || v === null) continue;
      const { id, lang, label } = v as Record<string, unknown>;
      if (typeof id !== 'string' || !id || typeof lang !== 'string' || typeof label !== 'string') continue;
      if (!(LANGS as readonly string[]).includes(lang as Lang)) continue;
      voices.push({ id, lang, label });
    }
    return voices;
  }

  /** `voiceId` is the server's id, without the "local:" prefix. */
  async synthesize(text: string, voiceId: string): Promise<Blob> {
    const res = await this.request('/synthesize', {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: voiceId }),
    }, SYNTHESIZE_TIMEOUT_MS);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('audio/')) throw new TtsUnavailableError('The voice server did not send audio.');
    return new Blob([await res.arrayBuffer()], { type });
  }

  async preload(): Promise<void> { /* nothing to load */ }

  /**
   * Sends a recording to the local server (and only there) to make a club voice. The caller
   * drops its copy of the recording afterwards; nothing here keeps it.
   */
  async uploadReference(audio: Blob, meta: { name: string; lang: string }): Promise<ClubVoice> {
    const form = new FormData();
    form.append('audio', audio, `club-voice.${recordingExtension(audio.type)}`);
    form.append('name', meta.name);
    form.append('lang', meta.lang);
    form.append('consent', 'true');
    const res = await this.request('/references', { method: 'POST', headers: { ...HEADERS }, body: form }, UPLOAD_TIMEOUT_MS);
    let data: unknown;
    try { data = await res.json(); } catch { data = null; }
    const v = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    if (typeof v.id !== 'string' || typeof v.lang !== 'string' || typeof v.label !== 'string') {
      throw new TtsUnavailableError('The voice server sent an unexpected answer.');
    }
    const warnings = Array.isArray(v.warnings) ? v.warnings.map(String) : [];
    return { id: v.id, lang: v.lang, label: v.label, warnings };
  }

  /** Removes a club voice and its stored recording. An already-missing voice (404) counts as removed. */
  async deleteReference(id: string): Promise<void> {
    await this.request(`/references/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { ...HEADERS } }, SHORT_TIMEOUT_MS, [404]);
  }

  private async request(path: string, init: RequestInit, timeoutMs: number, okStatuses: number[] = []): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(this.base + path, { ...init, signal: ctl.signal });
    } catch (e) {
      if (ctl.signal.aborted) {
        throw new TtsUnavailableError(`The voice server did not answer within ${timeoutMs / 1000} seconds.`, { cause: e });
      }
      // A browser reports a CORS refusal exactly like a server that is down.
      throw new LocalAccessError(this.origin, { cause: e });
    } finally {
      clearTimeout(timer);
    }
    if (res.ok || okStatuses.includes(res.status)) return res;
    if (res.status === 403) throw new LocalAccessError(this.origin);
    let detail = '';
    try { detail = (await res.text()).trim().slice(0, 300); } catch { /* no message */ }
    throw new TtsUnavailableError(detail ? `The voice server said: ${detail}` : `The voice server answered with status ${res.status}.`);
  }
}
