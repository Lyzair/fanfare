import { useContext, useState } from 'preact/hooks';
import { t } from '../i18n';
import type { AppState } from '../domain/model';
import { playVoiceText } from './actions';
import { ServicesContext } from './types';

/** The 🗣 "Say it like…" toggle and ▶ hear button, shared by the match card and the player lists. */
export function useSayAs(state: AppState) {
  const services = useContext(ServicesContext);
  const tr = (k: 'pronunciation' | 'hearHint') => t(state.lang, k);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [hearError, setHearError] = useState<unknown>(null);

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  /** Speaks just the hint (or the name when there is none) with the current voice. */
  const hear = (name: string, sayAs: string) => {
    if (!services) return;
    playVoiceText({ ...services, onStart: () => setHearError(null), onError: e => setHearError(e ?? true) }, state.voiceId, sayAs.trim() || name);
  };
  const isOpen = (key: string) => open.has(key);
  const hintToggle = (key: string, active: boolean) => (
    <button type="button" class={active ? 'hint-toggle has-hint' : 'hint-toggle'} aria-label={tr('pronunciation')} title={tr('pronunciation')}
      aria-pressed={open.has(key)} onClick={() => toggle(key)}>🗣</button>
  );
  const hearButton = (name: string, sayAs: string) => services && (
    <button type="button" aria-label={tr('hearHint')} title={tr('hearHint')} onClick={() => hear(name, sayAs)}>▶</button>
  );
  return { isOpen, hintToggle, hearButton, hearError };
}
