#!/usr/bin/env node
// npm run serve:local [-- options]: builds dist/ if it is missing, then serves it with
// scripts/fanfare-local.py (e.g. npm run serve:local -- --lan).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (!existsSync('dist/index.html')) {
  console.log('dist/ not found: building first...');
  const b = spawnSync(npm, ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (b.status !== 0) process.exit(b.status ?? 1);
}
const candidates = process.platform === 'win32' ? [['py', '-3'], ['python']] : [['python3'], ['python']];
for (const [cmd, ...pre] of candidates) {
  const r = spawnSync(cmd, [...pre, 'scripts/fanfare-local.py', 'dist', ...process.argv.slice(2)], { stdio: 'inherit' });
  if (r.error?.code === 'ENOENT') continue;
  process.exit(r.status ?? 0);
}
console.error('Python 3.9 or newer is needed to serve Fanfare locally (https://www.python.org/downloads/).');
process.exit(1);
