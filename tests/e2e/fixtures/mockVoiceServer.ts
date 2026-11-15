import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockVoice { id: string; lang: string; label: string }
export interface LoggedRequest { method: string; path: string; origin: string | null; xFanfare: string | null; bytes: number }

/** A silent mono 16-bit WAV, long enough that "Stop" is visible while it plays. */
export function silentWav(seconds = 1.5, rate = 8000): Buffer {
  const samples = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40);
  return buf;
}

const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/;

/**
 * Fanfare Studio's protocol for e2e tests: voices, synthesis, club voices, and the origin
 * allow-list (default: http://localhost:* and http://127.0.0.1:*; others must be allowed; unknown
 * origins get 403 without CORS headers; POST/DELETE /references need `X-Fanfare: 1`).
 */
export class MockVoiceServer {
  readonly requests: LoggedRequest[] = [];
  readonly voices: MockVoice[] = [
    { id: 'mock-en', lang: 'en', label: 'Mock English' },
    { id: 'mock-de', lang: 'de', label: 'Mock Deutsch' },
  ];
  readonly synthesized: string[] = [];
  readonly references: Array<{ name: string; lang: string; consent: string; audioBytes: number }> = [];
  private readonly extraOrigins = new Set<string>();
  private readonly allowDefaultLocal: boolean;
  private server: Server | null = null;
  private port = 0;

  constructor(opts: { allowDefaultLocal?: boolean } = {}) {
    this.allowDefaultLocal = opts.allowDefaultLocal ?? true;
  }

  get url(): string { return `http://127.0.0.1:${this.port}`; }
  get origin(): string { return this.url; }

  allow(origin: string): void { this.extraOrigins.add(origin); }

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>(resolve => this.server!.listen(0, '127.0.0.1', resolve));
    this.port = (this.server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  private originAllowed(origin: string): boolean {
    return (this.allowDefaultLocal && LOCAL_ORIGIN.test(origin)) || this.extraOrigins.has(origin);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const path = (req.url ?? '/').split('?')[0];
    this.requests.push({ method: req.method ?? '', path, origin, xFanfare: typeof req.headers['x-fanfare'] === 'string' ? req.headers['x-fanfare'] : null, bytes: body.length });

    if (origin !== null) {
      if (!this.originAllowed(origin)) { this.send(res, 403, 'text/plain', 'This website is not allowed.'); return; }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fanfare');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.writeHead(204).end();
      return;
    }
    const writes = (req.method === 'POST' && path === '/references') || (req.method === 'DELETE' && path.startsWith('/references/'));
    if (writes && req.headers['x-fanfare'] !== '1') { this.send(res, 400, 'text/plain', 'X-Fanfare header required'); return; }

    if (req.method === 'GET' && path === '/voices') { this.send(res, 200, 'application/json', JSON.stringify(this.voices)); return; }
    if (req.method === 'POST' && path === '/synthesize') {
      let parsed: { text?: unknown; voice?: unknown };
      try { parsed = JSON.parse(body.toString('utf8')) as typeof parsed; } catch { this.send(res, 400, 'text/plain', 'bad json'); return; }
      if (typeof parsed.text !== 'string' || !parsed.text.trim()) { this.send(res, 400, 'text/plain', 'text required'); return; }
      if (!this.voices.some(v => v.id === parsed.voice)) { this.send(res, 404, 'text/plain', 'unknown voice'); return; }
      this.synthesized.push(parsed.text);
      this.send(res, 200, 'audio/wav', silentWav());
      return;
    }
    if (req.method === 'POST' && path === '/references') {
      const text = body.toString('latin1');
      const field = (name: string) => new RegExp(`name="${name}"(?:; filename="[^"]*")?\\r\\n(?:[^\\r\\n]+\\r\\n)*\\r\\n([\\s\\S]*?)\\r\\n--`).exec(text)?.[1];
      const consent = field('consent');
      const name = field('name') ?? '';
      const lang = field('lang') ?? '';
      const audioBytes = (field('audio') ?? '').length;
      if (consent !== 'true') { this.send(res, 400, 'text/plain', 'consent must be true'); return; }
      this.references.push({ name, lang, consent, audioBytes });
      const voice = { id: `club-${(this.references.length).toString(16).padStart(8, '0')}`, lang, label: name };
      this.voices.push(voice);
      this.send(res, 201, 'application/json', JSON.stringify({ ...voice, warnings: [] }));
      return;
    }
    if (req.method === 'DELETE' && path.startsWith('/references/')) {
      const id = decodeURIComponent(path.slice('/references/'.length));
      const i = this.voices.findIndex(v => v.id === id && id.startsWith('club-'));
      if (i < 0) { this.send(res, 404, 'text/plain', 'unknown voice'); return; }
      this.voices.splice(i, 1);
      res.writeHead(204).end();
      return;
    }
    this.send(res, 404, 'text/plain', 'not found');
  }

  private send(res: ServerResponse, status: number, type: string, body: string | Buffer): void {
    res.writeHead(status, { 'Content-Type': type });
    res.end(body);
  }
}
