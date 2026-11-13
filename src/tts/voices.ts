import type { Lang } from '../domain/model';
import voiceData from './voices.json';

export interface VoiceDef { id: string; lang: Lang; label: string; license: string }

/**
 * One Piper voice per language. The list lives in voices.json so that
 * scripts/fetch-assets.mjs downloads exactly these voices. Licences and
 * sources are documented in public/voices/LICENSES.md.
 */
export const VOICES: VoiceDef[] = voiceData as VoiceDef[];

export function defaultVoiceFor(lang: Lang): string {
  return (VOICES.find(v => v.lang === lang) ?? VOICES[0]).id;
}
