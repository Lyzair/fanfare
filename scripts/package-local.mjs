#!/usr/bin/env node
// npm run package:local: release/fanfare-local-<version>.zip = dist/ + fanfare-local.py +
// the three start files + README-local.txt. Streams to disk (dist/ holds hundreds of MB).
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
if (!existsSync('dist/index.html')) {
  console.log('dist/ not found: building first...');
  const b = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

const top = `fanfare-local-${version}`;
const files = []; // [absolute path, zip path, unix mode]
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile()) files.push([p, `${top}/${relative('dist', p).split(sep).join('/')}`, 0o644]);
  }
};
walk('dist');
files.push(['scripts/fanfare-local.py', `${top}/fanfare-local.py`, 0o755]);
for (const f of ['start-fanfare.sh', 'start-fanfare.command']) files.push([`scripts/local/${f}`, `${top}/${f}`, 0o755]);
files.push(['scripts/local/start-fanfare.bat', `${top}/start-fanfare.bat`, 0o644]);
files.push(['scripts/local/README-local.txt', `${top}/README-local.txt`, 0o644]);

mkdirSync('release', { recursive: true });
const out = `release/${top}.zip`;
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
console.log(`${out}: ${files.length} files, ${(statSync(out).size / 1048576).toFixed(1)} MiB`);
