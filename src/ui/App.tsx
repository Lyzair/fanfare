import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { AudioQueue } from '../audio/queue';
import { detectLang, getPack, t } from '../i18n';
import type { UiStrings } from '../i18n';
import { initialState, reducer } from '../state/reducer';
import { loadState, saveState } from '../state/persist';
import { applyUpdate, usePwaState } from '../pwa/register';
import { PiperEngine } from '../tts/engine';
import { SpeechCache } from '../tts/speechCache';
import { ACCENT_CSS } from './accent';
import { Header } from './Header';
import { WelcomeCard } from './WelcomeCard';
import { ShowMe } from './ShowMe';
import DataPanel from './DataPanel';
import CalloutPanel from './CalloutPanel';
import GamePanel from './GamePanel';
import RemotePanel from './RemotePanel';
import RosterPanel from './RosterPanel';
import SoundsPanel from './SoundsPanel';
import { ServicesContext } from './types';
import type { PanelProps, Services } from './types';

export { ServicesContext };
export type { PanelProps, Services };

const STEPS = [1, 2, 3, 4, 5] as const;
const SAVE_DELAY_MS = 300;
const WELCOME_KEY = 'fanfare.welcomeDismissed';

function welcomeDismissedBefore(): boolean {
  try { return localStorage.getItem(WELCOME_KEY) === '1'; } catch { return false; }
}

function firstRunLang() {
  const prefs = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  return detectLang(prefs.filter(Boolean));
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(firstRunLang()));
  const [loaded, setLoaded] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const pwa = usePwaState();
  const [updateWait, setUpdateWait] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !welcomeDismissedBefore());
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

  const dismissWelcome = () => {
    setShowWelcome(false);
    try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* session-only dismissal */ }
    document.getElementById('step1-title')?.focus();
  };

  const pack = getPack(state.lang);
  useEffect(() => {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = pack.dir;
  }, [state.lang, pack.dir]);

  return (
    <ServicesContext.Provider value={value}>
      <style>{ACCENT_CSS}</style>
      <div class="app" data-sport={state.sport}>
        <Header state={state} dispatch={dispatch} onHelp={() => setShowWelcome(true)} />
        {storageFailed && <p class="notice" role="status">{t(state.lang, 'saveUnavailable')}</p>}
        {pwa.updateReady && (
          <p class="notice update-notice" role="status">
            {t(state.lang, updateWait ? 'updateWait' : 'updateAvailable')}{' '}
            <button type="button" onClick={() => {
              if (value.queue.playing) { setUpdateWait(true); return; } // never reload mid-announcement
              applyUpdate();
            }}>{t(state.lang, 'updateReload')}</button>
          </p>
        )}
        <main>
          {showWelcome && <WelcomeCard lang={state.lang} onDismiss={dismissWelcome} />}
          {STEPS.map(n => (
            <section class="card" key={n} aria-labelledby={`step${n}-title`}>
              <h2 id={`step${n}-title`} tabIndex={-1}>{n} {t(state.lang, `step${n}Title` as keyof UiStrings)}</h2>
              <p class="hint">{t(state.lang, `step${n}Hint` as keyof UiStrings)}</p>
              <ShowMe lang={state.lang} step={n} />
              <div class="panel-body">{n === 1 && <RosterPanel state={state} dispatch={dispatch} />}{n === 2 && <CalloutPanel state={state} dispatch={dispatch} />}{n === 3 && <><GamePanel state={state} dispatch={dispatch} /><RemotePanel state={state} dispatch={dispatch} /></>}{n === 4 && <SoundsPanel state={state} dispatch={dispatch} />}{n === 5 && <DataPanel state={state} dispatch={dispatch} />}</div>
            </section>
          ))}
        </main>
      </div>
    </ServicesContext.Provider>
  );
}

export default App;
