import { PiperEngine } from './engine';

declare global {
  interface Window {
    __tts?: { synthesize(text: string, voiceId: string): Promise<Blob> };
  }
}

/**
 * Test hook for e2e: exposes only `synthesize`, in dev builds or when the
 * page URL carries `?test` (also in production builds).
 */
export function installTtsTestHook(): void {
  if (!import.meta.env.DEV && !new URLSearchParams(location.search).has('test')) return;
  const engine = new PiperEngine('./');
  window.__tts = { synthesize: (text, voiceId) => engine.synthesize(text, voiceId) };
}
