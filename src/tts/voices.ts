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

/** Path of a voice's model under voices/, in the piper-voices layout scripts/fetch-assets.mjs uses. */
export function voicePath(id: string): string {
  const [locale, name, quality] = id.split('-');
  return `${locale.split('_')[0]}/${locale}/${name}/${quality}/${id}.onnx`;
}
