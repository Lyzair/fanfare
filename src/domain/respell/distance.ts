/*
 * Weighted phoneme edit distance between two eSpeak IPA sequences, used to
 * rank respellings by how close their round trip sounds to the real name.
 * Costs: identical 0; length mark only 0.15; "near" pair (e/ɛ, ɕ/ʃ, ç/x, ...) 0.4;
 * other substitution 1; insertion/deletion 1; stress mismatch +0.1 (0.15 alone).
 */

export interface Seg { s: string; st: boolean }

/** Merges length marks and combining marks (eSpeak writes ç as c + U+0327) into the previous phoneme, attaches stress marks to the next one. */
export function segments(phonemes: readonly string[]): Seg[] {
  const out: Seg[] = [];
  let st = false;
  for (const p of phonemes) {
    if (p === 'ˈ' || p === 'ˌ') { st = true; continue; }
    if ((p === 'ː' || /^\p{M}+$/u.test(p)) && out.length > 0) { out[out.length - 1].s = (out[out.length - 1].s + p).normalize('NFC'); continue; }
    out.push({ s: p, st });
    st = false;
  }
  return out;
}

const NEAR_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['ɛ', 'e'], ['ɪ', 'i'], ['ɔ', 'o'], ['ʊ', 'u'], ['ə', 'ɐ'], ['ə', 'ʌ'], ['ɐ', 'a'], ['ʌ', 'a'], ['ɑ', 'a'], ['æ', 'ɛ'],
  ['æ', 'a'], ['ɕ', 'ʃ'], ['ç', 'ʃ'], ['ç', 'x'], ['ɲ', 'n'], ['ŋ', 'n'], ['ɹ', 'r'], ['ɾ', 'r'], ['ʁ', 'r'], ['ʁ', 'ɹ'],
  ['ʒ', 'ʃ'], ['z', 's'], ['dʒ', 'ʒ'], ['œ', 'ø'], ['y', 'ʏ'], ['ɡ', 'g'], ['w', 'v'], ['ɜ', 'ɐ'], ['ɚ', 'ɐ'], ['ɜ', 'ə'],
  ['ɒ', 'ɔ'], ['tʃ', 'ʃ'], ['t', 'd'], ['p', 'b'], ['k', 'g'],
];
const NEAR = new Set(NEAR_PAIRS.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));

function substitution(a: Seg, b: Seg): number {
  const stress = a.st !== b.st;
  if (a.s === b.s) return stress ? 0.15 : 0;
  const x = a.s.replace('ː', ''), y = b.s.replace('ː', '');
  const base = x === y ? 0.15 : NEAR.has(`${x}|${y}`) ? 0.4 : 1;
  return base + (stress ? 0.1 : 0);
}

/** Total weighted edit distance between two IPA phoneme arrays. */
export function weightedDistance(a: readonly string[], b: readonly string[]): number {
  const x = segments(a), y = segments(b);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + substitution(x[i - 1], y[j - 1]));
    }
    prev = cur;
  }
  return prev[y.length];
}

/** Distance per phoneme of the longer sequence: 0 = same sound, about 1 = unrelated. */
export function normalizedDistance(a: readonly string[], b: readonly string[]): number {
  const n = Math.max(segments(a).length, segments(b).length);
  return n === 0 ? 0 : weightedDistance(a, b) / n;
}

/** 3 = very close (<= 0.15), 2 = close (<= 0.35), 1 = rough. */
export function closeness(normalized: number): 1 | 2 | 3 {
  return normalized <= 0.15 ? 3 : normalized <= 0.35 ? 2 : 1;
}
