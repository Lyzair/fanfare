import { playersOf } from '../domain/model';
import { currentRoster } from '../state/reducer';
import { announce, callScore, playPlayer, playSound, stopPlaying } from '../ui/actions';
import type { ActionEnv, LineupPart } from '../ui/actions';
import type { RemoteCommand } from './protocol';

const PARTS: Record<'all' | 'guests' | 'home', LineupPart> = { all: 'both', guests: 'guests', home: 'home' };

/**
 * Runs a command from a phone through the same action functions as the speaker's own buttons.
 * Ignored (false) until the speaker was activated: browsers only allow sound after a tap on this page.
 */
export function runRemoteCommand(command: RemoteCommand, env: ActionEnv, activated: boolean): boolean {
  if (!activated) return false;
  switch (command.cmd) {
    case 'stop': stopPlaying(env); return true;
    case 'announce': announce(env, PARTS[command.args.part]); return true;
    case 'sound': playSound(env, command.args.slot); return true;
    case 'player': return playPlayer(env, command.args.id);
    case 'score': {
      const roster = currentRoster(env.state);
      const scorer = playersOf(roster, command.args.team).find(p => p.onField && p.id === command.args.player) ?? null;
      callScore(env, command.args.team, scorer);
      return true;
    }
  }
}
