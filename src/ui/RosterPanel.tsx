import { useRef, useState } from 'preact/hooks';
import type { Side } from '../domain/model';
import { getPack, t } from '../i18n';
import type { UiStrings } from '../i18n';
import { ImportError } from '../io/archive';
import { MAX_TEAM_FILE_BYTES, parseTeamFile } from '../io/teamFile';
import { currentRoster } from '../state/reducer';
import PlayerEditor, { fill } from './PlayerEditor';
import { useSayAs } from './useSayAs';
import type { PanelProps } from './types';

type Message = { kind: 'ok' | 'error'; text: string } | null;
const TABS: Side[] = ['home', 'guest'];

async function readText(file: Blob): Promise<string> {
  return typeof file.text === 'function' ? file.text() : new Response(file).text();
}

export default function RosterPanel({ state, dispatch }: PanelProps) {
  const lang = state.lang;
  const tr = (k: keyof UiStrings) => t(lang, k);
  const roster = currentRoster(state);
  const sayAs = useSayAs(state);
  const [tab, setTab] = useState<Side>('home');
  const [message, setMessage] = useState<Message>(null);
  const tabRefs = useRef<Partial<Record<Side, HTMLButtonElement | null>>>({});
  const rtl = getPack(lang).dir === 'rtl';

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
      team = parseTeamFile(JSON.parse(await readText(file)));
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
        {([
          { key: 'home', label: 'homeTeam', value: roster.homeTeam, sayAs: roster.homeSayAs },
          { key: 'opponent', label: 'opponent', value: roster.opponent, sayAs: roster.opponentSayAs },
        ] as const).map(f => (
          <div class="match-field" key={f.key}>
            <label for={`match-${f.key}`}>{tr(f.label)}</label>
            <span class="with-toggle">
              <input id={`match-${f.key}`} value={f.value} onInput={e => dispatch({ type: 'setMatch', [f.key]: e.currentTarget.value })} />
              {sayAs.hintToggle(f.key, f.sayAs.trim() !== '')}
            </span>
            {sayAs.isOpen(f.key) && (
              <div class="say-as">
                <input aria-label={`${tr(f.label)}: ${tr('sayAsLabel')}`} placeholder={tr('sayAsPlaceholder')} value={f.sayAs} maxLength={80}
                  onInput={e => dispatch({ type: 'setMatch', [f.key === 'home' ? 'homeSayAs' : 'opponentSayAs']: e.currentTarget.value })} />
                {sayAs.hearButton(f.value, f.sayAs)}
                <p class="hint">{tr('sayAsHint')}</p>
              </div>
            )}
          </div>
        ))}
        <p class="hint">{tr('matchHint')}</p>
      </fieldset>
      {sayAs.hearError && <p role="alert" class="error">{tr('ttsError')}</p>}

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
