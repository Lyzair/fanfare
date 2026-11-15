// Verifies that patches/@mintplex-labs+piper-tts-web+*.patch is applied to the
// installed library. An unpatched library would fetch voices from huggingface.co
// and WASM from CDNs at runtime, breaking the same-origin-only rule.
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const PIPER_DIST = 'node_modules/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js';
/** The phonemizer glue chunk next to it; src/tts/phonemize.ts imports it by this (hashed) name. */
export const PIPER_GLUE = 'piper-o91UDS6e.js';

const absoluteUrls = (source) => [...new Set(source.match(/https?:\/\/[^\s"'`)]+/g) ?? [])];

/** Returns a list of problems; empty when the source is correctly patched. */
export function checkPiperSource(source) {
  const problems = [];
  if (!source.includes('const HF_BASE = "./voices";')) problems.push('HF_BASE is not "./voices"');
  if (!source.includes('const ONNX_BASE = "./ort/";')) problems.push('ONNX_BASE is not "./ort/"');
  if (!source.includes('const WASM_BASE = "./piper/piper_phonemize";')) problems.push('WASM_BASE is not "./piper/piper_phonemize"');
  if (!source.includes('function textPhonemeIds(')) problems.push('text-phoneme support is missing');
  const urls = absoluteUrls(source);
  if (urls.length) problems.push(`contains absolute URLs: ${urls.join(', ')}`);
  return problems;
}

/**
 * The library's other .js files, as { file name: source }: the glue chunk must exist under the name
 * the app imports, and no file may name another server. Returns a list of problems.
 */
export function checkPiperChunks(files) {
  const problems = [];
  if (!(PIPER_GLUE in files)) problems.push(`${PIPER_GLUE} is missing (update the import in src/tts/phonemize.ts and PIPER_GLUE)`);
  for (const [name, source] of Object.entries(files)) {
    const urls = absoluteUrls(source);
    if (urls.length) problems.push(`${name} contains absolute URLs: ${urls.join(', ')}`);
  }
  return problems;
}

/** Throws with a clear message when the installed library is not patched. */
export async function assertPiperPatched(path) {
  const problems = checkPiperSource(await readFile(path, 'utf8'));
  const dir = dirname(path);
  const chunks = {};
  for (const name of await readdir(dir)) {
    if (name.endsWith('.js') && join(dir, name) !== path) chunks[name] = await readFile(join(dir, name), 'utf8');
  }
  problems.push(...checkPiperChunks(chunks));
  if (problems.length) {
    throw new Error(
      `${path} is not patched (${problems.join('; ')}). Run "npx patch-package --error-on-fail" or "npm ci".`,
    );
  }
}
