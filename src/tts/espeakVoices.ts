// Light module (no wasm): the UI imports it statically, phonemize.ts is loaded lazily.

/** eSpeak NG voices with a dictionary in the shipped data; `tag` is the BCP 47 tag used for the native-name label. */
export interface EspeakVoice { code: string; tag: string }
export const ESPEAK_VOICES: readonly EspeakVoice[] = [
  { code: 'ar', tag: 'ar' }, { code: 'bg', tag: 'bg' }, { code: 'bn', tag: 'bn' }, { code: 'bs', tag: 'bs' },
  { code: 'ca', tag: 'ca' }, { code: 'cmn', tag: 'zh' }, { code: 'cs', tag: 'cs' }, { code: 'cy', tag: 'cy' },
  { code: 'da', tag: 'da' }, { code: 'de', tag: 'de' }, { code: 'el', tag: 'el' }, { code: 'en-us', tag: 'en-US' }, { code: 'es', tag: 'es-ES' }, { code: 'es-419', tag: 'es-419' }, { code: 'et', tag: 'et' },
  { code: 'fa', tag: 'fa' }, { code: 'fi', tag: 'fi' }, { code: 'fr', tag: 'fr' }, { code: 'ga', tag: 'ga' },
  { code: 'he', tag: 'he' }, { code: 'hi', tag: 'hi' }, { code: 'hr', tag: 'hr' }, { code: 'hu', tag: 'hu' },
  { code: 'hy', tag: 'hy' }, { code: 'id', tag: 'id' }, { code: 'is', tag: 'is' }, { code: 'it', tag: 'it' },
  { code: 'ja', tag: 'ja' }, { code: 'ka', tag: 'ka' }, { code: 'ko', tag: 'ko' }, { code: 'lt', tag: 'lt' },
  { code: 'lv', tag: 'lv' }, { code: 'mk', tag: 'mk' }, { code: 'nl', tag: 'nl' }, { code: 'nb', tag: 'nb' },
  { code: 'pl', tag: 'pl' }, { code: 'pt', tag: 'pt-PT' }, { code: 'pt-br', tag: 'pt-BR' }, { code: 'ro', tag: 'ro' },
  { code: 'ru', tag: 'ru' }, { code: 'sk', tag: 'sk' }, { code: 'sl', tag: 'sl' }, { code: 'sq', tag: 'sq' },
  { code: 'sr', tag: 'sr' }, { code: 'sv', tag: 'sv' }, { code: 'sw', tag: 'sw' }, { code: 'th', tag: 'th' },
  { code: 'tr', tag: 'tr' }, { code: 'uk', tag: 'uk' }, { code: 'vi', tag: 'vi' },
];

export const isEspeakVoice = (code: string): boolean => ESPEAK_VOICES.some((v) => v.code === code);

/** The eSpeak voice that reads a UI language's names by default. */
const DEFAULT_VOICE: Record<string, string> = { en: 'en-us' };
export const defaultEspeakVoice = (lang: string): string => DEFAULT_VOICE[lang] ?? lang;
