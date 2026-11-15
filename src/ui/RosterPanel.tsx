import { useRef, useState } from 'preact/hooks';
import type { Side } from '../domain/model';
import { getPack, t } from '../i18n';
import type { UiStrings } from '../i18n';
import { ImportError } from '../io/archive';
import { blobText } from '../io/blob';
import { MAX_TEAM_FILE_BYTES, parseTeamFile } from '../io/teamFile';
import { currentRoster } from '../state/reducer';
import type { MatchPatch } from '../state/reducer';
import { fill } from './fill';
import PlayerEditor from './PlayerEditor';
import { PlaybackError } from './PlaybackError';
import { useSayAs } from './useSayAs';
import SuggestPanel from './SuggestPanel';
import type { PanelProps } from './types';

type Message = { kind: 'ok' | 'error'; text: string } | null;
const TABS: Side[] = ['home', 'guest'];
/** The two team-name fields of the match card and the roster fields each one edits. */
const MATCH_FIELDS = [
  { key: 'home', label: 'homeTeam', name: 'homeTeam', sayAs: 'homeSayAs', orig: 'homeOrigSpelling', nameLang: 'homeNameLang' },
  { key: 'opponent', label: 'opponent', name: 'opponent', sayAs: 'opponentSayAs', orig: 'opponentOrigSpelling', nameLang: 'opponentNameLang' },
] as const;

export default function RosterPanel({ state, dispatch }: PanelProps) {
  const lang = state.lang;
  const tr = (k: keyof UiStrings) => t(lang, k);
  const roster = currentRoster(state);
  const sayAs = useSayAs(state);
  const [tab, setTab] = useState<Side>('home');
  const [message, setMessage] = useState<Message>(null);
  const tabRefs = useRef<Partial<Record<Side, HTMLButtonElement | null>>>({});
  const rtl = getPack(lang).dir === 'rtl';

  const setMatch = (patch: MatchPatch) => dispatch({ type: 'setMatch', patch });

  const tabLabel = (side: Side) =>
    `${side === 'home' ? tr('ourTeam') : tr('tabGuests')} (${side === 'home' ? roster.players.length : roster.guestPlayers.length})`;

  const selectTab = (side: Side, focus = false) => {
    setTab(side);
    setMessage(null);
    if (focus) tabRefs.current[side]?.focus();
  };
  const onTabKey = (e: KeyboardEvent, side: Side) => {
    const i = TABS.indexOf(side);
    const step = (d: number) => TABS[(i + d + TABS.length) % TABS.length];
    const next = e.key === 'ArrowRight' ? step(rtl ? -1 : 1)
      : e.key === 'ArrowLeft' ? step(rtl ? 1 : -1)
        : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    selectTab(next, true);
  };

  const importTeam = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    const fail = (key: keyof UiStrings, vars: Record<string, string> = {}) =>
      setMessage({ kind: 'error', text: fill(tr(key), vars) });
    if (file.size > MAX_TEAM_FILE_BYTES) return fail('teamFile.too-large');
    let team;
    try {
      team = parseTeamFile(JSON.parse(await blobText(file)));
    } catch (e) {
      return fail(e instanceof ImportError && e.code === 'bad-version' ? 'teamFile.bad-version' : 'teamFile.invalid-data');
    }
    if (team.sport !== state.sport) return fail('teamFile.wrong-sport', { sport: getPack(lang).sports[team.sport].name });
    if (roster.guestPlayers.length > 0 && !window.confirm(fill(tr('importTeamConfirm'), { count: roster.guestPlayers.length }))) return;
    dispatch({ type: 'importGuestTeam', team });
    setMessage({ kind: 'ok', text: fill(tr('teamImported'), { count: team.players.length }) });
  };

  const clearGuests = () => {
    if (roster.guestPlayers.length === 0 || !window.confirm(tr('clearGuestsConfirm'))) return;
    dispatch({ type: 'clearGuests' });
    setMessage(null);
  };

  return (
    <div class="roster-panel">
      <fieldset class="match-card">
        <legend>{tr('matchTitle')}</legend>
        {MATCH_FIELDS.map(f => (
          <div class="match-field" key={f.key}>
            <label for={`match-${f.key}`}>{tr(f.label)}</label>
            <span class="with-toggle">
              <input id={`match-${f.key}`} value={roster[f.name]} onInput={e => setMatch({ [f.name]: e.currentTarget.value })} />
              {sayAs.hintToggle(f.key, roster[f.sayAs].trim() !== '')}
            </span>
            {sayAs.isOpen(f.key) && (
              <div class="say-as">
                <input aria-label={`${tr(f.label)}: ${tr('sayAsLabel')}`} placeholder={tr('sayAsPlaceholder')} value={roster[f.sayAs]} maxLength={80}
                  onInput={e => setMatch({ [f.sayAs]: e.currentTarget.value })} />
                {sayAs.hearButton(roster[f.name], roster[f.sayAs])}
                <p class="hint">{tr('sayAsHint')}</p>
                <SuggestPanel lang={lang} voiceId={state.voiceId} name={roster[f.name]} origSpelling={roster[f.orig]} nameLang={roster[f.nameLang]}
                  onFields={patch => setMatch({ [f.orig]: patch.origSpelling, [f.nameLang]: patch.nameLang })}
                  onUse={text => setMatch({ [f.sayAs]: text })} />
              </div>
            )}
          </div>
        ))}
        <p class="hint">{tr('matchHint')}</p>
      </fieldset>
      <PlaybackError lang={lang} error={sayAs.hearError} />

      <div class="tabs" role="tablist" aria-label={tr('tabsLabel')}>
        {TABS.map(side => (
          <button type="button" role="tab" class="tab" id={`team-tab-${side}`} key={side}
            aria-selected={tab === side} aria-controls="team-tabpanel" tabIndex={tab === side ? 0 : -1}
            ref={el => { tabRefs.current[side] = el; }}
            onClick={() => selectTab(side)} onKeyDown={e => onTabKey(e, side)}>{tabLabel(side)}</button>
        ))}
      </div>
      <div role="tabpanel" id="team-tabpanel" aria-labelledby={`team-tab-${tab}`} class="tabpanel">
        {tab === 'guest' && (
          <div class="guest-tools">
            <p class="hint">{tr('guestsHint')}</p>
            <div class="button-row">
              <label class="file-button">
                <span>{tr('importTeam')}</span>
                <input type="file" accept=".json,application/json" aria-label={tr('importTeam')}
                  onChange={e => { const input = e.currentTarget; void importTeam(input.files?.[0]).finally(() => { input.value = ''; }); }} />
              </label>
              <button type="button" class="danger" disabled={roster.guestPlayers.length === 0} onClick={clearGuests}>{tr('clearGuests')}</button>
            </div>
            {message?.kind === 'error' && <p role="alert" class="error">{message.text}</p>}
            {message?.kind === 'ok' && <p role="status">{message.text}</p>}
          </div>
        )}
        <PlayerEditor state={state} dispatch={dispatch} side={tab} key={tab} />
      </div>
    </div>
  );
}
