import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { LANGS, t } from '../../src/i18n';

const read = (p: string) => readFileSync(p, 'utf8');
const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
const notices = read('public/licenses/THIRD-PARTY-NOTICES.txt');
const licenses = read('public/voices/LICENSES.md');
const installed = (name: string) => (JSON.parse(read(`node_modules/${name}/package.json`)) as { version: string }).version;

test('the notices file carries Fanfare\'s own licence text word for word', () => {
  expect(notices).toContain(read('LICENSE').trim());
});

test('every bundled runtime package is named with the installed version', () => {
  for (const name of [...Object.keys(pkg.dependencies), 'onnxruntime-web', '@diffusionstudio/piper-wasm']) {
    expect(notices, name).toContain(`${name} ${installed(name)}`);
  }
  expect(notices).toContain('Permission is hereby granted, free of charge');
  expect(notices).toContain('Licensed under the Apache License, Version 2.0'); // idb-keyval
});

test('LICENSES.md names the exact corresponding source of the GPL parts and links the notices', () => {
  expect(licenses).toContain('https://registry.npmjs.org/@diffusionstudio/piper-wasm/-/piper-wasm-1.0.0.tgz');
  expect(licenses).toMatch(/piper-wasm\/tree\/[0-9a-f]{40}/);
  expect(licenses.match(/rhasspy\/espeak-ng\/tree\/[0-9a-f]{40}/g)).toHaveLength(2); // code and data
  expect(licenses).toMatch(/wide-video\/piper-phonemize\/tree\/[0-9a-f]{40}/);
  expect(licenses).toContain('../licenses/GPL-3.0.txt');
  expect(licenses).toContain('../licenses/THIRD-PARTY-NOTICES.txt');
});

test('the licence notice is reachable: app string in every language, local zip README and zip contents', () => {
  for (const lang of LANGS) expect(t(lang, 'licencesLink').length, lang).toBeGreaterThan(3);
  const readme = read('scripts/local/README-local.txt');
  expect(readme.match(/voices\/LICENSES\.md/g)).toHaveLength(2); // en + de
  expect(readme.match(/licenses\/GPL-3\.0\.txt/g)).toHaveLength(2);
  expect(read('scripts/package-local.mjs')).toContain("['LICENSE', `${top}/LICENSE`");
});
