import { runRemoteCommand } from '../../src/remote/dispatch';
import type { RemoteCommand } from '../../src/remote/protocol';
import type { ActionEnv } from '../../src/ui/actions';
import { initialState, reducer } from '../../src/state/reducer';
import type { QueueItem } from '../../src/audio/queue';

function setup(opts: { sounds?: boolean } = {}) {
  let s = initialState('en');
  s = reducer(s, { type: 'setMatch', patch: { homeTeam: 'FC Test', opponent: 'SV Gegner' } });
  s = reducer(s, { type: 'addPlayers', text: '7 Lea\n9 Tom', onField: true });
  s = reducer(s, { type: 'importGuestTeam', team: {
    fanfareTeam: 1, sport: 'football', teamName: 'SV Gegner', teamSayAs: '', teamOrigSpelling: '', teamNameLang: '',
    players: [{ name: 'Pat', number: '3', position: '', onField: true, sayAs: '', origSpelling: '', nameLang: '' }],
  } });
  if (opts.sounds === false) s = reducer(s, { type: 'setSoundsEnabled', on: false });
  const spoken: string[] = [];
  const queue = {
    unlock: vi.fn(), stop: vi.fn(),
    play: vi.fn(async (items: QueueItem[]) => { for (const it of items) if (typeof it === 'function') await it(); }),
  };
  const speech = { get: vi.fn(async (_v: string, text: string) => { spoken.push(text); return new Blob(['x']); }) };
  const env = { state: s, queue, speech, blobs: {} } as unknown as ActionEnv;
  const roster = s.rosters.football!;
  return { env, queue, speech, spoken, roster, lea: roster.players[0], pat: roster.guestPlayers[0] };
}

test('commands are ignored until the speaker is activated', () => {
  const { env, queue } = setup();
  const cmds: RemoteCommand[] = [{ cmd: 'stop', args: {} }, { cmd: 'announce', args: { part: 'all' } }, { cmd: 'score', args: { team: 'home' } }];
  for (const cmd of cmds) {
    expect(runRemoteCommand(cmd, env, false)).toBe(false);
  }
  expect(queue.unlock).not.toHaveBeenCalled();
  expect(queue.play).not.toHaveBeenCalled();
  expect(queue.stop).not.toHaveBeenCalled();
});

test('announce plays the same lineup sequence as the Announce button (guests first)', async () => {
  const { env, queue, spoken } = setup();
  expect(runRemoteCommand({ cmd: 'announce', args: { part: 'all' } }, env, true)).toBe(true);
  expect(queue.unlock.mock.invocationCallOrder[0]).toBeLessThan(queue.play.mock.invocationCallOrder[0]);
  const items = queue.play.mock.calls[0][0];
  expect(items[0]).toBeInstanceOf(Blob); // intro sound
  expect(items).toHaveLength(1 + 2 + 3); // sound + guest intro/Pat + intro/Lea/Tom
  await vi.waitFor(() => expect(spoken).toHaveLength(5));
  expect(spoken[1]).toContain('Pat');
  expect(spoken[3]).toContain('Lea');
});

test('announce guests / home play only that team', () => {
  const { env, queue } = setup();
  runRemoteCommand({ cmd: 'announce', args: { part: 'guests' } }, env, true);
  runRemoteCommand({ cmd: 'announce', args: { part: 'home' } }, env, true);
  expect(queue.play.mock.calls[0][0]).toHaveLength(1 + 2);
  expect(queue.play.mock.calls[1][0]).toHaveLength(1 + 3);
});

test('score: sound then call, scorer named when the id is a field player of that team', async () => {
  const { env, queue, spoken, lea, pat } = setup();
  runRemoteCommand({ cmd: 'score', args: { team: 'home', player: lea.id } }, env, true);
  expect(queue.unlock).toHaveBeenCalled();
  const items = queue.play.mock.calls[0][0];
  expect(items).toHaveLength(2);
  expect(items[0]).toBeInstanceOf(Blob);
  await vi.waitFor(() => expect(spoken).toHaveLength(1));
  expect(spoken[0]).toContain('Lea');
  runRemoteCommand({ cmd: 'score', args: { team: 'guest', player: pat.id } }, env, true);
  await vi.waitFor(() => expect(spoken).toHaveLength(2));
  expect(spoken[1]).toContain('Pat');
  // a home id with team guest (or an unknown id) is a plain team goal, never an error
  runRemoteCommand({ cmd: 'score', args: { team: 'guest', player: lea.id } }, env, true);
  runRemoteCommand({ cmd: 'score', args: { team: 'home', player: 'nope' } }, env, true);
  await vi.waitFor(() => expect(spoken).toHaveLength(4));
  expect(spoken[2]).not.toContain('Lea');
  expect(spoken[3]).not.toContain('Lea');
});

test('score without sounds plays just the call', () => {
  const { env, queue } = setup({ sounds: false });
  runRemoteCommand({ cmd: 'score', args: { team: 'home' } }, env, true);
  expect(queue.play.mock.calls[0][0]).toHaveLength(1);
});

test('stop, sound and player', async () => {
  const { env, queue, spoken, lea } = setup();
  runRemoteCommand({ cmd: 'stop', args: {} }, env, true);
  expect(queue.stop).toHaveBeenCalled();
  runRemoteCommand({ cmd: 'sound', args: { slot: 'intro' } }, env, true);
  runRemoteCommand({ cmd: 'sound', args: { slot: 'score' } }, env, true);
  expect(queue.play.mock.calls.map(c => c[0].length)).toEqual([1, 1]);
  expect(queue.play.mock.calls[0][0][0]).toBeInstanceOf(Blob);
  expect(runRemoteCommand({ cmd: 'player', args: { id: lea.id } }, env, true)).toBe(true);
  await vi.waitFor(() => expect(spoken).toHaveLength(1));
  expect(spoken[0]).toContain('Lea');
  expect(runRemoteCommand({ cmd: 'player', args: { id: 'nope' } }, env, true)).toBe(false);
});
