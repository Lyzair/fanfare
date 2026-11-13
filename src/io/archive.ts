import { unzip, zip, strFromU8, strToU8, type Unzipped } from 'fflate';
import type { AppState, Lang, Player, Roster, SoundSlot, SportId, TemplateKey, CustomSound } from '../domain/model';
import { SPORT_IDS } from '../domain/sports';
import { LANGS, defaultTemplates } from '../i18n';

export interface ArchiveContent {
  state: AppState;
  sounds: Partial<Record<SoundSlot, Blob>>;
  speech: Map<string, Blob>;
}

export type ImportErrorCode = 'not-zip' | 'missing-json' | 'bad-version' | 'invalid-data' | 'too-large';

export class ImportError extends Error {
  code: ImportErrorCode;
  constructor(code: ImportErrorCode) {
    super(code);
    this.name = 'ImportError';
    this.code = code;
    Object.setPrototypeOf(this, ImportError.prototype);
  }
}

export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

const SLOTS: SoundSlot[] = ['score', 'intro'];
/** The templates every export has; the guest ones are optional for older files. */
const TEMPLATE_KEYS: TemplateKey[] = ['intro', 'field', 'bench', 'score'];

function blobBytes(b: Blob): Promise<ArrayBuffer> {
  return typeof b.arrayBuffer === 'function' ? b.arrayBuffer() : new Response(b).arrayBuffer();
}

function extFor(mime: string): string {
  switch (mime) {
    case 'audio/mpeg': return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav': return 'wav';
    case 'audio/ogg': return 'ogg';
    case 'audio/mp4':
    case 'audio/aac': return 'm4a';
    case 'audio/webm': return 'webm';
    default: return 'bin';
  }
}

function zipAsync(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(data, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

export async function exportArchive(c: ArchiveContent): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const speechIndex: Record<string, string> = {};
  const customSounds: AppState['customSounds'] = {};
  for (const slot of SLOTS) {
    const blob = c.sounds[slot];
    const meta = c.state.customSounds[slot];
    if (!blob || !meta) continue;
    customSounds[slot] = meta;
    files[`sounds/${slot}.${extFor(meta.mime)}`] = new Uint8Array(await blobBytes(blob));
  }
  let n = 0;
  for (const [key, blob] of c.speech) {
    speechIndex[String(n)] = key;
    files[`speech/${n}.wav`] = new Uint8Array(await blobBytes(blob));
    n++;
  }
  files['fanfare.json'] = strToU8(JSON.stringify({ ...c.state, customSounds, speechIndex }));
  const data = await zipAsync(files);
  return new Blob([data as BlobPart], { type: 'application/zip' });
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const bad = () => new ImportError('invalid-data');

export function parsePlayer(v: unknown): Player {
  if (!isObj(v)) throw bad();
  const { name, number, position, onField, customText, id } = v;
  if (typeof name !== 'string' || typeof number !== 'string' || typeof position !== 'string') throw bad();
  if (typeof onField !== 'boolean') throw bad();
  if (customText !== null && typeof customText !== 'string') throw bad();
  if (v.sayAs !== undefined && typeof v.sayAs !== 'string') throw bad();
  return {
    id: typeof id === 'string' && id ? id : crypto.randomUUID(), name, number, position, onField, customText,
    sayAs: typeof v.sayAs === 'string' ? v.sayAs : '',
  };
}

function parseRoster(v: unknown, sport: SportId, lang: Lang): Roster {
  if (!isObj(v)) throw bad();
  const str = (x: unknown) => {
    if (x === undefined) return '';
    if (typeof x !== 'string') throw bad();
    return x;
  };
  if (v.showPositions !== undefined && typeof v.showPositions !== 'boolean') throw bad();
  if (!Array.isArray(v.players)) throw bad();
  const defaults = defaultTemplates(sport, lang);
  const t = isObj(v.templates) ? v.templates : {};
  const valid = TEMPLATE_KEYS.every((k) => typeof t[k] === 'string');
  // the guest templates arrived later: older exports lack them and get the language defaults
  const templates = valid
    ? ({
        intro: t.intro, field: t.field, bench: t.bench, score: t.score,
        guestIntro: typeof t.guestIntro === 'string' ? t.guestIntro : defaults.guestIntro,
        guestScore: typeof t.guestScore === 'string' ? t.guestScore : defaults.guestScore,
      } as Record<TemplateKey, string>)
    : defaults;
  if (v.guestPlayers !== undefined && !Array.isArray(v.guestPlayers)) throw bad();
  return {
    homeTeam: str(v.homeTeam),
    homeSayAs: str(v.homeSayAs),
    opponent: str(v.opponent),
    opponentSayAs: str(v.opponentSayAs),
    showPositions: v.showPositions === true,
    players: v.players.map(parsePlayer),
    guestPlayers: Array.isArray(v.guestPlayers) ? v.guestPlayers.map(parsePlayer) : [],
    templates,
  };
}

function parseState(j: unknown): { state: AppState; speechIndex: Record<string, string> } {
  if (!isObj(j)) throw bad();
  if (j.version !== 1) throw new ImportError('bad-version');
  if (!SPORT_IDS.includes(j.sport as SportId)) throw bad();
  if (!LANGS.includes(j.lang as Lang)) throw bad();
  if (typeof j.voiceId !== 'string' || typeof j.soundsEnabled !== 'boolean') throw bad();
  const lang = j.lang as Lang;
  if (!isObj(j.rosters)) throw bad();
  const rosters: AppState['rosters'] = {};
  for (const [k, r] of Object.entries(j.rosters)) {
    if (!SPORT_IDS.includes(k as SportId)) throw bad();
    rosters[k as SportId] = parseRoster(r, k as SportId, lang);
  }
  const customSounds: Partial<Record<SoundSlot, CustomSound>> = {};
  const cs = j.customSounds === undefined ? {} : j.customSounds;
  if (!isObj(cs)) throw bad();
  for (const [k, m] of Object.entries(cs)) {
    if (!SLOTS.includes(k as SoundSlot) || !isObj(m)) throw bad();
    if (typeof m.name !== 'string' || typeof m.mime !== 'string') throw bad();
    customSounds[k as SoundSlot] = { name: m.name, mime: m.mime };
  }
  const speechIndex: Record<string, string> = {};
  if (j.speechIndex !== undefined) {
    if (!isObj(j.speechIndex)) throw bad();
    for (const [k, v] of Object.entries(j.speechIndex)) {
      if (typeof v !== 'string') throw bad();
      speechIndex[k] = v;
    }
  }
  return {
    state: { version: 1, sport: j.sport as SportId, lang, voiceId: j.voiceId, soundsEnabled: j.soundsEnabled, rosters, customSounds },
    speechIndex,
  };
}

export async function importArchive(file: Blob): Promise<ArchiveContent> {
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError('too-large');
  let files: Unzipped;
  try {
    files = await unzipAsync(new Uint8Array(await blobBytes(file)));
  } catch {
    throw new ImportError('not-zip');
  }
  const jsonBytes = files['fanfare.json'];
  if (!jsonBytes) throw new ImportError('missing-json');
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(jsonBytes));
  } catch {
    throw bad();
  }
  const { state, speechIndex } = parseState(raw);

  const sounds: Partial<Record<SoundSlot, Blob>> = {};
  const speech = new Map<string, Blob>();
  for (const [name, data] of Object.entries(files)) {
    const s = /^sounds\/(score|intro)\.[^/]+$/.exec(name);
    if (s) {
      const slot = s[1] as SoundSlot;
      const meta = state.customSounds[slot];
      if (meta) sounds[slot] = new Blob([data as BlobPart], { type: meta.mime });
      continue;
    }
    const sp = /^speech\/(\d+)\.wav$/.exec(name);
    if (sp && Object.prototype.hasOwnProperty.call(speechIndex, sp[1])) {
      speech.set(speechIndex[sp[1]], new Blob([data as BlobPart], { type: 'audio/wav' }));
    }
  }
  for (const slot of SLOTS) if (!sounds[slot]) delete state.customSounds[slot];
  return { state, sounds, speech };
}
