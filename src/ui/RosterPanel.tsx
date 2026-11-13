import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import type { Player } from '../domain/model';
import { parseSinglePlayer } from '../domain/roster';
import { SPORTS } from '../domain/sports';
import { getPack, t } from '../i18n';
import type { UiStrings } from '../i18n';
import { speechText } from '../domain/template';
import { currentRoster } from '../state/reducer';
import { ServicesContext } from './types';
import type { PanelProps } from './types';

const UNDO_MS = 5000;
const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

interface Removed { player: Player; index: number }

export default function RosterPanel({ state, dispatch }: PanelProps) {
  const services = useContext(ServicesContext);
  const lang = state.lang;
  const tr = (k: keyof UiStrings) => t(lang, k);
  const roster = currentRoster(state);
  const positions = getPack(lang).sports[state.sport].positions;
  const max = SPORTS[state.sport].fieldPlayers;
  const [listText, setListText] = useState('');
  const [oneText, setOneText] = useState('');
  const [openHints, setOpenHints] = useState<Set<string>>(new Set());
  const [hearError, setHearError] = useState(false);
  const [removed, setRemoved] = useState<Removed | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const fieldPlayers = roster.players.filter(p => p.onField);
  const benchPlayers = roster.players.filter(p => !p.onField);
  const datalistId = `positions-${state.sport}`;

  const addList = (onField: boolean) => {
    if (!listText.trim()) return;
    dispatch({ type: 'addPlayers', text: listText, onField });
    setListText('');
  };
  const addOne = () => {
    const one = parseSinglePlayer(oneText);
    if (!one) return;
    dispatch({ type: 'addPlayers', text: `${one.number} ${one.name}`.trim(), onField: true });
    setOneText('');
  };
  const remove = (p: Player) => {
    const index = roster.players.findIndex(x => x.id === p.id);
    dispatch({ type: 'removePlayer', id: p.id });
    setRemoved({ player: p, index });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRemoved(null), UNDO_MS);
  };
  const undo = () => {
    if (!removed) return;
    dispatch({ type: 'restorePlayer', player: removed.player, index: removed.index });
    if (timer.current) clearTimeout(timer.current);
    setRemoved(null);
  };
  /** Move within the visible list: step past players of the other list as well. */
  const move = (p: Player, delta: -1 | 1) => {
    const all = roster.players;
    const i = all.findIndex(x => x.id === p.id);
    let j = i + delta;
    while (j >= 0 && j < all.length && all[j].onField !== p.onField) j += delta;
    if (j < 0 || j >= all.length) return;
    for (let n = 0; n < Math.abs(j - i); n++) dispatch({ type: 'movePlayer', id: p.id, delta });
  };

  const toggleHint = (key: string) => setOpenHints(prev => {
    const next = new Set(prev);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  /** Speaks just the hint (or the name when there is none) with the current voice. */
  const hear = (name: string, sayAs: string) => {
    if (!services) return;
    services.queue.unlock(); // synchronously inside the click, before anything async
    setHearError(false);
    const text = speechText(sayAs.trim() || name, roster);
    void services.queue.play([async () => {
      try {
        return await services.speech.get(state.voiceId, text);
      } catch (e) {
        setHearError(true);
        throw e;
      }
    }]);
  };
  const hintToggle = (key: string, active: boolean) => (
    <button type="button" class={active ? 'hint-toggle has-hint' : 'hint-toggle'} aria-label={tr('pronunciation')} title={tr('pronunciation')}
      aria-pressed={openHints.has(key)} onClick={() => toggleHint(key)}>🗣</button>
  );
  const hearButton = (name: string, sayAs: string) => services && (
    <button type="button" aria-label={tr('hearHint')} title={tr('hearHint')} onClick={() => hear(name, sayAs)}>▶</button>
  );

  const renderList = (title: string, list: Player[], headingId: string) => (
    <section class="player-list" aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      {list.length === 0 && <p class="hint">{tr('emptyList')}</p>}
      <ul>
        {list.map((p, i) => (
          <li class="player-row" key={p.id}>
            <input class="num" inputMode="numeric" maxLength={3} aria-label={tr('shirtNumber')}
              defaultValue={p.number} onInput={e => dispatch({ type: 'updatePlayer', id: p.id, patch: { number: e.currentTarget.value.trim() } })} />
            <input class="name" aria-label={tr('playerName')} defaultValue={p.name} maxLength={60}
              onInput={e => dispatch({ type: 'updatePlayer', id: p.id, patch: { name: e.currentTarget.value } })} />
            {roster.showPositions && (
              <input class="pos" list={datalistId} aria-label={tr('position')} defaultValue={p.position}
                onInput={e => dispatch({ type: 'updatePlayer', id: p.id, patch: { position: e.currentTarget.value.trim() } })} />
            )}
            <span class="row-actions">
              {hintToggle(p.id, p.sayAs.trim() !== '')}
              <button type="button" aria-label={tr(p.onField ? 'toBench' : 'toField')} title={tr(p.onField ? 'toBench' : 'toField')}
                onClick={() => dispatch({ type: 'updatePlayer', id: p.id, patch: { onField: !p.onField } })}>⇄</button>
              <button type="button" aria-label={tr('moveUp')} title={tr('moveUp')} disabled={i === 0} onClick={() => move(p, -1)}>↑</button>
              <button type="button" aria-label={tr('moveDown')} title={tr('moveDown')} disabled={i === list.length - 1} onClick={() => move(p, 1)}>↓</button>
              <button type="button" aria-label={tr('remove')} title={tr('remove')} onClick={() => remove(p)}>🗑</button>
            </span>
            {openHints.has(p.id) && (
              <div class="say-as">
                <input aria-label={tr('sayAsLabel')} placeholder={tr('sayAsPlaceholder')} defaultValue={p.sayAs} maxLength={80}
                  onInput={e => dispatch({ type: 'updatePlayer', id: p.id, patch: { sayAs: e.currentTarget.value } })} />
                {hearButton(p.name, p.sayAs)}
                <p class="hint">{tr('sayAsHint')}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );

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
              {hintToggle(f.key, f.sayAs.trim() !== '')}
            </span>
            {openHints.has(f.key) && (
              <div class="say-as">
                <input aria-label={`${tr(f.label)}: ${tr('sayAsLabel')}`} placeholder={tr('sayAsPlaceholder')} value={f.sayAs} maxLength={80}
                  onInput={e => dispatch({ type: 'setMatch', [f.key === 'home' ? 'homeSayAs' : 'opponentSayAs']: e.currentTarget.value })} />
                {hearButton(f.value, f.sayAs)}
                <p class="hint">{tr('sayAsHint')}</p>
              </div>
            )}
          </div>
        ))}
        <p class="hint">{tr('matchHint')}</p>
      </fieldset>
      {hearError && <p role="alert" class="error">{tr('ttsError')}</p>}

      <label class="stack">{tr('pasteLabel')}
        <textarea rows={5} value={listText} placeholder={tr('pastePlaceholder')}
          onInput={e => setListText(e.currentTarget.value)} />
      </label>
      <div class="button-row">
        <button type="button" onClick={() => addList(true)}>{tr('addToField')}</button>
        <button type="button" onClick={() => addList(false)}>{tr('addToBench')}</button>
      </div>
      <details class="help">
        <summary>{tr('fussballTitle')}</summary>
        <p>{tr('fussballHelp')}</p>
      </details>

      <label class="stack">{tr('singleLabel')}
        <input value={oneText} placeholder={tr('singlePlaceholder')}
          onInput={e => setOneText(e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOne(); } }} />
      </label>

      <label class="check">
        <input type="checkbox" checked={roster.showPositions}
          onChange={e => dispatch({ type: 'togglePositions', on: e.currentTarget.checked })} />
        {tr('usePositions')}
      </label>
      <datalist id={datalistId}>{positions.map(p => <option key={p} value={p} />)}</datalist>

      <p role={fieldPlayers.length > max ? 'status' : undefined} class={fieldPlayers.length > max ? 'counter warn' : 'counter'}>
        {fill(tr('fieldCount'), { count: fieldPlayers.length, max })}
      </p>
      {renderList(tr('fieldList'), fieldPlayers, 'field-list-title')}
      {renderList(tr('benchList'), benchPlayers, 'bench-list-title')}

      {removed && (
        <p role="status" class="undo-bar">
          {fill(tr('removedPlayer'), { name: removed.player.name })}
          {' · '}
          <button type="button" onClick={undo}>{tr('undo')}</button>
        </p>
      )}
    </div>
  );
}
