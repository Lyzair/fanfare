import { buildSnapshot, parseCommand } from '../../src/remote/protocol';
import { initialState, reducer } from '../../src/state/reducer';
import type { AppState } from '../../src/domain/model';

function state(): AppState {
  let s = initialState('en');
  s = reducer(s, { type: 'setMatch', patch: { homeTeam: 'FC Example', opponent: 'SV Sample' } });
  s = reducer(s, { type: 'addPlayers', text: '7 Lea\n9 Tom', onField: true });
  s = reducer(s, { type: 'addPlayers', text: '12 Benchy', onField: false });
  const players = s.rosters.football!.players;
  s = reducer(s, { type: 'updatePlayer', id: players[0].id, patch: { position: 'Goalkeeper', customText: 'SECRET TEXT', sayAs: 'SECRET SAYAS' }, side: 'home' });
  return reducer(s, { type: 'importGuestTeam', team: {
    fanfareTeam: 1, sport: 'football', teamName: 'SV Sample', teamSayAs: '', teamOrigSpelling: '', teamNameLang: '',
    players: [
      { name: 'Pat', number: '3', position: '', onField: true, sayAs: '', origSpelling: '', nameLang: '' },
      { name: 'Bench Guest', number: '4', position: '', onField: false, sayAs: '', origSpelling: '', nameLang: '' },
    ],
  } });
}

test('snapshot has only what the soundboard needs', () => {
  const s = state();
  const snap = buildSnapshot(s, true, true);
  const roster = s.rosters.football!;
  expect(snap).toEqual({
    sport: 'football', scoreWord: 'Goal', hasGuests: true, playing: true, activated: true,
    home: { name: 'FC Example', players: roster.players.filter(p => p.onField).map(p => ({ id: p.id, name: p.name })) },
    guest: { name: 'SV Sample', players: roster.guestPlayers.filter(p => p.onField).map(p => ({ id: p.id, name: p.name })) },
  });
  const text = JSON.stringify(snap);
  for (const leaked of ['SECRET', 'Goalkeeper', '"number"', 'position', 'Benchy', 'Bench Guest', 'customText', 'sayAs']) expect(text).not.toContain(leaked);
  expect(Object.keys(snap.home.players[0]).sort()).toEqual(['id', 'name']);
});

test('snapshot without guests and with another language', () => {
  let s = reducer(initialState('de'), { type: 'addPlayers', text: 'Lea', onField: true });
  s = reducer(s, { type: 'setSport', sport: 'basketball' });
  const snap = buildSnapshot(s, false, false);
  expect(snap.hasGuests).toBe(false);
  expect(snap.guest.players).toEqual([]);
  expect(snap.sport).toBe('basketball');
  expect(snap.scoreWord).toBe('Korb');
  expect(snap.playing).toBe(false);
  expect(snap.activated).toBe(false);
});

test('parseCommand accepts only the allowlist', () => {
  expect(parseCommand({ cmd: 'announce', args: { part: 'all' } })).toEqual({ cmd: 'announce', args: { part: 'all' } });
  expect(parseCommand({ cmd: 'announce', args: { part: 'guests' } })).not.toBeNull();
  expect(parseCommand({ cmd: 'score', args: { team: 'guest', player: 'abc-1' } })).toEqual({ cmd: 'score', args: { team: 'guest', player: 'abc-1' } });
  expect(parseCommand({ cmd: 'score', args: { team: 'home', extra: 1 } })).toEqual({ cmd: 'score', args: { team: 'home' } });
  expect(parseCommand({ cmd: 'stop' })).toEqual({ cmd: 'stop', args: {} });
  expect(parseCommand({ cmd: 'sound', args: { slot: 'intro' } })).not.toBeNull();
  expect(parseCommand({ cmd: 'player', args: { id: 'p1' } })).not.toBeNull();
  for (const bad of [null, 5, 'stop', {}, { cmd: 'eval' }, { cmd: 'announce', args: { part: 'x' } }, { cmd: 'score', args: { team: 'both' } },
    { cmd: 'score', args: { team: 'home', player: '../x' } }, { cmd: 'sound', args: { slot: 'other' } }, { cmd: 'player', args: {} }]) {
    expect(parseCommand(bad)).toBeNull();
  }
});
