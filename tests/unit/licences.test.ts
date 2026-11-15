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

test('idb-keyval: its own notice word for word and the full Apache-2.0 text (section 4a)', () => {
  expect(notices).toContain(read('node_modules/idb-keyval/LICENCE').trim());
  for (const part of [
    'TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION', '1. Definitions.', '4. Redistribution.',
    '9. Accepting Warranty or Additional Liability.', 'END OF TERMS AND CONDITIONS',
  ]) expect(notices, part).toContain(part);
});

test('no copyright line is given that the package itself does not state', () => {
  expect(notices).not.toContain('Mintplex Labs Inc. and contributors');
  expect(notices).not.toContain('Copyright (c) Konstantin Paulus');
  const author = (name: string) => (JSON.parse(read(`node_modules/${name}/package.json`)) as { author: string }).author;
  expect(notices).toContain(`"author": "${author('@mintplex-labs/piper-tts-web')}"`);
  expect(notices).toContain(`"author": "${author('@diffusionstudio/piper-wasm')}"`);
  // ONNX Runtime states its line in the shipped files
  expect(read('node_modules/onnxruntime-web/dist/ort.wasm-core.min.js')).toContain('Copyright (c) Microsoft Corporation. All rights reserved.');
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

test('the licence page the app links to is a plain-text copy of voices/LICENSES.md, kept in step', () => {
  expect(read('public/licenses/VOICE-LICENSES.txt')).toBe(licenses);
});
