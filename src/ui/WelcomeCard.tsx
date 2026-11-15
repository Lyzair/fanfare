import type { Lang } from '../domain/model';
import { t } from '../i18n';

export function WelcomeCard({ lang, onDismiss }: { lang: Lang; onDismiss: () => void }) {
  return (
    <section class="card welcome" aria-labelledby="welcome-title">
      <h2 id="welcome-title" tabIndex={-1}>{t(lang, 'welcomeTitle')}</h2>
      <ol class="welcome-steps">
        <li>{t(lang, 'welcomeLine1')}</li>
        <li>{t(lang, 'welcomeLine2')}</li>
        <li>{t(lang, 'welcomeLine3')}</li>
      </ol>
      <div class="button-row">
        <a class="btn" href={`./manual/${lang}.html`} target="_blank" rel="noopener">{t(lang, 'welcomeShowHow')}</a>
        <button type="button" class="btn primary" onClick={onDismiss}>{t(lang, 'welcomeGotIt')}</button>
      </div>
    </section>
  );
}
