import { unzip, zip, strFromU8, strToU8, type Unzipped } from 'fflate';
import { newId } from '../domain/id';
import { isObj } from '../domain/guards';
import { SOUND_SLOTS } from '../domain/model';
import type { AppState, Lang, Player, Roster, SoundSlot, SportId, TemplateKey, CustomSound } from '../domain/model';
import { SPORT_IDS } from '../domain/sports';
import { LANGS, defaultTemplates } from '../i18n';
import { isLocalUrl } from '../tts/httpEngine';
import { blobBytes } from './blob';

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
/** Caps on what one import may inflate to: a small crafted zip must not exhaust the tab's memory. */
export interface ImportLimits { bytes: number; entries: number }
const IMPORT_LIMITS: ImportLimits = { bytes: 400 * 1024 * 1024, entries: 5000 };
/** The only entries an export contains; everything else in a zip is skipped without inflating it. */
const ENTRY_NAME = /^(fanfare\.json|sounds\/(score|intro)\.[^/]+|speech\/\d+\.wav)$/;

/** The templates every export has; the guest ones are optional for older files. */
const TEMPLATE_KEYS: TemplateKey[] = ['intro', 'field', 'bench', 'score'];

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

/** Inflates the allow-listed entries; fflate never writes more than an entry's declared size. */
function unzipAsync(data: Uint8Array, limits: ImportLimits): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    let bytes = 0, entries = 0, tooLarge = false;
    const filter = (f: { name: string; originalSize: number }) => {
      if (tooLarge || !ENTRY_NAME.test(f.name)) return false;
      bytes += f.originalSize;
      entries++;
      tooLarge = bytes > limits.bytes || entries > limits.entries;
      return !tooLarge;
    };
    unzip(data, { filter }, (err, out) => {
      if (tooLarge) reject(new ImportError('too-large'));
      else if (err) reject(err);
      else resolve(out);
    });
  });
}

export async function exportArchive(c: ArchiveContent): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const speechIndex: Record<string, string> = {};
  const customSounds: AppState['customSounds'] = {};
  for (const slot of SOUND_SLOTS) {
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

/** The error for a file whose content is not what an export contains. */
export const invalidData = () => new ImportError('invalid-data');

/** `seen` holds the ids used so far in this roster: a missing or repeated id gets a fresh one. */
function parsePlayer(v: unknown, seen: Set<string>): Player {
  if (!isObj(v)) throw invalidData();
  const { name, number, position, onField, customText, id } = v;
  if (typeof name !== 'string' || typeof number !== 'string' || typeof position !== 'string') throw invalidData();
  if (typeof onField !== 'boolean') throw invalidData();
  if (customText !== null && typeof customText !== 'string') throw invalidData();
  for (const k of ['sayAs', 'origSpelling', 'nameLang'] as const) if (v[k] !== undefined && typeof v[k] !== 'string') throw invalidData();
  const ownId = typeof id === 'string' && id && !seen.has(id) ? id : newId();
  seen.add(ownId);
  return {
    id: ownId, name, number, position, onField, customText,
    sayAs: typeof v.sayAs === 'string' ? v.sayAs : '',
    origSpelling: typeof v.origSpelling === 'string' ? v.origSpelling : '',
    nameLang: typeof v.nameLang === 'string' ? v.nameLang : '',
  };
}

function parseRoster(v: unknown, sport: SportId, lang: Lang): Roster {
  if (!isObj(v)) throw invalidData();
  const str = (x: unknown) => {
    if (x === undefined) return '';
    if (typeof x !== 'string') throw invalidData();
    return x;
  };
  if (v.showPositions !== undefined && typeof v.showPositions !== 'boolean') throw invalidData();
  if (!Array.isArray(v.players)) throw invalidData();
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
  if (v.guestPlayers !== undefined && !Array.isArray(v.guestPlayers)) throw invalidData();
  const seen = new Set<string>();
  const player = (p: unknown) => parsePlayer(p, seen);
  return {
    homeTeam: str(v.homeTeam),
    homeSayAs: str(v.homeSayAs),
    homeOrigSpelling: str(v.homeOrigSpelling),
    homeNameLang: str(v.homeNameLang),
    opponent: str(v.opponent),
    opponentSayAs: str(v.opponentSayAs),
    opponentOrigSpelling: str(v.opponentOrigSpelling),
    opponentNameLang: str(v.opponentNameLang),
    showPositions: v.showPositions === true,
    players: v.players.map(player),
    guestPlayers: Array.isArray(v.guestPlayers) ? v.guestPlayers.map(player) : [],
    templates,
  };
}

function parseState(j: unknown): { state: AppState; speechIndex: Record<string, string> } {
  if (!isObj(j)) throw invalidData();
  if (j.version !== 1) throw new ImportError('bad-version');
  if (!SPORT_IDS.includes(j.sport as SportId)) throw invalidData();
  if (!LANGS.includes(j.lang as Lang)) throw invalidData();
  if (typeof j.voiceId !== 'string' || typeof j.soundsEnabled !== 'boolean') throw invalidData();
  const lang = j.lang as Lang;
  if (!isObj(j.rosters)) throw invalidData();
  const rosters: AppState['rosters'] = {};
  for (const [k, r] of Object.entries(j.rosters)) {
    if (!SPORT_IDS.includes(k as SportId)) throw invalidData();
    rosters[k as SportId] = parseRoster(r, k as SportId, lang);
  }
  const customSounds: Partial<Record<SoundSlot, CustomSound>> = {};
  const cs = j.customSounds === undefined ? {} : j.customSounds;
  if (!isObj(cs)) throw invalidData();
  for (const [k, m] of Object.entries(cs)) {
    if (!SOUND_SLOTS.includes(k as SoundSlot) || !isObj(m)) throw invalidData();
    if (typeof m.name !== 'string' || typeof m.mime !== 'string') throw invalidData();
    customSounds[k as SoundSlot] = { name: m.name, mime: m.mime };
  }
  const speechIndex: Record<string, string> = {};
  if (j.speechIndex !== undefined) {
    if (!isObj(j.speechIndex)) throw invalidData();
    for (const [k, v] of Object.entries(j.speechIndex)) {
      if (typeof v !== 'string') throw invalidData();
      speechIndex[k] = v;
    }
  }
  let localTts: AppState['localTts'] = null;
  if (j.localTts !== undefined && j.localTts !== null) {
    if (!isObj(j.localTts) || typeof j.localTts.url !== 'string' || !isLocalUrl(j.localTts.url)) throw invalidData();
    localTts = { url: j.localTts.url };
  }
  return {
    state: { version: 1, sport: j.sport as SportId, lang, voiceId: j.voiceId, soundsEnabled: j.soundsEnabled, rosters, customSounds, localTts },
    speechIndex,
  };
}

export async function importArchive(file: Blob, limits: ImportLimits = IMPORT_LIMITS): Promise<ArchiveContent> {
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError('too-large');
  let files: Unzipped;
  try {
    files = await unzipAsync(new Uint8Array(await blobBytes(file)), limits);
  } catch (e) {
    throw e instanceof ImportError ? e : new ImportError('not-zip');
  }
  const jsonBytes = files['fanfare.json'];
  if (!jsonBytes) throw new ImportError('missing-json');
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(jsonBytes));
  } catch {
    throw invalidData();
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
  for (const slot of SOUND_SLOTS) if (!sounds[slot]) delete state.customSounds[slot];
  return { state, sounds, speech };
}
