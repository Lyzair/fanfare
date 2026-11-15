import type { RemoteCommand, RemoteSnapshot, RemoteStateEvent } from './protocol';
import { parseCommand } from './protocol';

/**
 * Client side of the phone-remote relay in scripts/fanfare-local.py. Every request goes to the
 * page's own origin (relative URLs); there is no other server, ever.
 */
const BASE = './remote/';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export interface RemoteHealth { urls: string[]; secure: boolean }

/** Is this page served by fanfare-local? (Other hosts answer 404 or something that is not the relay's JSON.) */
export async function probeRemote(): Promise<RemoteHealth | null> {
  if (typeof fetch !== 'function') return null;
  // no network at all: phones cannot reach this laptop either, and the offline page stays free of failed requests
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  try {
    const res = await fetch(`${BASE}health`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json() as { fanfare?: unknown; urls?: unknown; secure?: unknown };
    if (j?.fanfare !== 'local' || !Array.isArray(j.urls)) return null;
    return { urls: j.urls.filter((u): u is string => typeof u === 'string'), secure: j.secure === true };
  } catch {
    return null;
  }
}

function parseData<T>(e: unknown): T | null {
  try { return JSON.parse((e as { data: string }).data) as T; } catch { return null; }
}

export interface SpeakerHandlers {
  onCommand(cmd: RemoteCommand): void;
  onRemotes(count: number): void;
  onCode(code: string, expiresIn: number): void;
  /** Too many wrong codes: pairing is locked until the speaker asks for a new code. */
  onLocked(): void;
  /** The relay closed the session (ended elsewhere, laptop server restarted). */
  onEnded(): void;
}

export interface SessionInfo { code: string; expiresIn: number }

/** The laptop's side: creates the session, receives commands, publishes the state. */
export class SpeakerLink {
  private token = '';
  private es: EventSource | null = null;
  private lastSent = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: RemoteSnapshot | null = null;
  private closed = false;

  private h: SpeakerHandlers;
  constructor(h: SpeakerHandlers) { this.h = h; }

  async start(): Promise<SessionInfo> {
    const res = await fetch(`${BASE}session`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
    if (!res.ok) throw new Error(`session: HTTP ${res.status}`);
    const j = await res.json() as { speakerToken: string; code: string; expiresIn: number };
    this.token = j.speakerToken;
    const es = new EventSource(`${BASE}events?token=${encodeURIComponent(this.token)}`);
    this.es = es;
    es.addEventListener('command', e => {
      const cmd = parseCommand(parseData(e));
      if (cmd) this.h.onCommand(cmd);
    });
    es.addEventListener('remotes', e => { const d = parseData<{ count: number }>(e); if (d) this.h.onRemotes(d.count); });
    es.addEventListener('code', e => { const d = parseData<SessionInfo>(e); if (d) this.h.onCode(d.code, d.expiresIn); });
    es.addEventListener('locked', () => this.h.onLocked());
    es.onerror = () => { if (es.readyState === 2 && !this.closed) { this.stopLocal(); this.h.onEnded(); } };
    return { code: j.code, expiresIn: j.expiresIn };
  }

  private authHeaders() {
    return { ...JSON_HEADERS, 'X-Fanfare-Speaker-Token': this.token };
  }

  /** Publishes the snapshot shortly after the last change; identical snapshots are not sent twice. */
  pushState(snapshot: RemoteSnapshot): void {
    if (this.closed || !this.token) return;
    this.pending = snapshot;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const snap = this.pending;
      this.pending = null;
      if (!snap || this.closed) return;
      const body = JSON.stringify(snap);
      if (body === this.lastSent) return;
      this.lastSent = body;
      void fetch(`${BASE}state`, { method: 'POST', headers: this.authHeaders(), body }).catch(() => { this.lastSent = ''; });
    }, 80);
  }

  async newCode(): Promise<SessionInfo | null> {
    try {
      const res = await fetch(`${BASE}code`, { method: 'POST', headers: this.authHeaders(), body: '{}' });
      return res.ok ? await res.json() as SessionInfo : null;
    } catch {
      return null;
    }
  }

  private stopLocal(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.es?.close();
    this.es = null;
  }

  /** Stops listening without ending the session on the relay (the page is going away). */
  detach(): void { this.stopLocal(); }

  /** Ends the pairing on the relay (all phones are disconnected) and stops listening. */
  async end(): Promise<void> {
    const token = this.token;
    this.stopLocal();
    if (!token) return;
    try {
      await fetch(`${BASE}session`, { method: 'DELETE', headers: { 'X-Fanfare-Speaker-Token': token } });
    } catch { /* the laptop server is gone; nothing left to end */ }
  }
}

export type PairResult =
  | { ok: true }
  | { ok: false; error: 'wrong-code' | 'locked' | 'expired' | 'full' | 'network' };

export type LinkStatus = 'connecting' | 'live' | 'reconnecting' | 'ended';

export interface RemoteHandlers {
  onState(event: RemoteStateEvent): void;
  onStatus(status: LinkStatus): void;
}

const TOKEN_KEY = 'fanfare.remoteToken';

function storedToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function storeToken(token: string | null): void {
  try { if (token) sessionStorage.setItem(TOKEN_KEY, token); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode: no reload survival */ }
}

/** The phone's side: pairs with a code, follows the state, sends commands. Never plays audio. */
export class RemoteLink {
  private token = '';
  private es: EventSource | null = null;

  private h: RemoteHandlers;
  constructor(h: RemoteHandlers) { this.h = h; }

  static hasStoredSession(): boolean {
    return storedToken() !== null;
  }

  async pair(code: string): Promise<PairResult> {
    let res: Response;
    try {
      res = await fetch(`${BASE}pair`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ code }) });
    } catch {
      return { ok: false, error: 'network' };
    }
    if (res.ok) {
      const j = await res.json() as { token: string };
      this.token = j.token;
      storeToken(j.token);
      this.listen();
      return { ok: true };
    }
    let error = '';
    try { error = ((await res.json()) as { error?: string }).error ?? ''; } catch { /* no body */ }
    if (error === 'locked' || error === 'expired' || error === 'full') return { ok: false, error };
    return { ok: false, error: 'wrong-code' };
  }

  /** After a page reload: continue with the token this tab already has. */
  resume(): boolean {
    const t = storedToken();
    if (!t) return false;
    this.token = t;
    this.listen();
    return true;
  }

  private listen(): void {
    this.es?.close();
    this.h.onStatus('connecting');
    const es = new EventSource(`${BASE}events?token=${encodeURIComponent(this.token)}`);
    this.es = es;
    es.onopen = () => this.h.onStatus('live');
    es.addEventListener('state', e => {
      const d = parseData<RemoteStateEvent>(e);
      if (d) { this.h.onState(d); this.h.onStatus('live'); }
    });
    es.addEventListener('ended', () => this.finish());
    es.onerror = () => {
      if (es.readyState === 2) this.finish(); // refused: the token is no longer valid
      else this.h.onStatus('reconnecting'); // the browser retries by itself
    };
  }

  private finish(): void {
    this.es?.close();
    this.es = null;
    storeToken(null);
    this.h.onStatus('ended');
  }

  async send(cmd: RemoteCommand): Promise<void> {
    try {
      const res = await fetch(`${BASE}command`, {
        method: 'POST', headers: { ...JSON_HEADERS, 'X-Fanfare-Remote': this.token }, body: JSON.stringify(cmd),
      });
      if (res.status === 401) this.finish();
    } catch { /* the stream shows the connection state */ }
  }

  close(): void {
    this.es?.close();
    this.es = null;
  }
}
