import { readdirSync, readFileSync } from 'node:fs';
import { checkPiperChunks, checkPiperSource, PIPER_DIST, PIPER_GLUE } from '../../scripts/check-piper-patch.mjs';

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

describe('the other files of the library (privacy guard for the next upgrade)', () => {
  const dir = PIPER_DIST.slice(0, PIPER_DIST.lastIndexOf('/'));
  const installed = () => Object.fromEntries(readdirSync(dir).filter(f => f.endsWith('.js')).map(f => [f, readFileSync(`${dir}/${f}`, 'utf8')]));

  test('the installed chunks are clean and the phonemizer glue chunk that src/tts/phonemize.ts imports by name exists', () => {
    expect(checkPiperChunks(installed())).toEqual([]);
    expect(readFileSync('src/tts/phonemize.ts', 'utf8')).toContain(`/dist/${PIPER_GLUE}'`);
  });

  test('a missing glue chunk is reported (an upgrade renames it)', () => {
    const { [PIPER_GLUE]: _gone, ...rest } = installed();
    expect(checkPiperChunks({ ...rest, 'piper-NEWHASH.js': 'x' }).join('\n')).toMatch(new RegExp(`${PIPER_GLUE} is missing`));
  });

  test('an absolute URL in any chunk is reported with the file name', () => {
    const problems = checkPiperChunks({ ...installed(), 'voices_static-X.js': 'fetch("https://cdn.example/voices.json")' });
    expect(problems.join('\n')).toMatch(/voices_static-X\.js.*https:\/\/cdn\.example\/voices\.json/);
  });
});
