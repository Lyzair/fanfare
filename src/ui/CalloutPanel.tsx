import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import type { AppState, Player, TemplateKey } from '../domain/model';
import { calloutText, introText } from '../domain/template';
import { defaultSoundBlob } from '../audio/defaultSounds';
import type { QueueItem } from '../audio/queue';
import { loadSoundBlob } from '../state/persist';
import { currentRoster } from '../state/reducer';
import { t } from '../i18n';
import type { UiStrings } from '../i18n';
import type { SpeechCache } from '../tts/speechCache';
import { ServicesContext } from './types';
import type { PanelProps } from './types';

const PLACEHOLDERS = ['name', 'number', 'position', 'home', 'opponent'] as const;
const TEMPLATE_KEYS: { key: TemplateKey; label: keyof UiStrings }[] = [
  { key: 'intro', label: 'templateIntro' },
  { key: 'field', label: 'templateField' },
  { key: 'bench', label: 'templateBench' },
];
const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** Intro sound (if enabled) → intro text → field players → bench players. Speech items are lazy. */
export function lineupSequence(
  state: AppState,
  speech: SpeechCache,
  introSound: Blob | null,
  onError?: (e: unknown) => void,
): Array<Blob | (() => Promise<Blob>)> {
  const roster = currentRoster(state);
  const lazy = (text: string) => async () => {
    try {
      return await speech.get(state.voiceId, text);
    } catch (e) {
      onError?.(e);
      throw e;
    }
  };
  const items: Array<Blob | (() => Promise<Blob>)> = [];
  if (state.soundsEnabled) items.push(introSound ?? defaultSoundBlob('intro'));
  const texts = [
    introText(roster),
    ...roster.players.filter(p => p.onField).map(p => calloutText(p, roster)),
    ...roster.players.filter(p => !p.onField).map(p => calloutText(p, roster)),
  ];
  for (const text of texts) if (text.trim()) items.push(lazy(text));
  return items;
}

export default function CalloutPanel({ state, dispatch }: PanelProps) {
  const services = useContext(ServicesContext);
  const lang = state.lang;
  const tr = (k: keyof UiStrings) => t(lang, k);
  const roster = currentRoster(state);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const [, setTick] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [introBlob, setIntroBlob] = useState<Blob | null>(null);
  const tplRefs = useRef<Partial<Record<TemplateKey, HTMLTextAreaElement | null>>>({});
  const lastTpl = useRef<TemplateKey>('field');

  useEffect(() => {
    const q = services?.queue;
    if (!q) return;
    const prev = q.onChange;
    q.onChange = p => { setPlaying(p); prev?.(p); };
    setPlaying(q.playing);
    return () => { q.onChange = prev; };
  }, [services]);

  const customIntro = state.customSounds.intro;
  useEffect(() => {
    let cancelled = false;
    setIntroBlob(null);
    if (customIntro) {
      loadSoundBlob('intro').then(b => { if (!cancelled) setIntroBlob(b); }, () => { /* fall back to default */ });
    }
    return () => { cancelled = true; };
  }, [customIntro]);

  if (!services) return null;
  const { queue, speech } = services;

  const players = [...roster.players.filter(p => p.onField), ...roster.players.filter(p => !p.onField)];
  const intro = introText(roster);
  const reportError = () => setError(true);
  const refresh = () => setTick(n => n + 1);

  const playItems = (items: QueueItem[]) => {
    queue.unlock(); // synchronously inside the click, before anything async
    setError(false);
    void queue.play(items).finally(refresh);
  };
  const playText = (text: string) => playItems([async () => {
    try {
      return await speech.get(state.voiceId, text);
    } catch (e) {
      reportError();
      throw e;
    }
  }]);
  const announce = () => playItems(lineupSequence(state, speech, introBlob, reportError));
  const prepareTexts = [intro, ...players.map(p => calloutText(p, roster))].filter(x => x.trim());
  const prepareKey = `${state.voiceId}\n${prepareTexts.map(x => x.trim()).join('\n')}`;
  const prepare = () => {
    if (preparing) return;
    const key = prepareKey;
    const safe = (fn: () => void) => { if (mounted.current) fn(); };
    setError(false);
    setDoneKey(null);
    setPreparing(true);
    setProgress({ done: 0, total: new Set(prepareTexts.map(x => x.trim())).size });
    speech.prepare(state.voiceId, prepareTexts, (done, total) => safe(() => { setProgress({ done, total }); refresh(); }))
      .then(() => safe(() => setDoneKey(key)), () => safe(reportError))
      .finally(() => safe(() => { setPreparing(false); setProgress(null); refresh(); }));
  };

  const insertChip = (name: string) => {
    const key = lastTpl.current;
    const el = tplRefs.current[key];
    const value = roster.templates[key];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    const ins = `{${name}}`;
    dispatch({ type: 'setTemplate', key, text: value.slice(0, start) + ins + value.slice(end) });
    const caret = start + ins.length;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret); });
  };

  const badge = (text: string) =>
    text.trim() && speech.has(state.voiceId, text) ? <span class="ready-badge"><span aria-hidden="true">✓</span> {tr('readyBadge')}</span> : null;

  const row = (p: Player) => {
    const text = drafts[p.id] ?? calloutText(p, roster);
    const label = fill(tr('announcementFor'), { name: p.name });
    return (
      <li class="callout-row" key={p.id}>
        <span class="callout-num">{p.number}</span>
        <textarea rows={2} aria-label={label} value={text}
          onInput={e => {
            const v = e.currentTarget.value;
            setDrafts(d => ({ ...d, [p.id]: v }));
            dispatch({ type: 'updatePlayer', id: p.id, patch: { customText: v } });
          }}
          onBlur={() => setDrafts(d => { const { [p.id]: _drop, ...rest } = d; return rest; })} />
        <span class="row-actions">
          <button type="button" aria-label={`${tr('playClip')} ${p.name}`} title={tr('playClip')} onClick={() => playText(text)}>▶</button>
          {p.customText !== null && (
            <button type="button" aria-label={tr('resetText')} title={tr('resetText')}
              onClick={() => dispatch({ type: 'updatePlayer', id: p.id, patch: { customText: null } })}>↺</button>
          )}
          {badge(text)}
        </span>
      </li>
    );
  };

  const hasPlayers = players.length > 0;
  return (
    <div class="callout-panel">
      <div class="callout-actions">
        <button type="button" class="primary big" onClick={announce}>{tr('announceLineup')}</button>
        {playing && <button type="button" class="stop" onClick={() => queue.stop()}>{tr('stopPlaying')}</button>}
      </div>
      <button type="button" disabled={preparing} onClick={prepare}>{tr('prepareVoices')}</button>
      {preparing && progress && <p role="status" class="progress">{fill(tr('prepareProgress'), progress)}</p>}
      {!preparing && doneKey === prepareKey && <p role="status" class="progress">{tr('prepareDone')}</p>}
      {error && <p role="alert" class="error">{tr('ttsError')}</p>}
      {!hasPlayers && <p class="hint">{tr('noPlayersYet')}</p>}

      <ul class="callout-list">
        <li class="callout-row" key="intro">
          <span class="callout-num">{tr('introLabel')}</span>
          <p class="intro-text">{intro}</p>
          <span class="row-actions">
            <button type="button" aria-label={`${tr('playClip')} ${tr('introLabel')}`} title={tr('playClip')} onClick={() => playText(intro)}>▶</button>
            {badge(intro)}
          </span>
        </li>
        {players.map(row)}
      </ul>

      <details class="help templates">
        <summary>{tr('templatesTitle')}</summary>
        <p class="hint">{tr('templatesHelp')}</p>
        <div class="chips">
          {PLACEHOLDERS.map(n => (
            <button type="button" class="chip" key={n} aria-label={fill(tr('insertPlaceholder'), { placeholder: `{${n}}` })}
              onMouseDown={e => e.preventDefault()} onClick={() => insertChip(n)}>{`{${n}}`}</button>
          ))}
        </div>
        {TEMPLATE_KEYS.map(({ key, label }) => (
          <label class="stack" key={key}>{tr(label)}
            <textarea rows={3} value={roster.templates[key]}
              ref={el => { tplRefs.current[key] = el; }}
              onFocus={() => { lastTpl.current = key; }}
              onInput={e => dispatch({ type: 'setTemplate', key, text: e.currentTarget.value })} />
          </label>
        ))}
        <button type="button" onClick={() => dispatch({ type: 'resetTemplates' })}>{tr('resetTemplates')}</button>
      </details>
    </div>
  );
}
