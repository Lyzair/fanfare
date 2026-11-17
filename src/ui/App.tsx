import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { AudioQueue } from '../audio/queue';
import { browserLang, getPack, t } from '../i18n';
import { initialState, reducer } from '../state/reducer';
import type { Action } from '../state/reducer';
import { loadState, saveState } from '../state/persist';
import { applyUpdate, usePwaState } from '../pwa/register';
import { PiperEngine } from '../tts/engine';
import { HttpTtsEngine } from '../tts/httpEngine';
import { RoutingEngine } from '../tts/routingEngine';
import { SpeechCache } from '../tts/speechCache';
import { ACCENT_CSS } from './accent';
import { Header } from './Header';
import { WelcomeCard } from './WelcomeCard';
import { useLayout } from './layout';
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
  const [state, dispatchState] = useReducer(reducer, undefined, () => initialState(browserLang()));
  // The player rows keep what was typed in their own inputs. When the whole state is replaced (load,
  // import, delete all) the roster panel is built anew, so that it shows the new data.
  const [rosterVersion, setRosterVersion] = useState(0);
  const dispatch = useCallback((a: Action) => {
    if (a.type === 'replaceAll') setRosterVersion(n => n + 1);
    dispatchState(a);
  }, []);
  const [loaded, setLoaded] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [, setClipsLoaded] = useState(false);
  const pwa = usePwaState();
  const [updateWait, setUpdateWait] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !welcomeDismissedBefore());
  const [layout, setLayout] = useLayout();
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

  const showHelp = () => {
    setShowWelcome(true);
    // the card is at the top: without moving focus, nothing visible happens further down the page
    requestAnimationFrame(() => document.getElementById('welcome-title')?.focus());
  };
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
        <Header state={state} dispatch={dispatch} onHelp={showHelp} layout={layout} onLayout={setLayout} />
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
        <main data-layout={layout}>
          {showWelcome && <WelcomeCard lang={state.lang} onDismiss={dismissWelcome} />}
          {/* Preparation (steps 1-2) and match day (steps 3-5). The wrappers are always there, so changing
              the layout never rebuilds a panel; CSS places them (see "Wide screens" in styles.css). */}
          {[[0, 2, 'layout-col layout-col-prep'], [2, 5, 'layout-col layout-col-game']].map(([from, to, cls]) => (
            <div class={cls as string} key={cls as string}>
              {PANELS.slice(from as number, to as number).map((Panel, j) => {
                const n = ((from as number) + j + 1) as 1 | 2 | 3 | 4 | 5;
                return (
                  <section class="card" key={n} data-step={n} aria-labelledby={`step${n}-title`}>
                    <h2 id={`step${n}-title`} tabIndex={-1}>{n} {t(state.lang, `step${n}Title`)}</h2>
                    <p class="hint">{t(state.lang, `step${n}Hint`)}</p>
                    <ShowMe lang={state.lang} step={n} />
                    <div class="panel-body"><Panel key={n === 1 ? rosterVersion : undefined} state={state} dispatch={dispatch} /></div>
                  </section>
                );
              })}
            </div>
          ))}
        </main>
      </div>
    </ServicesContext.Provider>
  );
}

export default App;
