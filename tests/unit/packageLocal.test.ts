// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileList } from '../../scripts/package-local.mjs';
import { writeTarGz } from '../../scripts/tar.mjs';

const VOICE = {
  de: 'de/de_DE/thorsten/medium/de_DE-thorsten-medium',
  en: 'en/en_US/ljspeech/medium/en_US-ljspeech-medium',
};

/** A small stand-in for dist/: two voices, the licence files, the manual. */
function fakeDist(): string {
  const root = mkdtempSync(join(tmpdir(), 'fanfare-dist-'));
  const put = (rel: string, body = rel) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
  put('index.html');
  put('manual/index.html');
  put('voices/LICENSES.md');
  put('licenses/THIRD-PARTY-NOTICES.txt');
  for (const v of Object.values(VOICE)) { put(`voices/${v}.onnx`); put(`voices/${v}.onnx.json`); }
  return root;
}

const names = (variant: string, dist: string) => fileList(variant, '1.0.0', dist).map(([, name]) => name);
const extract = (archive: string, into: string) => {
  const r = spawnSync('tar', ['-xzf', archive, '-C', into]);
  expect(r.status, String(r.stderr)).toBe(0);
};

test('a language package holds that voice only, plus the app, manual, readme and licences', () => {
  const n = names('de', fakeDist());
  expect(n).toContain(`fanfare/voices/${VOICE.de}.onnx`);
  expect(n.some(x => x.startsWith('fanfare/voices/en/'))).toBe(false);
  for (const f of ['voices/LICENSES.md', 'licenses/THIRD-PARTY-NOTICES.txt', 'LICENSE', 'README-local.txt', 'manual/index.html', 'index.html'])
    expect(n).toContain(`fanfare/${f}`);
});

test('"none" has no voice models but keeps the voice licences', () => {
  const n = names('none', fakeDist());
  expect(n.filter(x => x.endsWith('.onnx'))).toEqual([]);
  expect(n).toContain('fanfare/voices/LICENSES.md');
});

test('"all" has every voice', () => {
  expect(names('all', fakeDist()).filter(x => x.endsWith('.onnx'))).toHaveLength(2);
});

test('start files and the local server are executable', () => {
  const modes = new Map(fileList('none', '1.0.0', fakeDist()).map(([, name, mode]) => [name, mode]));
  expect(modes.get('fanfare/start-fanfare.sh')).toBe(0o755);
  expect(modes.get('fanfare/start-fanfare.command')).toBe(0o755);
  expect(modes.get('fanfare/fanfare-local.py')).toBe(0o755);
  expect(modes.get('fanfare/README-local.txt')).toBe(0o644);
});

test('an unknown voice selection is refused', () => {
  expect(() => fileList('xx', '1.0.0', fakeDist())).toThrow('Unknown voice selection "xx"');
});

describe.skipIf(process.platform === 'win32')('tar.gz', () => {
  test('round trip keeps bytes, long paths and the executable bit', async () => {
    const src = mkdtempSync(join(tmpdir(), 'tar-src-'));
    const longName = `fanfare/${'a'.repeat(60)}/${'b'.repeat(50)}.txt`; // > 100 characters
    writeFileSync(join(src, 'one'), 'hello');
    writeFileSync(join(src, 'two'), Buffer.from([0, 1, 2, 255]));
    writeFileSync(join(src, 'run'), '#!/bin/sh\necho hi\n');
    const out = join(src, 'x.tar.gz');
    const mtime = new Date('2026-11-17T12:00:00Z');
    await writeTarGz(out, [
      { src: join(src, 'one'), name: 'fanfare/one.txt', mode: 0o644, mtime },
      { src: join(src, 'two'), name: longName, mode: 0o644, mtime },
      { src: join(src, 'run'), name: 'fanfare/run.sh', mode: 0o755, mtime },
    ]);
    const into = mkdtempSync(join(tmpdir(), 'tar-out-'));
    extract(out, into);
    expect(readFileSync(join(into, 'fanfare/one.txt'), 'utf8')).toBe('hello');
    expect([...readFileSync(join(into, longName))]).toEqual([0, 1, 2, 255]);
    expect(statSync(join(into, 'fanfare/run.sh')).mode & 0o777).toBe(0o755);
  });

  test('unpacking "none" over a language package keeps that voice', async () => {
    const dist = fakeDist();
    const work = mkdtempSync(join(tmpdir(), 'overlay-'));
    const pack = async (variant: string) => {
      const out = join(work, `${variant}.tar.gz`);
      await writeTarGz(out, fileList(variant, '1.0.0', dist).map(([s, name, mode]) => ({ src: s, name, mode, mtime: new Date() })));
      return out;
    };
    const into = join(work, 'club');
    mkdirSync(into);
    extract(await pack('de'), into);
    extract(await pack('none'), into);
    expect(existsSync(join(into, `fanfare/voices/${VOICE.de}.onnx`))).toBe(true);
    expect(existsSync(join(into, 'fanfare/index.html'))).toBe(true);
  });
});

test('without dist/ the packager builds first instead of failing on the missing folder', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'fresh-clone-'));
  mkdirSync(join(cwd, 'src/tts'), { recursive: true });
  writeFileSync(join(cwd, 'src/tts/voices.json'), readFileSync('src/tts/voices.json'));
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', scripts: { build: 'exit 3' } }));
  const r = spawnSync(process.execPath, [join(process.cwd(), 'scripts/package-local.mjs'), '--voices', 'de'], { cwd, encoding: 'utf8' });
  expect(r.stdout + r.stderr).toContain('dist/ not found: building first');
  expect(r.stderr).not.toContain('ENOENT');
});

test('an unknown selection is refused before anything is built', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'fresh-clone-'));
  mkdirSync(join(cwd, 'src/tts'), { recursive: true });
  writeFileSync(join(cwd, 'src/tts/voices.json'), readFileSync('src/tts/voices.json'));
  const r = spawnSync(process.execPath, [join(process.cwd(), 'scripts/package-local.mjs'), '--voices', 'xx'], { cwd, encoding: 'utf8' });
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('Unknown voice selection "xx"');
  expect(r.stdout).not.toContain('building first');
});
