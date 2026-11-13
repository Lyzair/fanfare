import type { Lang, SportId } from '../domain/model';
import { SPORTS, SPORT_IDS } from '../domain/sports';
import { LANGS, getPack, t } from '../i18n';
import type { PanelProps } from './types';

export function Header({ state, dispatch }: PanelProps) {
  const lang = state.lang;
  return (
    <header class="topbar">
      <div class="brand">
        <span class="brand-icon" aria-hidden="true">{SPORTS[state.sport].icon}</span>
        <h1>{t(lang, 'appTitle')}</h1>
      </div>
      <div class="controls">
        <label class="field">
          <span class="field-label">{t(lang, 'sportLabel')}</span>
          <select value={state.sport} onChange={e => dispatch({ type: 'setSport', sport: e.currentTarget.value as SportId })}>
            {SPORT_IDS.map(id => (
              <option key={id} value={id}>{SPORTS[id].icon} {getPack(lang).sports[id].name}</option>
            ))}
          </select>
        </label>
        <label class="field">
          <span class="field-label">{t(lang, 'languageLabel')}</span>
          <span class="lang-wrap">
            <span aria-hidden="true">🌐</span>
            <select value={lang} onChange={e => dispatch({ type: 'setLang', lang: e.currentTarget.value as Lang })}>
              {LANGS.map(l => <option key={l} value={l} lang={l}>{getPack(l).nativeName}</option>)}
            </select>
          </span>
        </label>
        <a class="manual-link" href={`./manual/${lang}.html`}>📖 {t(lang, 'manualLink')}</a>
      </div>
    </header>
  );
}
