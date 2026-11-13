import type { SoundSlot } from '../domain/model';
import { encodeWav } from './wav';

const TWO_PI = Math.PI * 2;
const FADE_OUT_S = 0.02;

/** Write a tone into out starting at startSec; env(t, dur) gives the amplitude envelope. */
function addNote(
  out: Float32Array,
  rate: number,
  startSec: number,
  durSec: number,
  freq: number,
  harmonics: number[],
  env: (t: number, dur: number) => number,
): void {
  const start = Math.round(startSec * rate);
  const n = Math.min(Math.round(durSec * rate), out.length - start);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let s = 0;
    for (let h = 0; h < harmonics.length; h++) s += harmonics[h] * Math.sin(TWO_PI * freq * (h + 1) * t);
    const fade = Math.min(1, (n - 1 - i) / (FADE_OUT_S * rate)); // reaches 0 at the segment end
    out[start + i] += s * env(t, durSec) * fade;
  }
}

function normalize(out: Float32Array, peak: number): Float32Array {
  let m = 0;
  for (let i = 0; i < out.length; i++) m = Math.max(m, Math.abs(out[i]));
  if (m > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / m) * peak;
  return out;
}

/** Score sound: rising C5-E5-G5 arpeggio then a held C6, ~1.8 s. */
export function synthFanfare(sampleRate: number): Float32Array {
  const out = new Float32Array(Math.round(1.8 * sampleRate));
  const brass = [1, 0.5, 0.33];
  const env = (t: number, dur: number) => Math.min(1, t / 0.01) * Math.exp((-3 * t) / dur);
  const notes: Array<[number, number, number]> = [
    [0, 0.15, 523.25],
    [0.15, 0.15, 659.25],
    [0.3, 0.15, 783.99],
    [0.45, 1.35, 1046.5],
  ];
  for (const [start, dur, freq] of notes) addNote(out, sampleRate, start, dur, freq, brass, env);
  return normalize(out, 0.9);
}

/** Lineup jingle: G5 then E5 "ding-dong" chime, ~1.5 s. */
export function synthIntro(sampleRate: number): Float32Array {
  const out = new Float32Array(Math.round(1.5 * sampleRate));
  const env = (t: number, dur: number) => Math.min(1, t / 0.005) * Math.exp((-5 * t) / dur);
  addNote(out, sampleRate, 0, 0.75, 783.99, [1], env);
  addNote(out, sampleRate, 0.75, 0.75, 659.25, [1], env);
  return normalize(out, 0.9);
}

const SAMPLE_RATE = 22050;
const cache = new Map<SoundSlot, Blob>();

export function defaultSoundBlob(slot: SoundSlot): Blob {
  let b = cache.get(slot);
  if (!b) {
    b = encodeWav(slot === 'score' ? synthFanfare(SAMPLE_RATE) : synthIntro(SAMPLE_RATE), SAMPLE_RATE);
    cache.set(slot, b);
  }
  return b;
}
