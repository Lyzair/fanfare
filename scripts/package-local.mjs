#!/usr/bin/env node
// npm run package:local -- [--voices all|none|<lang>|every] [--format zip|tar.gz|both]
// Writes release/fanfare-<version>-<variant>.zip / .tar.gz: dist/ + fanfare-local.py + the three
// start files + README-local.txt + LICENSE. Variants differ only in voices/: "all", "none" (the
// app only, to update an existing folder) or one language. Every archive unpacks into fanfare/
// (no version in the folder name), so "none" can be unpacked over an older folder and its voices
// stay. Streams to disk (dist/ holds hundreds of MB).
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { writeTarGz } from './tar.mjs';

const LANGS = JSON.parse(readFileSync('src/tts/voices.json', 'utf8')).map((v) => v.lang);

/**
 * The files of one package as [source path, archive path, unix mode].
 * @param {string} variant "all", "none" or a language code
 * @param {string} version package version (the archive's file name carries it, the folder does not)
 * @param {string} [distRoot]
 */
export function fileList(variant, version, distRoot = 'dist') {
  if (variant !== 'all' && variant !== 'none' && !LANGS.includes(variant)) throw new Error(`Unknown voice selection "${variant}"`);
  void version;
  const top = 'fanfare';
  const keepVoice = (rel) => {
    const parts = rel.split('/');
    if (parts[0] !== 'voices' || parts.length < 3) return true; // voices/LICENSES.md stays in every package
    return variant === 'all' || parts[1] === variant;
  };
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const rel = relative(distRoot, p).split(sep).join('/');
        if (keepVoice(rel)) files.push([p, `${top}/${rel}`, 0o644]);
      }
    }
  };
  walk(distRoot);
  files.push(['scripts/fanfare-local.py', `${top}/fanfare-local.py`, 0o755]);
  for (const f of ['start-fanfare.sh', 'start-fanfare.command']) files.push([`scripts/local/${f}`, `${top}/${f}`, 0o755]);
  files.push(['scripts/local/start-fanfare.bat', `${top}/start-fanfare.bat`, 0o644]);
  files.push(['scripts/local/README-local.txt', `${top}/README-local.txt`, 0o644]);
  files.push(['LICENSE', `${top}/LICENSE`, 0o644]);
  return files;
}

function writeZip(out, files) {
  const fd = openSync(out, 'w');
  let failure = null;
  const zip = new Zip((err, chunk) => {
    if (err) failure = err;
    else writeSync(fd, chunk);
  });
  const STORED = /\.(onnx|png|jpe?g|gif|webp|mp3|ogg|m4a|woff2?|zip|gz|wasm)$/i;
  const buf = Buffer.allocUnsafe(1024 * 1024);
  for (const [src, name, mode] of files) {
    const entry = STORED.test(name) ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
    entry.mtime = statSync(src).mtime;
    entry.os = 3; // Unix, so the executable bit survives unzip
    entry.attrs = (0o100000 | mode) << 16;
    zip.add(entry);
    const rfd = openSync(src, 'r');
    for (let n; (n = readSync(rfd, buf, 0, buf.length, null)) > 0;) entry.push(new Uint8Array(buf.subarray(0, n)), false);
    entry.push(new Uint8Array(0), true);
    closeSync(rfd);
    if (failure) throw failure;
  }
  zip.end();
  closeSync(fd);
  if (failure) throw failure;
}

async function main(argv) {
  const opt = (name, fallback) => {
    const i = argv.indexOf(name);
    return i === -1 ? fallback : argv[i + 1];
  };
  const voices = opt('--voices', 'all');
  const format = opt('--format', 'both');
  if (!['zip', 'tar.gz', 'both'].includes(format)) throw new Error(`Unknown format "${format}" (zip, tar.gz or both)`);
  const variants = voices === 'every' ? ['all', 'none', ...LANGS] : [voices];
  for (const v of variants) fileList(v, ''); // refuse an unknown selection before building

  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  if (!existsSync('dist/index.html')) {
    console.log('dist/ not found: building first...');
    const b = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
    if (b.status !== 0) process.exit(b.status ?? 1);
  }
  mkdirSync('release', { recursive: true });
  for (const variant of variants) {
    const files = fileList(variant, version);
    const base = `release/fanfare-${version}-${variant}`;
    const outs = [];
    if (format !== 'tar.gz') { writeZip(`${base}.zip`, files); outs.push(`${base}.zip`); }
    if (format !== 'zip') {
      await writeTarGz(`${base}.tar.gz`, files.map(([src, name, mode]) => ({ src, name, mode, mtime: statSync(src).mtime })));
      outs.push(`${base}.tar.gz`);
    }
    for (const out of outs) console.log(`${out}: ${files.length} files, ${(statSync(out).size / 1048576).toFixed(1)} MiB`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
