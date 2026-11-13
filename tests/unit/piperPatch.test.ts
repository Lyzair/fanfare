import { readFileSync } from 'node:fs';
import { checkPiperSource, PIPER_DIST } from '../../scripts/check-piper-patch.mjs';

const unpatched = [
  'const HF_BASE = "https://huggingface.co/diffusionstudio/piper-voices/resolve/main";',
  'const ONNX_BASE = "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/";',
  'const WASM_BASE = "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize";',
].join('\n');

test('the installed piper library is patched', () => {
  expect(checkPiperSource(readFileSync(PIPER_DIST, 'utf8'))).toEqual([]);
});

test('an unpatched library is reported, including its CDN URLs', () => {
  const problems = checkPiperSource(unpatched);
  expect(problems.join('\n')).toMatch(/HF_BASE/);
  expect(problems.join('\n')).toMatch(/huggingface\.co/);
  expect(problems.join('\n')).toMatch(/cdnjs/);
});
