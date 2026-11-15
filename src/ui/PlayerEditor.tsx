import { useEffect, useRef, useState } from 'preact/hooks';
import type { Player, Side } from '../domain/model';
import { parseSinglePlayer } from '../domain/roster';
import { SPORTS } from '../domain/sports';
import { getPack, t } from '../i18n';
import type { UiStrings } from '../i18n';
import { currentRoster } from '../state/reducer';
import { fill } from './fill';
import { PlaybackError } from './PlaybackError';
import { useSayAs } from './useSayAs';
import SuggestPanel from './SuggestPanel';
import type { PanelProps } from './types';

const UNDO_MS = 5000;

interface Removed { player: Player; index: number }

/** The player editor (paste, single add, lists with ⇄ ↑ ↓ 🗑 and "Say it like…") for one team. */
export default function PlayerEditor({ state, dispatch, side }: PanelProps & { side: Side }) {
  const lang = state.lang;
  const tr = (k: keyof UiStrings) => t(lang, k);
  const roster = currentRoster(state);
  const players = side === 'guest' ? roster.guestPlayers : roster.players;
  const positions = getPack(lang).sports[state.sport].positions;
  const max = SPORTS[state.sport].fieldPlayers;
  const sayAs = useSayAs(state);
  const [listText, setListText] = useState('');
  const [oneText, setOneText] = useState('');
  const [removed, setRemoved] = useState<Removed | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const fieldPlayers = players.filter(p => p.onField);
  const benchPlayers = players.filter(p => !p.onField);
  const datalistId = `positions-${state.sport}`;

  const addList = (onField: boolean) => {
    if (!listText.trim()) return;
    dispatch({ type: 'addPlayers', text: listText, onField, side });
    setListText('');
  };
  const addOne = () => {
    const one = parseSinglePlayer(oneText);
    if (!one) return;
    dispatch({ type: 'addPlayers', text: `${one.number} ${one.name}`.trim(), onField: true, side });
    setOneText('');
  };
  const remove = (p: Player) => {
    const index = players.findIndex(x => x.id === p.id);
    dispatch({ type: 'removePlayer', id: p.id, side });
    setRemoved({ player: p, index });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRemoved(null), UNDO_MS);
  };
  const undo = () => {
    if (!removed) return;
    dispatch({ type: 'restorePlayer', player: removed.player, index: removed.index, side });
    if (timer.current) clearTimeout(timer.current);
    setRemoved(null);
  };
  /** Move within the visible list: step past players of the other list as well. */
  const move = (p: Player, delta: -1 | 1) => {
    const i = players.findIndex(x => x.id === p.id);
    let j = i + delta;
    while (j >= 0 && j < players.length && players[j].onField !== p.onField) j += delta;
    if (j < 0 || j >= players.length) return;
    for (let n = 0; n < Math.abs(j - i); n++) dispatch({ type: 'movePlayer', id: p.id, delta, side });
  };
  const update = (id: string, patch: Partial<Omit<Player, 'id'>>) => dispatch({ type: 'updatePlayer', id, patch, side });

  const renderList = (title: string, list: Player[], headingId: string) => (
    <section class="player-list" aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      {list.length === 0 && <p class="hint">{tr('emptyList')}</p>}
      <ul>
        {list.map((p, i) => (
          <li class="player-row" key={p.id}>
            <input class="num" inputMode="numeric" maxLength={3} aria-label={tr('shirtNumber')}
              defaultValue={p.number} onInput={e => update(p.id, { number: e.currentTarget.value.trim() })} />
            <input class="name" aria-label={tr('playerName')} defaultValue={p.name} maxLength={60}
              onInput={e => update(p.id, { name: e.currentTarget.value })} />
            {roster.showPositions && (
              <input class="pos" list={datalistId} aria-label={tr('position')} defaultValue={p.position}
                onInput={e => update(p.id, { position: e.currentTarget.value.trim() })} />
            )}
            <span class="row-actions">
              {sayAs.hintToggle(p.id, p.sayAs.trim() !== '')}
              <button type="button" aria-label={tr(p.onField ? 'toBench' : 'toField')} title={tr(p.onField ? 'toBench' : 'toField')}
                onClick={() => update(p.id, { onField: !p.onField })}>⇄</button>
              <button type="button" aria-label={tr('moveUp')} title={tr('moveUp')} disabled={i === 0} onClick={() => move(p, -1)}>↑</button>
              <button type="button" aria-label={tr('moveDown')} title={tr('moveDown')} disabled={i === list.length - 1} onClick={() => move(p, 1)}>↓</button>
              <button type="button" aria-label={tr('remove')} title={tr('remove')} onClick={() => remove(p)}>🗑</button>
            </span>
            {sayAs.isOpen(p.id) && (
              <div class="say-as">
                <input aria-label={tr('sayAsLabel')} placeholder={tr('sayAsPlaceholder')} value={p.sayAs} maxLength={80}
                  onInput={e => update(p.id, { sayAs: e.currentTarget.value })} />
                {sayAs.hearButton(p.name, p.sayAs)}
                <p class="hint">{tr('sayAsHint')}</p>
                <SuggestPanel lang={lang} voiceId={state.voiceId} name={p.name} origSpelling={p.origSpelling} nameLang={p.nameLang}
                  onFields={patch => update(p.id, patch)} onUse={text => update(p.id, { sayAs: text })} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div class="player-editor">
      <PlaybackError lang={lang} error={sayAs.hearError} />
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
      {renderList(tr('fieldList'), fieldPlayers, `field-list-title-${side}`)}
      {renderList(tr('benchList'), benchPlayers, `bench-list-title-${side}`)}

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
