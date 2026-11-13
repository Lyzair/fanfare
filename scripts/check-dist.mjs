#!/usr/bin/env node
// Post-build sanity check for the static site in dist/. Exits non-zero, naming
// the offending file, when the build would break under a sub-path or contact
// another origin.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_FILE = 100 * 1024 * 1024;
const MAX_TOTAL = 1024 * 1024 * 1024;
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'";
// Identifiers and message text that are never requested: XML/MathML/SVG
// namespace names, and a documentation link ONNX Runtime prints in a warning.
const HARMLESS_URLS = [
  /^https?:\/\/www\.w3\.org\/(?:\d{4}\/[\w./-]+|XML\/1998\/namespace)$/,
  /^https:\/\/web\.dev\/cross-origin-isolation-guide\/?$/,
];

/** Replace comments with spaces, leaving string contents and code intact. */
export function stripComments(source, ext) {
  if (ext === '.html') return source.replace(/<!--[\s\S]*?-->/g, ' ');
  const lineComments = ext === '.js';
  let out = '';
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
    } else if (c === '/' && n === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      out += ' ';
    } else if (lineComments && c === '/' && n === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end;
    } else {
      if (c === '"' || c === "'" || c === '`') quote = c;
      out += c;
      i++;
    }
  }
  return out;
}

/** Problems in one html/js/css file's text; [] when clean. */
export function findProblems(source, ext) {
  const code = stripComments(source, ext);
  const problems = [];
  const abs = code.match(/\b(?:src|href)="\//g);
  if (abs) problems.push(`absolute path ${abs[0]}...: breaks under a sub-path`);
  for (const url of code.match(/https?:\/\/[^\s"'`)<>\\]+/g) ?? []) {
    if (!HARMLESS_URLS.some((re) => re.test(url))) problems.push(`external URL ${url}`);
  }
  return problems;
}

async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}

async function main() {
  const dist = join(process.argv[2] ?? 'dist');
  const errors = [];
  let total = 0;
  const files = await walk(dist);
  for (const file of files) {
    const rel = relative('.', file);
    const size = (await stat(file)).size;
    total += size;
    if (size > MAX_FILE) errors.push(`${rel}: ${size} bytes exceeds 100 MB`);
    const ext = extname(file);
    if (['.html', '.js', '.css'].includes(ext)) {
      for (const p of findProblems(await readFile(file, 'utf8'), ext)) errors.push(`${rel}: ${p}`);
    }
  }
  if (total > MAX_TOTAL) errors.push(`${dist}: total ${total} bytes exceeds 1 GB`);
  try {
    const html = await readFile(join(dist, 'index.html'), 'utf8');
    if (!html.includes(CSP)) errors.push(`${join(dist, 'index.html')}: CSP meta tag missing or changed`);
  } catch {
    errors.push(`${join(dist, 'index.html')}: missing`);
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(`dist OK: ${files.length} files, ${(total / 1048576).toFixed(0)} MB`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
