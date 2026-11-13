import type { Lang, SportId, TemplateKey } from '../domain/model';
import { en } from './en';
import { de } from './de';
import { fr } from './fr';
import { es } from './es';
import { it } from './it';
import { nl } from './nl';
import { pl } from './pl';
import { tr } from './tr';
import { uk } from './uk';
import { ar } from './ar';

/** en.ts is the reference pack: its `ui` object defines the keys. */
export type UiStrings = typeof en.ui;

export interface PackBase {
  code: Lang;
  nativeName: string;
  dir: 'ltr' | 'rtl';
  /** positions in the same order as en */
  sports: Record<SportId, { name: string; scoreWord: string; positions: string[] }>;
  /** used by the paste parser to recognise staff sections */
  staffHeadings: string[];
  templates(sport: SportId): Record<TemplateKey, string>;
}

export interface LanguagePack extends PackBase {
  ui: UiStrings;
}

/** Order shown in the language dropdown. */
export const LANGS: Lang[] = ['de', 'en', 'fr', 'es', 'it', 'nl', 'pl', 'tr', 'uk', 'ar'];

const PACKS: Record<Lang, LanguagePack> = { de, en, fr, es, it, nl, pl, tr, uk, ar };

export function getPack(lang: Lang): LanguagePack {
  return PACKS[lang];
}

export function t(lang: Lang, key: keyof UiStrings): string {
  return PACKS[lang].ui[key];
}

/** First supported base language code of the preferred list (e.g. navigator.languages), else 'en'. */
export function detectLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0] as Lang;
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}

export function defaultTemplates(sport: SportId, lang: Lang): Record<TemplateKey, string> {
  return PACKS[lang].templates(sport);
}
