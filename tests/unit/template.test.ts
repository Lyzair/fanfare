import { renderTemplate, calloutText, scoreText, introText } from '../../src/domain/template';
import { defaultTemplates } from '../../src/i18n';
import type { Player, Roster } from '../../src/domain/model';

const player: Player = { id: 'p1', name: 'Lea', number: '', position: '', onField: true, customText: null };
const roster: Roster = {
  homeTeam: '', opponent: '', showPositions: true, players: [],
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
