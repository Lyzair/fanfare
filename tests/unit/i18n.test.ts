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
    expect(tpl.guestIntro).toContain('{opponent}'); expect(tpl.guestScore).toContain('{opponent}'); expect(tpl.guestScore).toContain('{name}');
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
test('phone remote: the ruled wording in en and de', () => {
  expect(t('en', 'remoteNeedsLocal')).toBe('Phone remote needs Fanfare running on this laptop. See the manual: "No internet at all?"');
  expect(t('de', 'remoteNeedsLocal')).toBe('Die Handy-Fernbedienung braucht Fanfare auf diesem Laptop. Siehe Anleitung: „Ganz ohne Internet?“');
  expect(t('en', 'remoteUnencrypted')).toBe('Connection not encrypted: others on this Wi-Fi could see player names and send commands they intercept. Use --https for encryption (see risks).');
  expect(t('de', 'remoteUnencrypted')).toBe('Verbindung nicht verschlüsselt: Andere im WLAN könnten Spielernamen sehen und abgefangene Befehle senden. Mit --https verschlüsseln (Risiken beachten).');
  for (const lang of LANGS) expect(t(lang, 'remoteUnencrypted')).toContain('--https');
});

describe('translated templates keep the structure of the English ones', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  /** The placeholders of every optional [section], one sorted list per section, sections sorted. */
  const sections = (s: string) => [...s.matchAll(/\[([^\[\]]*)\]/g)].map(m => placeholders(m[1]).join(',')).sort();

  test.each(LANGS.filter(l => l !== 'en'))('%s: same placeholders and the same optional sections for every sport', lang => {
    for (const sport of SPORT_IDS) {
      const en = defaultTemplates(sport, 'en'), tr = defaultTemplates(sport, lang);
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        const where = `${lang} ${sport} ${key}: ${tr[key]}`;
        expect(placeholders(tr[key]), where).toEqual(placeholders(en[key]));
        expect(sections(tr[key]), where).toEqual(sections(en[key]));
        expect(tr[key], where).not.toMatch(/\{score\}/); // the score word is filled in by the pack
        expect((tr[key].match(/\[/g) ?? []).length, where).toBe((tr[key].match(/\]/g) ?? []).length);
      }
    }
  });
});
