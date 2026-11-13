import type { SportId, TemplateKey } from '../domain/model';

export type RawTemplates = Record<TemplateKey, string>;

/**
 * Builds a pack's `templates()` function. `{score}` in the raw templates is
 * replaced by the sport's score word (or a celebratory override); it is not a
 * runtime placeholder.
 */
export function makeTemplates(
  raw: RawTemplates,
  scoreWord: (sport: SportId) => string,
  cheers: Partial<Record<SportId, string>> = {},
): (sport: SportId) => RawTemplates {
  return sport => {
    const word = cheers[sport] ?? scoreWord(sport);
    const out = {} as RawTemplates;
    for (const k of Object.keys(raw) as TemplateKey[]) out[k] = raw[k].split('{score}').join(word);
    return out;
  };
}
