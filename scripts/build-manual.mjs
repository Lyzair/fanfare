#!/usr/bin/env node
// postbuild: renders docs/manual/<lang>.md to dist/manual/<lang>.html (same-origin, no
// scripts, same CSP as index.html) and copies docs/manual/media/ next to it.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

const SRC = 'docs/manual';
const OUT = process.argv[2] ?? 'dist/manual';
const LANGS = [
  ['de', 'Deutsch'], ['en', 'English'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'],
  ['nl', 'Nederlands'], ['pl', 'Polski'], ['tr', 'Türkçe'], ['uk', 'Українська'], ['ar', 'العربية'],
];
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'";

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
:root { color-scheme: light dark; --bg: #fff; --fg: #1a1a1a; --muted: #555; --accent: #1b6e3c; --border: #d4d4d4; }
@media (prefers-color-scheme: dark) { :root { --bg: #151515; --fg: #ececec; --muted: #a8a8a8; --accent: #5fd08a; --border: #3a3a3a; } }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); line-height: 1.6;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
.page { max-width: 720px; margin-inline: auto; padding: 16px; }
nav { display: flex; flex-wrap: wrap; gap: 4px 14px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
nav a { color: var(--accent); text-decoration: none; }
nav a[aria-current] { font-weight: 700; text-decoration: underline; }
h1 { font-size: 1.8rem; line-height: 1.2; }
h2 { margin-top: 2rem; font-size: 1.3rem; border-top: 1px solid var(--border); padding-top: 1rem; }
img { max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 8px; }
a { color: var(--accent); }
code, kbd { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .92em; }
details { margin: 1rem 0; }
`;

function page(lang, dir, md) {
  const body = marked.parse(md, { async: false });
  const title = (md.match(/^# (.+)$/m)?.[1] ?? 'Fanfare').replace(/<[^>]+>/g, '');
  const nav = LANGS.map(([c, n]) => `<a href="./${c}.html" lang="${c}"${c === lang ? ' aria-current="page"' : ''}>${esc(n)}</a>`).join('\n');
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${CSP}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="page">
<nav aria-label="Languages"><a href="../">Fanfare</a>
${nav}</nav>
<main>
${body}
</main>
</div>
</body>
</html>
`;
}

await mkdir(OUT, { recursive: true });
for (const [lang] of LANGS) {
  const file = join(SRC, `${lang}.md`);
  if (!existsSync(file)) throw new Error(`${file} is missing`);
  const md = await readFile(file, 'utf8');
  await writeFile(join(OUT, `${lang}.html`), page(lang, lang === 'ar' ? 'rtl' : 'ltr', md));
}
if (existsSync(join(SRC, 'media'))) await cp(join(SRC, 'media'), join(OUT, 'media'), { recursive: true });
else console.warn('docs/manual/media is missing: run `npm run docs:media` and commit the result');
console.log(`manual: ${LANGS.length} pages -> ${OUT}`);
