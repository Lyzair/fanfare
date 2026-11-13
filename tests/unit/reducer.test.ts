import { reducer, initialState, currentRoster } from '../../src/state/reducer';
import { defaultTemplates } from '../../src/i18n';
import { defaultVoiceFor } from '../../src/tts/voices';

test('pasted positions switch "Use positions" on', () => {
  const s = reducer(initialState('de'), { type: 'addPlayers', text: 'Torwart\n1 Lea', onField: true });
  expect(currentRoster(s).showPositions).toBe(true);
});
test('duplicate names become distinct players', () => {
  const s = reducer(initialState('en'), { type: 'addPlayers', text: 'Max\nMax', onField: true });
  const ps = currentRoster(s).players; expect(ps).toHaveLength(2); expect(ps[0].id).not.toBe(ps[1].id);
});
test('rosters are kept per sport', () => {
  let s = reducer(initialState('en'), { type: 'addPlayers', text: 'Lea', onField: true });
  s = reducer(s, { type: 'setSport', sport: 'handball' });
  expect(currentRoster(s).players).toHaveLength(0);
  s = reducer(s, { type: 'setSport', sport: 'football' });
  expect(currentRoster(s).players[0].name).toBe('Lea');
});
test('setMatch updates only the given field', () => {
  let s = reducer(initialState('en'), { type: 'setMatch', home: 'FC A' });
  s = reducer(s, { type: 'setMatch', opponent: 'SV X' });
  expect(currentRoster(s).homeTeam).toBe('FC A'); expect(currentRoster(s).opponent).toBe('SV X');
});
test('setLang swaps untouched templates and voice, keeps edited templates', () => {
  let s = initialState('en');
  s = reducer(s, { type: 'setTemplate', key: 'score', text: 'My score' });
  s = reducer(s, { type: 'setLang', lang: 'de' });
  const r = currentRoster(s), d = defaultTemplates('football', 'de');
  expect(r.templates.score).toBe('My score');
  expect(r.templates.intro).toBe(d.intro);
  expect(s.voiceId).toBe(defaultVoiceFor('de'));
});
test('updatePlayer with empty name is ignored', () => {
  let s = reducer(initialState('en'), { type: 'addPlayers', text: 'Lea', onField: true });
  const id = currentRoster(s).players[0].id;
  s = reducer(s, { type: 'updatePlayer', id, patch: { name: '  ' } });
  expect(currentRoster(s).players[0].name).toBe('Lea');
});
test('updatePlayer normalises blank customText to null', () => {
  let s = reducer(initialState('en'), { type: 'addPlayers', text: 'Lea', onField: true });
  const id = currentRoster(s).players[0].id;
  s = reducer(s, { type: 'updatePlayer', id, patch: { customText: 'Hi' } });
  expect(currentRoster(s).players[0].customText).toBe('Hi');
  s = reducer(s, { type: 'updatePlayer', id, patch: { customText: '   ' } });
  expect(currentRoster(s).players[0].customText).toBeNull();
});
test('reducer does not mutate input', () => {
  const s = initialState('en'); const f = structuredClone(s);
  reducer(s, { type: 'setMatch', home: 'X' }); expect(s).toEqual(f);
});
test('movePlayer moves and is a no-op at the boundary', () => {
  let s = reducer(initialState('en'), { type: 'addPlayers', text: 'A\nB', onField: true });
  const [a, b] = currentRoster(s).players.map(p => p.id);
  const same = reducer(s, { type: 'movePlayer', id: a, delta: -1 });
  expect(currentRoster(same).players.map(p => p.id)).toEqual([a, b]);
  s = reducer(s, { type: 'movePlayer', id: a, delta: 1 });
  expect(currentRoster(s).players.map(p => p.id)).toEqual([b, a]);
});
test('removePlayer, resetTemplates, custom sounds', () => {
  let s = reducer(initialState('en'), { type: 'addPlayers', text: 'A', onField: false });
  s = reducer(s, { type: 'removePlayer', id: currentRoster(s).players[0].id });
  expect(currentRoster(s).players).toHaveLength(0);
  s = reducer(s, { type: 'setTemplate', key: 'intro', text: 'x' });
  s = reducer(s, { type: 'resetTemplates' });
  expect(currentRoster(s).templates).toEqual(defaultTemplates('football', 'en'));
  s = reducer(s, { type: 'setCustomSound', slot: 'score', sound: { name: 'a', mime: 'audio/mpeg' } });
  expect(s.customSounds.score?.name).toBe('a');
  s = reducer(s, { type: 'setCustomSound', slot: 'score', sound: null });
  expect(s.customSounds.score).toBeUndefined();
});

test('restorePlayer re-inserts at the same index', () => {
  let s = reducer(initialState('en'), { type: 'addPlayers', text: 'A\nB\nC', onField: true });
  const [, b] = currentRoster(s).players;
  s = reducer(s, { type: 'removePlayer', id: b.id });
  s = reducer(s, { type: 'restorePlayer', player: b, index: 1 });
  expect(currentRoster(s).players.map(p => p.name)).toEqual(['A', 'B', 'C']);
  expect(reducer(s, { type: 'restorePlayer', player: b, index: 0 })).toBe(s);
});

test('sayAs round-trips through updatePlayer and setMatch', () => {
  let s = reducer(initialState('en'), { type: 'addPlayers', text: 'Zoë', onField: true });
  expect(currentRoster(s).players[0].sayAs).toBe('');
  const id = currentRoster(s).players[0].id;
  s = reducer(s, { type: 'updatePlayer', id, patch: { sayAs: 'Tso-eh' } });
  expect(currentRoster(s).players[0].sayAs).toBe('Tso-eh');
  s = reducer(s, { type: 'setMatch', homeSayAs: 'A', opponentSayAs: 'B' });
  expect(currentRoster(s)).toMatchObject({ homeSayAs: 'A', opponentSayAs: 'B', homeTeam: '' });
  expect(currentRoster(initialState('en'))).toMatchObject({ homeSayAs: '', opponentSayAs: '' });
});
