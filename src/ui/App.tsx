import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { AudioQueue } from '../audio/queue';
import { browserLang, getPack, t } from '../i18n';
import { initialState, reducer } from '../state/reducer';
import { loadState, saveState } from '../state/persist';
import { applyUpdate, usePwaState } from '../pwa/register';
import { PiperEngine } from '../tts/engine';
import { HttpTtsEngine } from '../tts/httpEngine';
import { RoutingEngine } from '../tts/routingEngine';
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

/** Step 3 is the game itself: the score buttons and, below them, the phone remote. */
const GameStep = (p: PanelProps) => <><GamePanel {...p} /><RemotePanel {...p} /></>;
/** The panels of steps 1 to 5, in order. */
const PANELS = [RosterPanel, CalloutPanel, GameStep, SoundsPanel, DataPanel];
const SAVE_DELAY_MS = 300;
const WELCOME_KEY = 'fanfare.welcomeDismissed';

function welcomeDismissedBefore(): boolean {
  try { return localStorage.getItem(WELCOME_KEY) === '1'; } catch { return false; }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(browserLang()));
  const [loaded, setLoaded] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [, setClipsLoaded] = useState(false);
  const pwa = usePwaState();
  const [updateWait, setUpdateWait] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !welcomeDismissedBefore());
  const services = useRef<Services | null>(null);
  // the engine reads the current local server through a ref, so the cache is never rebuilt
  const stateRef = useRef(state);
  stateRef.current = state;
  services.current ??= {
    queue: new AudioQueue(),
    speech: new SpeechCache(new RoutingEngine(new PiperEngine(), () => (stateRef.current.localTts ? new HttpTtsEngine(stateRef.current.localTts.url) : null))),
  };
  const value = useMemo(() => services.current!, []);

  useEffect(() => {
    let cancelled = false;
    // autosave starts only after a successful load: a failed one must not be followed by a save of the defaults
    loadState().then(
      saved => {
        if (cancelled) return;
        if (saved) dispatch({ type: 'replaceAll', state: saved });
        setLoaded(true);
      },
      () => { if (!cancelled) setStorageFailed(true); },
    );
    // clips prepared in an earlier visit: Export and the Ready badges read them from memory
    void value.speech.hydrate().then(() => { if (!cancelled) setClipsLoaded(true); });
    return () => { cancelled = true; };
  }, [value]);

  const savePending = useRef(false);
  const saveNow = () => {
    if (!savePending.current) return;
    savePending.current = false;
    saveState(stateRef.current).catch(() => setStorageFailed(true));
  };
  useEffect(() => {
    if (!loaded) return;
    savePending.current = true;
    const id = setTimeout(saveNow, SAVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [state, loaded]);
  // closing the tab or switching apps cancels the timer: write the pending save right away
  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === 'hidden') saveNow(); };
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', saveNow);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, []);

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
          {PANELS.map((Panel, i) => {
            const n = (i + 1) as 1 | 2 | 3 | 4 | 5;
            return (
              <section class="card" key={n} aria-labelledby={`step${n}-title`}>
                <h2 id={`step${n}-title`} tabIndex={-1}>{n} {t(state.lang, `step${n}Title`)}</h2>
                <p class="hint">{t(state.lang, `step${n}Hint`)}</p>
                <ShowMe lang={state.lang} step={n} />
                <div class="panel-body"><Panel state={state} dispatch={dispatch} /></div>
              </section>
            );
          })}
        </main>
      </div>
    </ServicesContext.Provider>
  );
}

export default App;
