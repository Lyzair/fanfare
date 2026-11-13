import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePlayerLines } from '../../src/domain/roster';
import { getPack } from '../../src/i18n';

const readFixture = (n: string) => readFileSync(resolve(process.cwd(), 'tests/fixtures', n), 'utf8');
const fb = getPack('de').sports.football.positions, staff = getPack('de').staffHeadings;

test('fussball.de squad paste: headings become positions, names swapped, staff skipped', () => {
  expect(parsePlayerLines(readFixture('fussballde-kader.txt'), fb, staff)).toEqual([
    { name: 'Lea Müller', number: '1', position: 'Torwart' },
    { name: 'Can Özdemir', number: '4', position: 'Abwehr' },
    { name: "Zoë O'Neil", number: '5', position: 'Abwehr' },
    { name: 'Jan Nowak', number: '8', position: 'Mittelfeld' },
    { name: 'José Ferreira', number: '9', position: 'Angriff' }]);
});
test('fussball.de stats table: header and k.A. rows skipped, columns stripped', () => {
  expect(parsePlayerLines(readFixture('fussballde-kader-stats.txt'), fb, staff)).toEqual([
    { name: 'Lea Müller', number: '', position: '' },
    { name: 'Can Özdemir', number: '', position: '' },
    { name: "Zoë O'Neil", number: '', position: '' }]);
});
test('english table header is skipped too', () => {
  expect(parsePlayerLines('Player\tAppearances\tMinutes\tGoals\nLea\t1\t2\t3', fb, staff).map(p => p.name)).toEqual(['Lea']);
});
test('plain lines: trims, skips blanks, reads leading number', () => {
  expect(parsePlayerLines('  7 Max Müller \n\n#10 Zoë\nJosé 🙂\n  \n', fb, staff)).toEqual([
    { name: 'Max Müller', number: '7', position: '' }, { name: 'Zoë', number: '10', position: '' },
    { name: 'José 🙂', number: '', position: '' }]);
});
test('a single line with commas is a list of names', () =>
  expect(parsePlayerLines('Lea, Tom, Max', fb, staff).map(p => p.name)).toEqual(['Lea', 'Tom', 'Max']));
test('junk lines are skipped', () =>
  expect(parsePlayerLines('https://www.fussball.de/x\n---\n12.10.2026\nLea', fb, staff).map(p => p.name)).toEqual(['Lea']));
test('names are capped at 60 chars', () =>
  expect(parsePlayerLines('A'.repeat(70) + '\nB'.repeat(1), fb, staff)[0].name).toHaveLength(60));

test('a single pasted line starting with a number is one player (comma swap applies)', () => {
  expect(parsePlayerLines('1 Müller, Lea', fb, staff)).toEqual([{ name: 'Lea Müller', number: '1', position: '' }]);
});
test('a plain single line "Müller, Lea" stays a two-name list', () => {
  expect(parsePlayerLines('Müller, Lea', fb, staff)).toEqual([
    { name: 'Müller', number: '', position: '' }, { name: 'Lea', number: '', position: '' }]);
});
