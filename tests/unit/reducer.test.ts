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

describe('guest team', () => {
  const team = {
    fanfareTeam: 1 as const, sport: 'football' as const, teamName: 'SV Sample', teamSayAs: 'Ess Fau', teamOrigSpelling: 'Эс Фау', teamNameLang: 'ru',
    players: [
      { name: 'Pat Gast', number: '3', position: '', onField: true, sayAs: '', origSpelling: '', nameLang: '' },
      { name: 'Mika Besuch', number: '8', position: '', onField: false, sayAs: 'Mee-ka', origSpelling: 'Мика', nameLang: 'ru' },
    ],
  };
  test('initial roster has no guests', () => expect(currentRoster(initialState('en')).guestPlayers).toEqual([]));
  test('guest actions leave the home players alone and share the home logic', () => {
    let s = reducer(initialState('en'), { type: 'addPlayers', text: 'Lea', onField: true });
    s = reducer(s, { type: 'addPlayers', text: 'Goalkeeper\n1 Gus\n2 Gina', onField: true, side: 'guest' });
    let r = currentRoster(s);
    expect(r.players.map(p => p.name)).toEqual(['Lea']);
    expect(r.guestPlayers.map(p => p.name)).toEqual(['Gus', 'Gina']);
    const gus = r.guestPlayers[0];
    s = reducer(s, { type: 'updatePlayer', id: gus.id, patch: { sayAs: 'Gus!', name: ' Gustav ' }, side: 'guest' });
    s = reducer(s, { type: 'movePlayer', id: gus.id, delta: 1, side: 'guest' });
    r = currentRoster(s);
    expect(r.guestPlayers.map(p => p.name)).toEqual(['Gina', 'Gustav']);
    expect(r.guestPlayers[1].sayAs).toBe('Gus!');
    s = reducer(s, { type: 'removePlayer', id: gus.id, side: 'guest' });
    expect(currentRoster(s).guestPlayers.map(p => p.name)).toEqual(['Gina']);
    s = reducer(s, { type: 'restorePlayer', player: gus, index: 0, side: 'guest' });
    expect(currentRoster(s).guestPlayers.map(p => p.name)).toEqual(['Gus', 'Gina']);
    expect(currentRoster(s).players).toHaveLength(1);
  });
  test('importGuestTeam replaces guests with fresh ids and sets the opponent', () => {
    let s = reducer(initialState('en'), { type: 'addPlayers', text: 'Old', onField: true, side: 'guest' });
    const oldId = currentRoster(s).guestPlayers[0].id;
    s = reducer(s, { type: 'importGuestTeam', team });
    const r = currentRoster(s);
    expect(r.guestPlayers.map(p => [p.name, p.number, p.onField, p.sayAs, p.customText])).toEqual([
      ['Pat Gast', '3', true, '', null], ['Mika Besuch', '8', false, 'Mee-ka', null]]);
    expect(r.guestPlayers.every(p => p.id && p.id !== oldId)).toBe(true);
    expect(new Set(r.guestPlayers.map(p => p.id)).size).toBe(2);
    expect(r.opponent).toBe('SV Sample');
    expect(r.opponentSayAs).toBe('Ess Fau');
    expect([r.opponentOrigSpelling, r.opponentNameLang]).toEqual(['Эс Фау', 'ru']);
    expect([r.guestPlayers[1].origSpelling, r.guestPlayers[1].nameLang]).toEqual(['Мика', 'ru']);
    const again = currentRoster(reducer(s, { type: 'importGuestTeam', team }));
    expect(again.guestPlayers[0].id).not.toBe(r.guestPlayers[0].id);
  });
  test('importGuestTeam ignores a file for another sport', () => {
    const s = initialState('en');
    expect(reducer(s, { type: 'importGuestTeam', team: { ...team, sport: 'handball' } })).toBe(s);
  });
  test('showPositions turns on when imported guests have positions', () => {
    const s = reducer(initialState('en'), { type: 'importGuestTeam', team: { ...team, players: [{ ...team.players[0], position: 'Defence' }] } });
    expect(currentRoster(s).showPositions).toBe(true);
  });
  test('clearGuests empties the guest list but keeps the opponent', () => {
    let s = reducer(initialState('en'), { type: 'importGuestTeam', team });
    s = reducer(s, { type: 'clearGuests' });
    expect(currentRoster(s).guestPlayers).toEqual([]);
    expect(currentRoster(s).opponent).toBe('SV Sample');
  });
  test('replaceAll fills guest fields of an older saved state', () => {
    const old = initialState('de');
    const r = old.rosters.football as any;
    delete r.guestPlayers; delete r.templates.guestIntro; delete r.templates.guestScore;
    const s = reducer(initialState('en'), { type: 'replaceAll', state: old });
    expect(currentRoster(s).guestPlayers).toEqual([]);
    expect(currentRoster(s).templates.guestIntro).toBe(defaultTemplates('football', 'de').guestIntro);
  });
  test('setLang swaps untouched guest templates', () => {
    const s = reducer(initialState('en'), { type: 'setLang', lang: 'de' });
    expect(currentRoster(s).templates.guestIntro).toBe(defaultTemplates('football', 'de').guestIntro);
  });
});

describe('normalizeState via replaceAll', () => {
  const old = () => ({
    version: 1, sport: 'football', lang: 'de', voiceId: 'v', soundsEnabled: true, customSounds: {},
    rosters: { football: {
      homeTeam: 'A', opponent: 'B', showPositions: false,
      players: [{ id: 'p1', name: 'Lea', number: '7', position: '', onField: true }],
      templates: { intro: 'i', field: 'f', bench: 'b', score: 's' },
    } },
  }) as unknown as import('../../src/domain/model').AppState;
  test('a Task 4-era state gets every default', () => {
    const r = currentRoster(reducer(initialState('de'), { type: 'replaceAll', state: old() }));
    expect(r).toMatchObject({ homeSayAs: '', opponentSayAs: '', homeOrigSpelling: '', opponentOrigSpelling: '', homeNameLang: '', opponentNameLang: '', guestPlayers: [] });
    expect(r.players[0]).toMatchObject({ name: 'Lea', sayAs: '', origSpelling: '', nameLang: '', customText: null });
    expect(r.templates).toMatchObject({ intro: 'i', guestIntro: defaultTemplates('football', 'de').guestIntro, guestScore: defaultTemplates('football', 'de').guestScore });
  });
  test('speechText does not throw on a pre-hint player', async () => {
    const { speechText } = await import('../../src/domain/template');
    const r = currentRoster(reducer(initialState('de'), { type: 'replaceAll', state: old() }));
    expect(speechText('Lea 7', r)).toBe('Lea 7');
  });
});
