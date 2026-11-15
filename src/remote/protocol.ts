import type { AppState, Side, SoundSlot } from '../domain/model';
import { getPack } from '../i18n';
import { currentRoster } from '../state/reducer';

/** What a phone may ask the speaker to do. Mirrors the allowlist in scripts/fanfare-local.py. */
export type RemoteCommand =
  | { cmd: 'announce'; args: { part: 'all' | 'guests' | 'home' } }
  | { cmd: 'score'; args: { team: Side; player?: string } }
  | { cmd: 'stop'; args: Record<string, never> }
  | { cmd: 'sound'; args: { slot: SoundSlot } }
  | { cmd: 'player'; args: { id: string } };

export interface RemotePlayer { id: string; name: string }
export interface RemoteTeam { name: string; players: RemotePlayer[] }

/** Everything the soundboard on the phone is told: field players (id + display name), team names, flags. Nothing else. */
export interface RemoteSnapshot {
  sport: string;
  scoreWord: string;
  home: RemoteTeam;
  guest: RemoteTeam;
  hasGuests: boolean;
  playing: boolean;
  activated: boolean;
}

/** The event the relay sends phones: the latest snapshot (if any) and whether the speaker is connected. */
export interface RemoteStateEvent { state: RemoteSnapshot | null; online: boolean }

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function buildSnapshot(state: AppState, playing: boolean, activated: boolean): RemoteSnapshot {
  const roster = currentRoster(state);
  const team = (name: string, list: typeof roster.players): RemoteTeam => ({
    name,
    players: list.filter(p => p.onField).map(p => ({ id: p.id, name: p.name })),
  });
  return {
    sport: state.sport,
    scoreWord: getPack(state.lang).sports[state.sport].scoreWord,
    home: team(roster.homeTeam, roster.players),
    guest: team(roster.opponent, roster.guestPlayers),
    hasGuests: roster.guestPlayers.length > 0,
    playing,
    activated,
  };
}

/** Validates a command that arrived over the wire; unknown fields are dropped. */
export function parseCommand(raw: unknown): RemoteCommand | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { cmd, args: a = {} } = raw as { cmd?: unknown; args?: unknown };
  if (typeof cmd !== 'string' || typeof a !== 'object' || a === null) return null;
  const args = a as Record<string, unknown>;
  switch (cmd) {
    case 'stop': return { cmd, args: {} };
    case 'announce': return args.part === 'all' || args.part === 'guests' || args.part === 'home' ? { cmd, args: { part: args.part } } : null;
    case 'sound': return args.slot === 'intro' || args.slot === 'score' ? { cmd, args: { slot: args.slot } } : null;
    case 'player': return typeof args.id === 'string' && ID.test(args.id) ? { cmd, args: { id: args.id } } : null;
    case 'score': {
      if (args.team !== 'home' && args.team !== 'guest') return null;
      if (args.player === undefined) return { cmd, args: { team: args.team } };
      return typeof args.player === 'string' && ID.test(args.player) ? { cmd, args: { team: args.team, player: args.player } } : null;
    }
    default: return null;
  }
}
