import { useEffect, useState } from 'preact/hooks';

export interface RegisterEnv { prod: boolean; secure: boolean; supported: boolean; search: string }

/** Production + secure context only; `?nosw` / `?test` keep e2e runs free of a stale worker. */
export function shouldRegister(env: RegisterEnv): boolean {
  if (!env.prod || !env.secure || !env.supported) return false;
  const q = new URLSearchParams(env.search);
  return !q.has('nosw') && !q.has('test');
}

export interface PwaState { controlled: boolean; updateReady: boolean }

let state: PwaState = { controlled: false, updateReady: false };
const listeners = new Set<(s: PwaState) => void>();
function set(patch: Partial<PwaState>): void {
  state = { ...state, ...patch };
  listeners.forEach(l => l(state));
}

export function usePwaState(): PwaState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}

let reloading = false;

/** Asks the waiting worker to take over; the page reloads once it has. */
export function applyUpdate(): void {
  void navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg?.waiting) return;
    reloading = true;
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
}

export function registerServiceWorker(): void {
  const env: RegisterEnv = {
    prod: import.meta.env.PROD,
    secure: window.isSecureContext,
    supported: 'serviceWorker' in navigator,
    search: location.search,
  };
  if (!shouldRegister(env)) return;
  const sw = navigator.serviceWorker;
  set({ controlled: sw.controller !== null });
  sw.addEventListener('controllerchange', () => {
    if (reloading) location.reload();
    else set({ controlled: sw.controller !== null });
  });
  sw.register('./sw.js', { scope: './' }).then(reg => {
    const check = () => { if (reg.waiting && sw.controller) set({ updateReady: true }); };
    check();
    reg.addEventListener('updatefound', () => {
      reg.installing?.addEventListener('statechange', check);
    });
  }, () => { /* no offline support; the app itself keeps working */ });
}
