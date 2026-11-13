#!/usr/bin/env node
// Build-time only: copies the TTS runtime files into public/ and downloads the
// Piper voices listed in src/tts/voices.json. Never invoked at runtime.
//
//   npm run fetch-assets                     all voices
//   SC_VOICE_LANGS=de npm run fetch-assets   only some languages (local iteration)
//
// Idempotent: existing non-empty files are skipped. Exits non-zero on any error.
import { copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assertPiperPatched, PIPER_DIST } from './check-piper-patch.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

// Same snapshot of piper-voices the library's PATH_MAP was built from.
const VOICE_REPO = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main';

async function size(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

function mb(n) {
  return `${(n / 1e6).toFixed(1)} MB`;
}

async function copyIfChanged(src, dest) {
  const s = await size(src);
  if (s <= 0) throw new Error(`missing source file ${src}`);
  if ((await size(dest)) === s) {
    console.log(`  skip ${dest.slice(root.length + 1)} (up to date)`);
    return;
  }
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`  copy ${dest.slice(root.length + 1)} (${mb(s)})`);
}

async function download(url, dest) {
  if ((await size(dest)) > 0) {
    console.log(`  skip ${dest.slice(root.length + 1)} (present)`);
    return;
  }
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const tmp = `${dest}.part`;
  let got = 0;
  let nextReport = 0.1;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      got += chunk.length;
      if (total > 1e6 && got / total >= nextReport) {
        process.stdout.write(`    ${Math.floor((got / total) * 100)}%\r`);
        nextReport += 0.1;
      }
      cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(tmp));
    if (got === 0) throw new Error(`download is empty: ${url}`);
    if (total > 0 && got !== total) throw new Error(`download incomplete (${got}/${total} bytes): ${url}`);
    await rename(tmp, dest);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
  if (total > 1e6) process.stdout.write('\n');
  console.log(`  got  ${dest.slice(root.length + 1)} (${mb(got)})`);
}

async function main() {
  console.log('fetch-assets: checking the piper-tts-web patch');
  await assertPiperPatched(join(root, PIPER_DIST));

  console.log('fetch-assets: ONNX Runtime WASM -> public/ort/');
  const ortDist = join(root, 'node_modules/onnxruntime-web/dist');
  for (const f of ['ort-wasm.wasm', 'ort-wasm-simd.wasm', 'ort-wasm-threaded.wasm', 'ort-wasm-simd-threaded.wasm']) {
    await copyIfChanged(join(ortDist, f), join(pub, 'ort', f));
  }

  console.log('fetch-assets: piper-phonemize WASM + espeak-ng data -> public/piper/');
  const piperBuild = join(root, 'node_modules/@diffusionstudio/piper-wasm/build');
  for (const f of ['piper_phonemize.wasm', 'piper_phonemize.data']) {
    await copyIfChanged(join(piperBuild, f), join(pub, 'piper', f));
  }

  const { PATH_MAP } = await import('@mintplex-labs/piper-tts-web');
  const voices = JSON.parse(await readFile(join(root, 'src/tts/voices.json'), 'utf8'));
  const only = process.env.SC_VOICE_LANGS?.split(',').map((s) => s.trim()).filter(Boolean);
  const selected = only ? voices.filter((v) => only.includes(v.lang)) : voices;
  console.log(`fetch-assets: ${selected.length} voice(s) -> public/voices/`);
  for (const v of selected) {
    const path = PATH_MAP[v.id];
    if (!path) throw new Error(`voice ${v.id} is not in the piper library's PATH_MAP`);
    console.log(`  ${v.id} (${v.lang})`);
    const dir = path.slice(0, path.lastIndexOf('/'));
    await download(`${VOICE_REPO}/${path}.json`, join(pub, 'voices', `${path}.json`));
    await download(`${VOICE_REPO}/${dir}/MODEL_CARD`, join(pub, 'voices', dir, 'MODEL_CARD'));
    await download(`${VOICE_REPO}/${path}`, join(pub, 'voices', path));
  }
  console.log('fetch-assets: done');
}

main().catch((e) => {
  console.error(`\nfetch-assets FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
