import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { AudioQueue } from '../audio/queue';
import { SPORTS, SPORT_IDS } from '../domain/sports';
import { detectLang, getPack, t } from '../i18n';
import type { UiStrings } from '../i18n';
import { initialState, reducer } from '../state/reducer';
import { loadState, saveState } from '../state/persist';
import { PiperEngine } from '../tts/engine';
import { SpeechCache } from '../tts/speechCache';
import { Header } from './Header';
import { ServicesContext } from './types';
import type { PanelProps, Services } from './types';

export { ServicesContext };
export type { PanelProps, Services };

const STEPS = [1, 2, 3, 4, 5] as const;
const SAVE_DELAY_MS = 300;

/** Per-sport accent colours, generated from SPORTS so they live in one place. */
const ACCENT_CSS = SPORT_IDS.map(id => `[data-sport="${id}"]{--accent:${SPORTS[id].accent}}`).join('\n');

function firstRunLang() {
  const prefs = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  return detectLang(prefs.filter(Boolean));
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(firstRunLang()));
  const [loaded, setLoaded] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const services = useRef<Services | null>(null);
  services.current ??= { queue: new AudioQueue(), speech: new SpeechCache(new PiperEngine('./')) };
  const value = useMemo(() => services.current!, []);

  useEffect(() => {
    let cancelled = false;
    loadState().then(
      saved => { if (!cancelled && saved) dispatch({ type: 'replaceAll', state: saved }); },
      () => { if (!cancelled) setStorageFailed(true); },
    ).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => {
      saveState(state).catch(() => setStorageFailed(true));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [state, loaded]);

  const pack = getPack(state.lang);
  useEffect(() => {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = pack.dir;
  }, [state.lang, pack.dir]);

  return (
    <ServicesContext.Provider value={value}>
      <style>{ACCENT_CSS}</style>
      <div class="app" data-sport={state.sport}>
        <Header state={state} dispatch={dispatch} />
        {storageFailed && <p class="notice" role="status">{t(state.lang, 'saveUnavailable')}</p>}
        <main>
          {STEPS.map(n => (
            <section class="card" key={n} aria-labelledby={`step${n}-title`}>
              <h2 id={`step${n}-title`}>{n} {t(state.lang, `step${n}Title` as keyof UiStrings)}</h2>
              <p class="hint">{t(state.lang, `step${n}Hint` as keyof UiStrings)}</p>
              <div class="panel-body" />
            </section>
          ))}
        </main>
      </div>
    </ServicesContext.Provider>
  );
}

export default App;
