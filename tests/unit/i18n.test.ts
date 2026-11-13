import { LANGS, getPack, detectLang, defaultTemplates, t } from '../../src/i18n';
import { SPORTS, SPORT_IDS } from '../../src/domain/sports';

test.each(LANGS)('%s pack is complete', lang => {
  const p = getPack(lang), en = getPack('en');
  expect(Object.keys(p.ui).sort()).toEqual(Object.keys(en.ui).sort());
  expect(Object.values(p.ui).every(v => v.trim() !== '')).toBe(true);
  for (const id of SPORT_IDS) {
    expect(p.sports[id].name).toBeTruthy(); expect(p.sports[id].scoreWord).toBeTruthy();
    expect(p.sports[id].positions).toHaveLength(SPORTS[id].positionCount);
    const tpl = p.templates(id);
    expect(tpl.field).toContain('{name}'); expect(tpl.bench).toContain('{name}');
    expect(tpl.intro).toContain('{home}'); expect(tpl.intro).toContain('{opponent}');
    expect(Object.values(tpl).join(' ')).not.toMatch(/\{(?!name\}|number\}|position\}|home\}|opponent\})[^}]*\}/);
  }
});
test('only Arabic is right-to-left', () =>
  expect(LANGS.filter(l => getPack(l).dir === 'rtl')).toEqual(['ar']));
test('detectLang', () => {
  expect(detectLang(['de-AT', 'en'])).toBe('de');
  expect(detectLang(['ja', 'fr-CA'])).toBe('fr');
  expect(detectLang(['ja'])).toBe('en');
});
test('field counts', () => {
  expect(SPORT_IDS.map(id => SPORTS[id].fieldPlayers)).toEqual([11, 7, 5, 6, 11, 6, 6]);
});
test('default score template uses the sport score word', () => {
  expect(defaultTemplates('volleyball', 'en').score).toContain('Point');
  expect(defaultTemplates('football', 'de').score).toContain('Toooor');
});
test('staff headings and t()', () => {
  expect(getPack('de').staffHeadings).toEqual(expect.arrayContaining(['Trainer', 'Co-Trainer', 'Betreuer', 'Teamoffizielle']));
  expect(getPack('en').staffHeadings).toEqual(expect.arrayContaining(['Coach', 'Assistant coach', 'Staff', 'Team officials']));
  expect(t('en', 'appTitle')).toBe('Fanfare');
});
test('accent colours have 4.5:1 contrast against white', () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  for (const id of SPORT_IDS) expect(1.05 / (lum(SPORTS[id].accent) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
