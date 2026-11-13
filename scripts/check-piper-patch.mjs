// Verifies that patches/@mintplex-labs+piper-tts-web+*.patch is applied to the
// installed library. An unpatched library would fetch voices from huggingface.co
// and WASM from CDNs at runtime, breaking the same-origin-only rule.
import { readFile } from 'node:fs/promises';

export const PIPER_DIST = 'node_modules/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js';

/** Returns a list of problems; empty when the source is correctly patched. */
export function checkPiperSource(source) {
  const problems = [];
  if (!source.includes('const HF_BASE = "./voices";')) problems.push('HF_BASE is not "./voices"');
  if (!source.includes('const ONNX_BASE = "./ort/";')) problems.push('ONNX_BASE is not "./ort/"');
  if (!source.includes('const WASM_BASE = "./piper/piper_phonemize";')) problems.push('WASM_BASE is not "./piper/piper_phonemize"');
  if (!source.includes('function textPhonemeIds(')) problems.push('text-phoneme support is missing');
  const urls = source.match(/https?:\/\/[^\s"'`)]+/g);
  if (urls) problems.push(`contains absolute URLs: ${[...new Set(urls)].join(', ')}`);
  return problems;
}

/** Throws with a clear message when the installed library is not patched. */
export async function assertPiperPatched(path) {
  const problems = checkPiperSource(await readFile(path, 'utf8'));
  if (problems.length) {
    throw new Error(
      `${path} is not patched (${problems.join('; ')}). Run "npx patch-package --error-on-fail" or "npm ci".`,
    );
  }
}
