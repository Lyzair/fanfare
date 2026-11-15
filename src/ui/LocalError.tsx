import { useState } from 'preact/hooks';
import type { Lang } from '../domain/model';
import { t } from '../i18n';
import { LocalAccessError } from '../tts/httpEngine';
import { fill } from './fill';

/**
 * A problem with the local voice server. When the server refused this website (or could not be
 * reached) it shows this page's origin and the exact command that allows it, with a copy button.
 * Any other error is shown as `prefixKey` with the error's message.
 */
export function LocalError({ lang, error, prefix }: { lang: Lang; error: unknown; prefix: (detail: string) => string }) {
  const [copied, setCopied] = useState(false);
  if (error instanceof LocalAccessError) {
    const copy = () => {
      void navigator.clipboard?.writeText(error.command).then(() => setCopied(true), () => setCopied(false));
    };
    return (
      <div role="alert" class="error local-error">
        <p>{fill(t(lang, 'localAccessHelp'), { origin: error.origin })}</p>
        <p class="command-line">
          <code dir="ltr">{error.command}</code>
          <button type="button" onClick={copy}>{copied ? t(lang, 'commandCopied') : t(lang, 'copyCommand')}</button>
        </p>
      </div>
    );
  }
  return <p role="alert" class="error">{prefix(error instanceof Error ? error.message : String(error))}</p>;
}
