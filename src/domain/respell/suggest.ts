/*
 * "✨ Suggest": phonemize the name in its own language, respell the IPA for the
 * voice's language, then rank the respellings by round trip: phonemize each one
 * with the target language's eSpeak voice (exactly what the voice will be fed)
 * and measure the distance to the real name's IPA.
 */
import type { Lang } from '../model';
import { closeness, normalizedDistance } from './distance';
import { hasRespell, respell, respellVoice } from './index';

export interface Candidate {
  text: string;
  /** What eSpeak reads back from `text` in the voice's language. */
  ipa: string[];
  /** Normalized weighted distance to the real pronunciation (0 = same). */
  distance: number;
  level: 1 | 2 | 3;
}

export interface Suggestions {
  /** The real pronunciation of the original spelling. */
  source: string[];
  /** The plain display name, for comparison. */
  baseline: Candidate;
  /** Up to MAX_RESULTS distinct respellings, closest first, none that sounds like the plain name. */
  candidates: Candidate[];
}

export const MAX_RESULTS = 3;

export type PhonemizeFn = (text: string, voice: string) => Promise<string[]>;

export interface SuggestOptions {
  /** The display name (what the list shows, and the baseline). */
  name: string;
  /** The name in its own spelling/script; empty = use `name`. */
  origSpelling: string;
  /** eSpeak voice code of the name's language. */
  nameVoice: string;
  /** Language of the speaking voice; needs a respell table. */
  targetLang: Lang;
  phonemize: PhonemizeFn;
}

export class SuggestError extends Error {
  readonly code: 'unsupported' | 'empty';
  constructor(code: 'unsupported' | 'empty') {
    super(code);
    this.code = code;
    this.name = 'SuggestError';
  }
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export async function suggest(o: SuggestOptions): Promise<Suggestions> {
  const targetVoice = respellVoice(o.targetLang);
  if (!hasRespell(o.targetLang) || !targetVoice) throw new SuggestError('unsupported');
  const source = await o.phonemize(o.origSpelling.trim() || o.name, o.nameVoice);
  if (source.length === 0) throw new SuggestError('empty');

  const rate = (text: string, ipa: string[]): Candidate => {
    const distance = normalizedDistance(source, ipa);
    return { text, ipa, distance, level: closeness(distance) };
  };
  const baseline = rate(o.name, await o.phonemize(o.name, targetVoice));
  const key = (c: Candidate) => c.ipa.join(' ');

  const rated: Candidate[] = [];
  for (const raw of respell(source, o.targetLang)) {
    const text = capitalize(raw);
    rated.push(rate(text, await o.phonemize(text, targetVoice)));
  }
  const seen = new Set([key(baseline)]);
  const candidates = rated
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.distance - b.c.distance || a.i - b.i)
    .map(({ c }) => c)
    .filter((c) => (seen.has(key(c)) ? false : (seen.add(key(c)), true)))
    .slice(0, MAX_RESULTS);
  return { source, baseline, candidates };
}
