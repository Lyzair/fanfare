import type { Lang } from '../domain/model';
import { t } from '../i18n';
import { LocalAccessError } from '../tts/httpEngine';
import { LocalError } from './LocalError';

/** Why a clip could not be made: the allow command for a local server that refused us, else the general voice error. */
export function PlaybackError({ lang, error }: { lang: Lang; error: unknown }) {
  if (error === null || error === undefined || error === false) return null;
  if (error instanceof LocalAccessError) return <LocalError lang={lang} error={error} prefix={() => ''} />;
  return <p role="alert" class="error">{t(lang, 'ttsError')}</p>;
}
