import { useEffect, useRef, useState } from 'preact/hooks';
import { playersOf } from '../domain/model';
import type { Player, Side } from '../domain/model';
import { calloutText, guestIntroText, introText, speechText } from '../domain/template';
import { currentRoster } from '../state/reducer';
import { t } from '../i18n';
import type { UiStrings } from '../i18n';
import { TemplateEditor } from './TemplateEditor';
import { announce as announceAction, lineupTexts, playText as playTextAction, stopPlaying } from './actions';
import type { ActionEnv, LineupPart } from './actions';
import { fill } from './fill';
import type { PanelProps } from './types';
import { PlaybackError } from './PlaybackError';
import { usePlayback } from './usePlayback';
import { usePrepare } from './usePrepare';
import { useVoicePresent } from '../tts/voicePresence';
import { voicePath } from '../tts/voices';

export default function CalloutPanel({ state, dispatch }: PanelProps) {
  const lang = state.lang;
  const tr = (k: keyof UiStrings) => t(lang, k);
  const roster = currentRoster(state);
  const playback = usePlayback(state);
  const [regenerating, setRegenerating] = useState<ReadonlySet<string>>(new Set());
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const [, setTick] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const prepareTexts = lineupTexts(state);
  const prepare = usePrepare(playback?.speech, state.voiceId, prepareTexts, e => playback?.setError(e ?? true));
  const voicePresent = useVoicePresent(state.voiceId);

  if (!playback) return null;
  const { playing, error, setError, speech } = playback;

  const ordered = (list: Player[]) => [...list.filter(p => p.onField), ...list.filter(p => !p.onField)];
  const hasGuests = roster.guestPlayers.length > 0;
  const intro = introText(roster);
  const guestIntro = guestIntroText(roster);
  const reportError = (e?: unknown) => setError(e ?? true);
  const refresh = () => setTick(n => n + 1);

  const env: ActionEnv = { ...playback.env, onDone: refresh };
  const playText = (text: string) => playTextAction(env, text);
  const announce = (part: LineupPart) => announceAction(env, part);
  /** Makes the clip again (e.g. after a stray syllable); the old clip is replaced only if that works. */
  const regenerate = (text: string) => {
    const spoken = speechText(text, roster).trim();
    if (!spoken || regenerating.has(spoken)) return;
    const mark = (on: boolean) => setRegenerating(prev => {
      const next = new Set(prev);
      if (on) next.add(spoken); else next.delete(spoken);
      return next;
    });
    setError(null);
    mark(true);
    speech.regenerate(state.voiceId, spoken)
      .then(() => undefined, (e: unknown) => { if (mounted.current) reportError(e); })
      .finally(() => { if (mounted.current) { mark(false); refresh(); } });
  };
  const regenerateButton = (text: string, name: string) => text.trim() ? (
    <button type="button" aria-label={`${tr('regenerateClip')} ${name}`} title={tr('regenerateClip')}
      disabled={regenerating.has(speechText(text, roster).trim())} onClick={() => regenerate(text)}>↻</button>
  ) : null;

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
          {regenerateButton(text, p.name)}
          {p.customText !== null && (
            <button type="button" aria-label={`${tr('resetText')}: ${p.name}`} title={tr('resetText')}
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
          {regenerateButton(introLine, label)}
          {badge(introLine)}
        </span>
      </li>
      {ordered(playersOf(roster, side)).map(p => row(p, side))}
    </ul>
  );
  const teamTitle = (title: string, name: string) => (name.trim() ? `${title}: ${name.trim()}` : title);

  const hasPlayers = roster.players.length + roster.guestPlayers.length > 0;
  return (
    <div class="callout-panel">
      <div class="callout-actions">
        <button type="button" class="primary big" onClick={() => announce('all')}>{tr('announceLineup')}</button>
        {playing && <button type="button" class="stop" onClick={() => stopPlaying(env)}>{tr('stopPlaying')}</button>}
      </div>
      {hasGuests && (
        <div class="callout-actions secondary">
          <button type="button" onClick={() => announce('guests')}>{tr('announceGuestsOnly')}</button>
          <button type="button" onClick={() => announce('home')}>{tr('announceHomeOnly')}</button>
        </div>
      )}
      {voicePresent === false
        ? <p class="hint">{fill(tr('voiceMissingHint'), { lang: voicePath(state.voiceId).split('/')[0] })}</p>
        : <button type="button" disabled={prepare.preparing} onClick={() => { setError(null); prepare.start(); }}>{tr('prepareVoices')}</button>}
      {prepare.preparing && prepare.progress && <p role="status" class="progress">{fill(tr('prepareProgress'), prepare.progress)}</p>}
      {prepare.done && <p role="status" class="progress">{tr('prepareDone')}</p>}
      <PlaybackError lang={lang} error={error} />
      {!hasPlayers && <p class="hint">{tr('noPlayersYet')}</p>}

      {hasGuests && (
        <>
          <h3 class="team-list-title">{teamTitle(tr('tabGuests'), roster.opponent)}</h3>
          {teamList('guest', guestIntro, tr('guestIntroLabel'))}
          <h3 class="team-list-title">{teamTitle(tr('ourTeam'), roster.homeTeam)}</h3>
        </>
      )}
      {teamList('home', intro, tr('introLabel'))}

      <TemplateEditor lang={lang} templates={roster.templates} dispatch={dispatch} />
    </div>
  );
}
