// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { LANGS } from '../../src/i18n';

test.each(LANGS)('%s manual exists, has all sections and only existing media', (lang) => {
  const md = readFileSync(`docs/manual/${lang}.md`, 'utf8');
  expect(md.match(/^## /gm)?.length).toBe(7); // same section count in every language
  const images = [...md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
  expect(images.length).toBeGreaterThanOrEqual(8);
  for (const [, src] of images) expect(existsSync(`docs/manual/${src}`)).toBe(true);
  expect(md).not.toMatch(/https?:\/\//); // relative links only
  if (lang !== 'de' && lang !== 'en') expect(md).toContain('Translation: machine-assisted');
  if (lang === 'ar') {
    expect(md.startsWith('<div dir="rtl">')).toBe(true);
    expect(md.trimEnd().endsWith('</div>')).toBe(true);
  }
});

test('index links every language', () => {
  const index = readFileSync('docs/manual/README.md', 'utf8');
  for (const lang of LANGS) expect(index).toContain(`(${lang}.md)`);
});
