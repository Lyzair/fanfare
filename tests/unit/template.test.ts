import { renderTemplate, calloutText, scoreText, introText, speechText, guestIntroText, guestScoreText } from '../../src/domain/template';
import { defaultTemplates } from '../../src/i18n';
import type { Player, Roster } from '../../src/domain/model';

const player: Player = { id: 'p1', name: 'Lea', number: '', position: '', onField: true, customText: null, sayAs: '', origSpelling: '', nameLang: '' };
const roster: Roster = {
  homeTeam: '', homeSayAs: '', homeOrigSpelling: '', homeNameLang: '', opponent: '', opponentSayAs: '', opponentOrigSpelling: '', opponentNameLang: '', showPositions: true, players: [], guestPlayers: [],
  templates: defaultTemplates('football', 'en'),
};

test('fills placeholders', () => expect(renderTemplate('Hi {name}!', { name: 'Lea' })).toBe('Hi Lea!'));
test('drops a bracket section whose placeholder is empty', () =>
  expect(renderTemplate('And now[ on {position}][, number {number}]: {name}!', { name: 'Lea', position: '', number: '7' }))
    .toBe('And now, number 7: Lea!'));
test('keeps bracket text without placeholders, removes brackets', () =>
  expect(renderTemplate('Go[ team]!', {})).toBe('Go team!'));
test('unknown placeholders stay literal', () => expect(renderTemplate('{foo} {name}', { name: 'A' })).toBe('{foo} A'));
test('section with only unknown placeholders is kept', () =>
  expect(renderTemplate('A[ {foo}]', {})).toBe('A {foo}'));
test('whitespace-only values count as empty', () => expect(renderTemplate('X[ {number}]', { number: '  ' })).toBe('X'));
test('customText wins over template', () => {
  expect(calloutText({ ...player, customText: 'Yay Lea' }, roster)).toBe('Yay Lea');
});
test('bench player uses bench template', () => {
  expect(calloutText({ ...player, onField: false }, roster)).toContain('bench');
});
test('positions hidden => position not spoken', () => {
  expect(calloutText({ ...player, position: 'Goalkeeper' }, { ...roster, showPositions: false })).not.toContain('Goalkeeper');
});
test('score text without scorer or home team', () => {
  expect(scoreText(null, roster)).toBe('Goal! Fantastic, keep it up!');
});
test('intro fills opponent and home', () => {
  expect(introText({ ...roster, homeTeam: 'FC Grün', opponent: 'SV Musterstadt' })).toBe(
    "Hello everyone and welcome to today's game against SV Musterstadt! Here comes the lineup of FC Grün! Let's have a fair and fun game together!");
});
test('intro without match fields still reads naturally', () => {
  expect(introText(roster)).toBe("Hello everyone and welcome! Here comes the lineup! Let's have a fair and fun game together!");
});

const sayRoster = (players: Partial<Player>[], extra: Partial<Roster> = {}): Roster => ({
  ...roster,
  players: players.map((p, i) => ({ ...player, id: `s${i}`, ...p })),
  ...extra,
});

test('speechText swaps names for their sayAs', () => {
  const r = sayRoster([{ name: 'Zoë', sayAs: 'Tso-eh' }], { opponent: 'SV Musterstadt', opponentSayAs: 'Es Fau Musterstadt' });
  expect(speechText('Go Zoë! We play SV Musterstadt.', r)).toBe('Go Tso-eh! We play Es Fau Musterstadt.');
});
test('speechText also swaps the home team', () => {
  expect(speechText('Go FC Grün!', sayRoster([], { homeTeam: 'FC Grün', homeSayAs: 'Eff Tse Grühn' }))).toBe('Go Eff Tse Grühn!');
});
test('empty sayAs leaves text unchanged', () => {
  expect(speechText('Go Lea!', sayRoster([{ name: 'Lea', sayAs: '' }, { name: 'Tom', sayAs: '  ' }]))).toBe('Go Lea!');
});
test('longer names win: "Lea Marie" sayAs before "Lea"', () => {
  const r = sayRoster([{ name: 'Lea', sayAs: 'Lee-ah' }, { name: 'Lea Marie', sayAs: 'Lay-ah Ma-ree' }]);
  expect(speechText('Lea Marie and Lea', r)).toBe('Lay-ah Ma-ree and Lee-ah');
});
test('whole-word only: "Leander" untouched when "Lea" has sayAs', () => {
  expect(speechText('Leander and Lea', sayRoster([{ name: 'Lea', sayAs: 'Lee-ah' }]))).toBe('Leander and Lee-ah');
});
test('names with regex characters are matched literally', () => {
  expect(speechText("Go O'Neil (C)!", sayRoster([{ name: "O'Neil (C)", sayAs: 'Oh-Neel' }]))).toBe('Go Oh-Neel!');
});
test('whole-word matching is Unicode aware', () => {
  const r = sayRoster([{ name: 'Müller', sayAs: 'Mueller' }, { name: 'Олег', sayAs: 'Oleg' }]);
  expect(speechText('Müller, Олег, Müllers, ХОлег', r)).toBe('Mueller, Oleg, Müllers, ХОлег');
});
test('hints are applied once: "Lea"→"Leah" does not re-match inside the output', () => {
  const r = sayRoster([{ name: 'Lea', sayAs: 'Leah' }, { name: 'Leah', sayAs: 'Lee-ah' }]);
  expect(speechText('Lea', r)).toBe('Leah');
  expect(speechText('Lea and Leah', r)).toBe('Leah and Lee-ah');
});
test('case-sensitive', () => {
  expect(speechText('lea Lea', sayRoster([{ name: 'Lea', sayAs: 'Lee-ah' }]))).toBe('lea Lee-ah');
});

describe('guest texts', () => {
  const r: Roster = { ...roster, homeTeam: 'FC A', opponent: 'SV X', opponentSayAs: 'Ess Fau X', guestPlayers: [{ ...player, id: 'g1', name: 'Gus', sayAs: 'Goose' }] };
  test('guest intro and score templates (en)', () => {
    expect(guestIntroText(r)).toBe('A warm welcome to our guests from SV X! Here is their lineup:');
    expect(guestIntroText({ ...r, opponent: '' })).toBe('A warm welcome to our guests! Here is their lineup:');
    expect(guestScoreText(r.guestPlayers[0], r)).toBe('Goal for SV X! Well played, Gus!');
    expect(guestScoreText(null, r)).toBe('Goal for SV X!');
  });
  test('de copy is exact', () => {
    const d = defaultTemplates('football', 'de');
    expect(d.guestIntro).toBe('Ein herzliches Willkommen an unsere Gäste[ vom {opponent}]! Hier ist ihre Aufstellung:');
    expect(d.guestScore).toBe('Toooor[ für {opponent}]![ Gut gespielt, {name}!]');
  });
  test('guest players use the field and bench templates', () => {
    expect(calloutText(r.guestPlayers[0], r)).toContain('Gus');
    expect(calloutText({ ...r.guestPlayers[0], onField: false }, r)).toContain('bench');
  });
  test('speechText applies guest players sayAs and the opponent hint', () => {
    expect(speechText('Welcome SV X and Gus!', r)).toBe('Welcome Ess Fau X and Goose!');
  });
});

describe('speechText without regex lookbehind (Safari before 16.4)', () => {
  const named = (name: string, sayAs: string): Player => ({ ...player, id: name, name, sayAs });
  const team: Roster = { ...roster, players: [named('Lea', 'Lay-ah'), named('Tom', 'Tomm'), named('Zoë', 'Tso-eh'), named('A.', 'Ay'), named('ab cd', 'X'), named('cd', 'Y')] };

  test('adjacent names separated by one character are both replaced', () => {
    expect(speechText('Lea, Tom', team)).toBe('Lay-ah, Tomm');
    expect(speechText('Lea Tom Lea', team)).toBe('Lay-ah Tomm Lay-ah');
    expect(speechText('Lea-Tom/Zoë', team)).toBe('Lay-ah-Tomm/Tso-eh');
  });

  test('names at the very start and end, and inside words', () => {
    expect(speechText('Tom', team)).toBe('Tomm');
    expect(speechText('Tomas and Leander, then Zoë', team)).toBe('Tomas and Leander, then Tso-eh');
    expect(speechText('7Tom Tom7 xTom', team)).toBe('7Tom Tom7 xTom');
  });

  test('a rejected match inside a word does not hide a name that starts later', () => {
    expect(speechText('xab cd', team)).toBe('xab Y');
    expect(speechText('ab cd', team)).toBe('X');
    expect(speechText('A.Tom A. Tom', team)).toBe('A.Tomm Ay Tomm');
    expect(speechText('😀Tom 😀A.', team)).toBe('😀Tomm 😀Ay');
  });

  test('the pattern uses no lookbehind', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/domain/template.ts', 'utf8')).not.toContain('(?<');
  });
});
