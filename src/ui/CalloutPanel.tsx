import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import type { AppState, Player, Roster, Side, TemplateKey } from '../domain/model';
import { calloutText, guestIntroText, introText, speechText } from '../domain/template';
import { defaultSoundBlob } from '../audio/defaultSounds';
import type { QueueItem } from '../audio/queue';
import { currentRoster } from '../state/reducer';
import { t } from '../i18n';
import type { UiStrings } from '../i18n';
import type { SpeechCache } from '../tts/speechCache';
import { useCustomSoundBlob } from './soundMemory';
import { ServicesContext } from './types';
import type { PanelProps } from './types';

const PLACEHOLDERS = ['name', 'number', 'position', 'home', 'opponent'] as const;
const TEMPLATE_KEYS: { key: TemplateKey; label: keyof UiStrings }[] = [
  { key: 'guestIntro', label: 'guestIntroLabel' },
  { key: 'intro', label: 'templateIntro' },
  { key: 'field', label: 'templateField' },
  { key: 'bench', label: 'templateBench' },
];
const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export type LineupPart = 'both' | 'guests' | 'home';

/** The texts of one team in announcing order: intro, field players, bench players. */
function teamTexts(side: Side, roster: Roster): string[] {
  const players = side === 'guest' ? roster.guestPlayers : roster.players;
  return [
    side === 'guest' ? guestIntroText(roster) : introText(roster),
    ...players.filter(p => p.onField).map(p => calloutText(p, roster)),
    ...players.filter(p => !p.onField).map(p => calloutText(p, roster)),
  ];
}

/** Which teams a part covers: guests (when there are any) always come before our team. */
function sidesFor(roster: Roster, part: LineupPart): Side[] {
  const sides: Side[] = [];
  if (roster.guestPlayers.length > 0 && part !== 'home') sides.push('guest');
  if (part !== 'guests' || roster.guestPlayers.length === 0) sides.push('home');
  return sides;
}

/** Intro sound (if enabled) → [guest intro → guest field → guest bench →] intro → field → bench. Speech items are lazy. */
export function lineupSequence(
  state: AppState,
  speech: SpeechCache,
  introSound: Blob | null,
  onError?: (e: unknown) => void,
  part: LineupPart = 'both',
): Array<Blob | (() => Promise<Blob>)> {
  const roster = currentRoster(state);
  const lazy = (text: string) => async () => {
    try {
      return await speech.get(state.voiceId, speechText(text, roster));
    } catch (e) {
      onError?.(e);
      throw e;
    }
  };
  const items: Array<Blob | (() => Promise<Blob>)> = [];
  if (state.soundsEnabled) items.push(introSound ?? defaultSoundBlob('intro'));
  for (const text of sidesFor(roster, part).flatMap(side => teamTexts(side, roster))) if (text.trim()) items.push(lazy(text));
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

  const introBlob = useCustomSoundBlob('intro', state.customSounds.intro);

  if (!services) return null;
  const { queue, speech } = services;

  const ordered = (list: Player[]) => [...list.filter(p => p.onField), ...list.filter(p => !p.onField)];
  const hasGuests = roster.guestPlayers.length > 0;
  const intro = introText(roster);
  const guestIntro = guestIntroText(roster);
  const reportError = () => setError(true);
  const refresh = () => setTick(n => n + 1);

  const playItems = (items: QueueItem[]) => {
    queue.unlock(); // synchronously inside the click, before anything async
    setError(false);
    void queue.play(items).finally(refresh);
  };
  const playText = (text: string) => playItems([async () => {
    try {
      return await speech.get(state.voiceId, speechText(text, roster));
    } catch (e) {
      reportError();
      throw e;
    }
  }]);
  const announce = (part: LineupPart) => playItems(lineupSequence(state, speech, introBlob, reportError, part));
  const prepareTexts = sidesFor(roster, 'both').flatMap(side => teamTexts(side, roster)).map(x => speechText(x, roster)).filter(x => x.trim());
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
    text.trim() && speech.has(state.voiceId, speechText(text, roster)) ? <span class="ready-badge"><span aria-hidden="true">✓</span> {tr('readyBadge')}</span> : null;

  const row = (p: Player, side: Side) => {
    const text = drafts[p.id] ?? calloutText(p, roster);
    const label = fill(tr('announcementFor'), { name: p.name });
    return (
      <li class="callout-row" key={p.id}>
        <span class="callout-num">{p.number}</span>
        <textarea rows={2} aria-label={label} value={text}
          onInput={e => {
            const v = e.currentTarget.value;
            setDrafts(d => ({ ...d, [p.id]: v }));
            dispatch({ type: 'updatePlayer', id: p.id, patch: { customText: v }, side });
          }}
          onBlur={() => setDrafts(d => { const { [p.id]: _drop, ...rest } = d; return rest; })} />
        <span class="row-actions">
          <button type="button" aria-label={`${tr('playClip')} ${p.name}`} title={tr('playClip')} onClick={() => playText(text)}>▶</button>
          {p.customText !== null && (
            <button type="button" aria-label={tr('resetText')} title={tr('resetText')}
              onClick={() => dispatch({ type: 'updatePlayer', id: p.id, patch: { customText: null }, side })}>↺</button>
          )}
          {badge(text)}
        </span>
      </li>
    );
  };

  /** One team's list: its intro row, then field players, then bench players. */
  const teamList = (side: Side, introLine: string, label: string) => (
    <ul class="callout-list">
      <li class="callout-row" key="intro">
        <span class="callout-num">{label}</span>
        <p class="intro-text">{introLine}</p>
        <span class="row-actions">
          <button type="button" aria-label={`${tr('playClip')} ${label}`} title={tr('playClip')} onClick={() => playText(introLine)}>▶</button>
          {badge(introLine)}
        </span>
      </li>
      {ordered(side === 'guest' ? roster.guestPlayers : roster.players).map(p => row(p, side))}
    </ul>
  );
  const teamTitle = (title: string, name: string) => (name.trim() ? `${title}: ${name.trim()}` : title);

  const hasPlayers = roster.players.length + roster.guestPlayers.length > 0;
  return (
    <div class="callout-panel">
      <div class="callout-actions">
        <button type="button" class="primary big" onClick={() => announce('both')}>{tr('announceLineup')}</button>
        {playing && <button type="button" class="stop" onClick={() => queue.stop()}>{tr('stopPlaying')}</button>}
      </div>
      {hasGuests && (
        <div class="callout-actions secondary">
          <button type="button" onClick={() => announce('guests')}>{tr('announceGuestsOnly')}</button>
          <button type="button" onClick={() => announce('home')}>{tr('announceHomeOnly')}</button>
        </div>
      )}
      <button type="button" disabled={preparing} onClick={prepare}>{tr('prepareVoices')}</button>
      {preparing && progress && <p role="status" class="progress">{fill(tr('prepareProgress'), progress)}</p>}
      {!preparing && doneKey === prepareKey && <p role="status" class="progress">{tr('prepareDone')}</p>}
      {error && <p role="alert" class="error">{tr('ttsError')}</p>}
      {!hasPlayers && <p class="hint">{tr('noPlayersYet')}</p>}

      {hasGuests && (
        <>
          <h3 class="team-list-title">{teamTitle(tr('tabGuests'), roster.opponent)}</h3>
          {teamList('guest', guestIntro, tr('guestIntroLabel'))}
          <h3 class="team-list-title">{teamTitle(tr('ourTeam'), roster.homeTeam)}</h3>
        </>
      )}
      {teamList('home', intro, tr('introLabel'))}

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
