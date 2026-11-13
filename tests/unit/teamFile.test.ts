import { exportTeamFile, parseTeamFile, teamFileName } from '../../src/io/teamFile';
import { ImportError } from '../../src/io/archive';
import { initialState, reducer, currentRoster } from '../../src/state/reducer';

const valid = {
  fanfareTeam: 1, sport: 'football', teamName: 'SV Sample', teamSayAs: 'Ess Fau', teamOrigSpelling: 'Эс Фау', teamNameLang: 'ru',
  players: [
    { name: 'Pat Gast', number: '3', position: 'Defence', onField: true, sayAs: 'Pat Guest', origSpelling: '', nameLang: '' },
    { name: 'Mika', number: '8', position: '', onField: false, sayAs: '', origSpelling: 'Мика', nameLang: 'ru' },
  ],
};
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ImportError).code; } return 'no error'; };

describe('parseTeamFile', () => {
  test('accepts a valid file', () => expect(parseTeamFile(valid)).toEqual(valid));
  test('missing marker or non-object is invalid-data', () => {
    expect(code(() => parseTeamFile({ ...valid, fanfareTeam: undefined }))).toBe('invalid-data');
    expect(code(() => parseTeamFile('x'))).toBe('invalid-data');
    expect(code(() => parseTeamFile(null))).toBe('invalid-data');
    expect(code(() => parseTeamFile([]))).toBe('invalid-data');
  });
  test('other marker version is bad-version', () => expect(code(() => parseTeamFile({ ...valid, fanfareTeam: 2 }))).toBe('bad-version'));
  test('unknown sport and wrong types are invalid-data', () => {
    expect(code(() => parseTeamFile({ ...valid, sport: 'cricket' }))).toBe('invalid-data');
    expect(code(() => parseTeamFile({ ...valid, teamName: 5 }))).toBe('invalid-data');
    expect(code(() => parseTeamFile({ ...valid, players: 'x' }))).toBe('invalid-data');
    expect(code(() => parseTeamFile({ ...valid, players: [{ ...valid.players[0], onField: 'yes' }] }))).toBe('invalid-data');
    expect(code(() => parseTeamFile({ ...valid, players: [{ ...valid.players[0], name: 4 }] }))).toBe('invalid-data');
    expect(code(() => parseTeamFile({ ...valid, players: [{ ...valid.players[0], name: '  ' }] }))).toBe('invalid-data');
  });
  test('more than 100 players is invalid-data', () => {
    const p = Array.from({ length: 101 }, (_, i) => ({ ...valid.players[0], name: `P${i}` }));
    expect(code(() => parseTeamFile({ ...valid, players: p }))).toBe('invalid-data');
    expect(parseTeamFile({ ...valid, players: p.slice(0, 100) }).players).toHaveLength(100);
  });
  test('origSpelling and nameLang travel, are validated and capped', () => {
    const out = parseTeamFile({ ...valid, teamOrigSpelling: 'O'.repeat(200), teamNameLang: 'l'.repeat(50),
      players: [{ name: 'A', onField: true, origSpelling: 'Микола', nameLang: 'uk' }] });
    expect(out.players[0]).toMatchObject({ origSpelling: 'Микола', nameLang: 'uk' });
    expect(out.teamOrigSpelling).toHaveLength(80);
    expect(out.teamNameLang).toHaveLength(20);
    expect(code(() => parseTeamFile({ ...valid, players: [{ name: 'A', onField: true, nameLang: 5 }] }))).toBe('invalid-data');
    expect(code(() => parseTeamFile({ ...valid, teamOrigSpelling: 5 }))).toBe('invalid-data');
  });
  test('extra fields are dropped, missing optional fields default, strings are capped', () => {
    const out = parseTeamFile({
      ...valid, secret: 1, clips: 'x', teamName: 'N'.repeat(200),
      players: [{ name: 'A'.repeat(100), number: '1234', onField: true, customText: 'hi', id: 'zzz' }],
    });
    expect(out).not.toHaveProperty('secret');
    expect(out.players[0]).toEqual({ name: 'A'.repeat(60), number: '123', position: '', onField: true, sayAs: '', origSpelling: '', nameLang: '' });
    expect(out.teamName).toHaveLength(80);
    expect(out.teamSayAs).toBe('Ess Fau');
  });
});

describe('exportTeamFile', () => {
  test('exports the home team of the current sport only', () => {
    let s = reducer(initialState('en'), { type: 'setMatch', home: 'FC Example', homeSayAs: 'F C Example', opponent: 'Other' });
    s = reducer(s, { type: 'addPlayers', text: '7 Lea', onField: true });
    s = reducer(s, { type: 'addPlayers', text: '12 Tom', onField: false });
    s = reducer(s, { type: 'updatePlayer', id: currentRoster(s).players[0].id, patch: { sayAs: 'Lee-ah', customText: 'secret' } });
    const f = exportTeamFile(s);
    expect(f).toEqual({
      fanfareTeam: 1, sport: 'football', teamName: 'FC Example', teamSayAs: 'F C Example', teamOrigSpelling: '', teamNameLang: '',
      players: [
        { name: 'Lea', number: '7', position: '', onField: true, sayAs: 'Lee-ah', origSpelling: '', nameLang: '' },
        { name: 'Tom', number: '12', position: '', onField: false, sayAs: '', origSpelling: '', nameLang: '' },
      ],
    });
    expect(JSON.stringify(f)).not.toContain('secret');
  });
  test('round-trips through JSON and parse', () => {
    let s = reducer(initialState('en'), { type: 'setMatch', home: 'FC Example' });
    s = reducer(s, { type: 'addPlayers', text: '7 Lea', onField: true });
    const f = exportTeamFile(s);
    expect(parseTeamFile(JSON.parse(JSON.stringify(f)))).toEqual(f);
  });
});

describe('teamFileName', () => {
  const day = new Date(2026, 10, 3);
  test('slugs the home team', () => expect(teamFileName('FC Beispiel-Süd 04!', day)).toBe('fanfare-team-fc-beispiel-sud-04-2026-11-03.json'));
  test('falls back to "team"', () => {
    expect(teamFileName('', day)).toBe('fanfare-team-team-2026-11-03.json');
    expect(teamFileName('فريق', day)).toBe('fanfare-team-team-2026-11-03.json');
  });
});
