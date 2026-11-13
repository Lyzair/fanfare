/*
 * IPA -> respelling candidates for a target language. A table maps each eSpeak
 * segment to up to 3 spellings; candidates are the cheapest combinations (the
 * sum of alternative positions), at most MAX_CANDIDATES before ranking.
 */
import type { Lang } from '../model';
import { segments, type Seg } from './distance';
import { de } from './de';
import { en } from './en';

/** segment (length mark attached, e.g. "aː") -> spellings, most likely first. */
export type RespellTable = Record<string, string[]>;

export const MAX_CANDIDATES = 12;

/** Target languages with a table, and the eSpeak voice that reads their respellings back. */
const TARGETS: Partial<Record<Lang, { table: RespellTable; espeakVoice: string }>> = {
  de: { table: de, espeakVoice: 'de' },
  en: { table: en, espeakVoice: 'en-us' },
};

export const hasRespell = (lang: Lang): boolean => lang in TARGETS;
export const respellVoice = (lang: Lang): string | undefined => TARGETS[lang]?.espeakVoice;

const DIPHTHONGS = new Set(['aɪ', 'aʊ', 'ɔɪ', 'eɪ', 'oʊ']);
const AFFRICATES = new Set(['tɕ', 'tʃ', 'dʒ', 'ts']);

/** eSpeak writes diphthongs and affricates as two phonemes: join them. */
function tokens(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i], b = segs[i + 1];
    if (b && !b.st && (DIPHTHONGS.has(a.s + b.s) || AFFRICATES.has(a.s + b.s))) {
      out.push({ s: a.s + b.s, st: a.st });
      i++;
    } else out.push(a);
  }
  return out;
}

/** Up to MAX_CANDIDATES lower-case spellings, best guess first; [] when the language has no table. */
export function respell(ipa: readonly string[], target: Lang): string[] {
  const entry = TARGETS[target];
  if (!entry) return [];
  let beam: Array<{ text: string; cost: number }> = [{ text: '', cost: 0 }];
  for (const tok of tokens(segments(ipa))) {
    const alts = (entry.table[tok.s] ?? entry.table[tok.s.replace('ː', '')] ?? [tok.s]).slice(0, 3);
    const next = new Map<string, number>();
    for (const b of beam) {
      alts.forEach((a, i) => {
        const text = b.text + a, cost = b.cost + i;
        if (cost < (next.get(text) ?? Infinity)) next.set(text, cost);
      });
    }
    beam = [...next].map(([text, cost]) => ({ text, cost })).sort((x, y) => x.cost - y.cost).slice(0, MAX_CANDIDATES);
  }
  return beam.map((b) => b.text).filter((t) => t !== '');
}
