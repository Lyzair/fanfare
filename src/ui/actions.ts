import { defaultSoundBlob } from '../audio/defaultSounds';
import type { AudioQueue, QueueItem } from '../audio/queue';
import { playersOf } from '../domain/model';
import type { AppState, Player, Roster, Side, SoundSlot } from '../domain/model';
import { calloutText, guestIntroText, guestScoreText, introText, scoreText, speechText } from '../domain/template';
import { currentRoster } from '../state/reducer';
import type { SpeechCache } from '../tts/speechCache';

/**
 * Everything the speaker can play. The buttons of the panels and the commands that arrive from a
 * phone remote both go through these functions, so there is one implementation of each action.
 */
export type LineupPart = 'both' | 'guests' | 'home';

export interface ActionEnv {
  state: AppState;
  queue: Pick<AudioQueue, 'unlock' | 'play' | 'stop'>;
  speech: Pick<SpeechCache, 'get'>;
  /** The user's custom sounds (null/missing = the default sound). */
  blobs: Partial<Record<SoundSlot, Blob | null>>;
  /** Called when a speech clip could not be made. */
  onError?: (e?: unknown) => void;
  /** Called right before playing starts (clears an old error). */
  onStart?: () => void;
  /** Called when the queue has finished (or was replaced). */
  onDone?: () => void;
}

/** The texts of one team in announcing order: intro, field players, bench players. */
function teamTexts(side: Side, roster: Roster): string[] {
  const players = playersOf(roster, side);
  return [
    side === 'guest' ? guestIntroText(roster) : introText(roster),
    ...players.filter(p => p.onField).map(p => calloutText(p, roster)),
    ...players.filter(p => !p.onField).map(p => calloutText(p, roster)),
  ];
}

/** Which teams a part covers: guests (when there are any) always come before our team. */
function sidesFor(roster: Roster, part: LineupPart): Side[] {
  const sides: Side[] = [];
  if (roster.guestPlayers.length > 0 && part !== 'home') sides.push('guest');
  if (part !== 'guests' || roster.guestPlayers.length === 0) sides.push('home');
  return sides;
}

/** Every speech text a full lineup needs (both teams), as passed to Prepare voices. */
export function lineupTexts(state: AppState): string[] {
  const roster = currentRoster(state);
  return sidesFor(roster, 'both').flatMap(side => teamTexts(side, roster)).map(x => speechText(x, roster)).filter(x => x.trim());
}

/** A lazy speech item: made when its turn comes; a failure is reported and the item skipped. */
function lazySpeech(state: AppState, speech: Pick<SpeechCache, 'get'>, text: string, onError?: (e: unknown) => void) {
  const roster = currentRoster(state);
  return async () => {
    try {
      return await speech.get(state.voiceId, speechText(text, roster));
    } catch (e) {
      onError?.(e);
      throw e;
    }
  };
}

/** Intro sound (if enabled) → [guest intro → guest field → guest bench →] intro → field → bench. Speech items are lazy. */
export function lineupSequence(
  state: AppState,
  speech: Pick<SpeechCache, 'get'>,
  introSound: Blob | null,
  onError?: (e: unknown) => void,
  part: LineupPart = 'both',
): Array<Blob | (() => Promise<Blob>)> {
  const roster = currentRoster(state);
  const items: Array<Blob | (() => Promise<Blob>)> = [];
  if (state.soundsEnabled) items.push(introSound ?? defaultSoundBlob('intro'));
  for (const text of sidesFor(roster, part).flatMap(side => teamTexts(side, roster))) {
    if (text.trim()) items.push(lazySpeech(state, speech, text, onError));
  }
  return items;
}

function playItems(env: Pick<ActionEnv, 'queue' | 'onStart' | 'onDone'>, items: QueueItem[]): void {
  env.queue.unlock(); // synchronously inside the click, before anything async
  env.onStart?.();
  const run = env.queue.play(items);
  if (env.onDone) void run.finally(env.onDone); else void run;
}

/** Say one text (e.g. one player's announcement). Blank text plays nothing. */
export function playText(env: ActionEnv, text: string): void {
  if (!text.trim()) return;
  playItems(env, [lazySpeech(env.state, env.speech, text, env.onError)]);
}

/** Say `text` exactly as written, without the "say it like" replacements: the ▶ buttons that try out a spelling. */
export function playVoiceText(env: Pick<ActionEnv, 'queue' | 'speech' | 'onStart' | 'onError'>, voiceId: string, text: string): void {
  if (!text.trim()) return;
  playItems(env, [async () => {
    try {
      return await env.speech.get(voiceId, text);
    } catch (e) {
      env.onError?.(e);
      throw e;
    }
  }]);
}

export function announce(env: ActionEnv, part: LineupPart): void {
  playItems(env, lineupSequence(env.state, env.speech, env.blobs.intro ?? null, env.onError, part));
}

/** Score sound (if enabled), then the goal call for our team or the guests, naming the scorer when given. */
export function callScore(env: ActionEnv, team: Side, scorer: Player | null): void {
  const roster = currentRoster(env.state);
  const text = team === 'guest' ? guestScoreText(scorer, roster) : scoreText(scorer, roster);
  const items: QueueItem[] = [];
  if (env.state.soundsEnabled) items.push(env.blobs.score ?? defaultSoundBlob('score'));
  items.push(lazySpeech(env.state, env.speech, text, env.onError));
  playItems(env, items);
}

/** Play a sound slot (custom or default) on its own. */
export function playSound(env: ActionEnv, slot: SoundSlot): void {
  playItems(env, [env.blobs[slot] ?? defaultSoundBlob(slot)]);
}

/** Say one player's announcement text (field or bench, our team or the guests). */
export function playPlayer(env: ActionEnv, id: string): boolean {
  const roster = currentRoster(env.state);
  const player = [...roster.players, ...roster.guestPlayers].find(p => p.id === id);
  if (!player) return false;
  playText(env, calloutText(player, roster));
  return true;
}

export function stopPlaying(env: Pick<ActionEnv, 'queue'>): void {
  env.queue.stop();
}
