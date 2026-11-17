import { useEffect, useRef } from 'preact/hooks';
import type { Lang, SportId } from '../domain/model';
import { SPORTS, SPORT_IDS } from '../domain/sports';
import { LANGS, getPack, t } from '../i18n';
import type { PanelProps } from './types';
import { LayoutSwitch } from './LayoutSwitch';
import type { Layout } from './layout';

export function Header({ state, dispatch, onHelp, layout, onLayout }: PanelProps & { onHelp: () => void; layout: Layout; onLayout: (l: Layout) => void }) {
  const lang = state.lang;
  // The header wraps onto two lines in some languages and widths; the sticky game column (styles.css,
  // "Wide screens") sits just below it, so its real height is published as --header-h.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const set = () => document.documentElement.style.setProperty('--header-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    const ro = new ResizeObserver(set);
    ro.observe(el);
    set();
    return () => ro.disconnect();
  }, []);
  return (
    <header class="topbar" ref={ref}>
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
        <LayoutSwitch lang={lang} layout={layout} onChange={onLayout} />
        <button type="button" class="help-button" aria-label={t(lang, 'helpButton')} onClick={onHelp}>?</button>
        <a class="manual-link" href={`./manual/${lang}.html`}>📖 {t(lang, 'manualLink')}</a>
      </div>
    </header>
  );
}
