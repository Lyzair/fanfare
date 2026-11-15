import { isObj } from '../domain/guards';
import type { AppState, SportId, TeamFile } from '../domain/model';
import { SPORT_IDS } from '../domain/sports';
import { currentRoster } from '../state/reducer';
import { ImportError, invalidData } from './archive';
import { dateStamp } from './download';

export const MAX_TEAM_FILE_BYTES = 1024 * 1024;
const MAX_TEAM_PLAYERS = 100;
/** Caps for the Suggest fields: the original spelling like a hint input, the language code short. */
const MAX_ORIG_SPELLING = 80;
const MAX_NAME_LANG = 20;


/** Optional string field: missing = '', wrong type = invalid, long = cut like the editor's maxLength. */
function str(v: unknown, max: number): string {
  if (v === undefined) return '';
  if (typeof v !== 'string') throw invalidData();
  return v.slice(0, max);
}

/** Only the home team of the current sport: names, numbers, positions, "say it like" hints, nothing else. */
export function exportTeamFile(state: AppState): TeamFile {
  const r = currentRoster(state);
  return {
    fanfareTeam: 1, sport: state.sport, teamName: r.homeTeam, teamSayAs: r.homeSayAs,
    teamOrigSpelling: r.homeOrigSpelling, teamNameLang: r.homeNameLang,
    players: r.players.map(p => ({
      name: p.name, number: p.number, position: p.position, onField: p.onField, sayAs: p.sayAs,
      origSpelling: p.origSpelling, nameLang: p.nameLang,
    })),
  };
}

/** Validates untrusted JSON; unknown fields are dropped. Throws ImportError('invalid-data' | 'bad-version'). */
export function parseTeamFile(json: unknown): TeamFile {
  if (!isObj(json)) throw invalidData();
  if (typeof json.fanfareTeam === 'number' && json.fanfareTeam !== 1) throw new ImportError('bad-version');
  if (json.fanfareTeam !== 1) throw invalidData();
  if (!SPORT_IDS.includes(json.sport as SportId)) throw invalidData();
  if (!Array.isArray(json.players) || json.players.length > MAX_TEAM_PLAYERS) throw invalidData();
  const players = json.players.map(v => {
    if (!isObj(v) || typeof v.name !== 'string' || typeof v.onField !== 'boolean') throw invalidData();
    const name = v.name.trim().slice(0, 60);
    if (name === '') throw invalidData();
    return { name, number: str(v.number, 3), position: str(v.position, 60), onField: v.onField, sayAs: str(v.sayAs, 80),
      origSpelling: str(v.origSpelling, MAX_ORIG_SPELLING), nameLang: str(v.nameLang, MAX_NAME_LANG) };
  });
  return { fanfareTeam: 1, sport: json.sport as SportId, teamName: str(json.teamName, 80), teamSayAs: str(json.teamSayAs, 80),
    teamOrigSpelling: str(json.teamOrigSpelling, MAX_ORIG_SPELLING), teamNameLang: str(json.teamNameLang, MAX_NAME_LANG), players };
}

function slug(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

export function teamFileName(homeTeam: string, d: Date = new Date()): string {
  return `fanfare-team-${slug(homeTeam) || 'team'}-${dateStamp(d)}.json`;
}
