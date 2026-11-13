#!/usr/bin/env node
// postbuild (after build-manual): hashes dist/, injects the precache list and
// version into src/sw.ts and bundles it to dist/sw.js.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { build } from 'vite';
import { buildPrecache } from './precache.mjs';

const dist = process.argv[2] ?? 'dist';

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'voices') continue; // ~660 MB, never precached
      out.push(...(await walk(p)));
    } else out.push(p);
  }
  return out;
}

const files = [];
for (const file of await walk(dist)) {
  const hash = createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 16);
  files.push({ path: relative(dist, file), hash });
}
const { entries, version } = buildPrecache(files);

await build({
  configFile: false,
  logLevel: 'warn',
  define: { __PRECACHE__: JSON.stringify(entries), __VERSION__: JSON.stringify(version) },
  build: {
    outDir: dist,
    emptyOutDir: false,
    copyPublicDir: false,
    minify: true,
    lib: { entry: 'src/sw.ts', formats: ['iife'], name: 'fanfareSw', fileName: () => 'sw.js' },
  },
});
console.log(`sw.js: version ${version}, ${entries.length} precached files`);
