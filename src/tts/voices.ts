import type { Lang } from '../domain/model';

export interface VoiceDef { id: string; lang: Lang; label: string; license: string }

/** Provisional list; Task 9 verifies the ids and licences. */
export const VOICES: VoiceDef[] = [
  { id: 'de_DE-thorsten-medium', lang: 'de', label: 'Thorsten (Deutsch)', license: 'unverified' },
  { id: 'en_US-ljspeech-medium', lang: 'en', label: 'LJSpeech (English)', license: 'unverified' },
  { id: 'fr_FR-siwis-medium', lang: 'fr', label: 'Siwis (Français)', license: 'unverified' },
  { id: 'es_ES-davefx-medium', lang: 'es', label: 'DaveFX (Español)', license: 'unverified' },
  { id: 'it_IT-paola-medium', lang: 'it', label: 'Paola (Italiano)', license: 'unverified' },
  { id: 'nl_NL-mls-medium', lang: 'nl', label: 'MLS (Nederlands)', license: 'unverified' },
  { id: 'pl_PL-mc_speech-medium', lang: 'pl', label: 'MC Speech (Polski)', license: 'unverified' },
  { id: 'tr_TR-fettah-medium', lang: 'tr', label: 'Fettah (Türkçe)', license: 'unverified' },
  { id: 'uk_UA-ukrainian_tts-medium', lang: 'uk', label: 'Ukrainian TTS (Українська)', license: 'unverified' },
  { id: 'ar_JO-kareem-medium', lang: 'ar', label: 'Kareem (العربية)', license: 'unverified' },
];

export function defaultVoiceFor(lang: Lang): string {
  return (VOICES.find(v => v.lang === lang) ?? VOICES[0]).id;
}
