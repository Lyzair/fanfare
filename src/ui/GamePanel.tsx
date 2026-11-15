import { useContext, useEffect, useState } from 'preact/hooks';
import type { Player } from '../domain/model';
import { SPORTS } from '../domain/sports';
import { getPack, t } from '../i18n';
import { currentRoster } from '../state/reducer';
import { callScore, stopPlaying } from './actions';
import type { ActionEnv } from './actions';
import { fill } from './PlayerEditor';
import { useCustomSoundBlob } from './soundMemory';
import { ServicesContext } from './types';
import type { PanelProps } from './types';

export default function GamePanel({ state }: PanelProps) {
  const services = useContext(ServicesContext);
  const lang = state.lang;
  const roster = currentRoster(state);
  const [scorerId, setScorerId] = useState<string | null>(null);
  const [guestScorerId, setGuestScorerId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const scoreBlob = useCustomSoundBlob('score', state.customSounds.score);

  useEffect(() => {
    const q = services?.queue;
    if (!q) return;
    const prev = q.onChange;
    q.onChange = p => { setPlaying(p); prev?.(p); };
    setPlaying(q.playing);
    return () => { q.onChange = prev; };
  }, [services]);

  if (!services) return null;
  const { queue, speech } = services;

  const fieldPlayers = roster.players.filter(p => p.onField);
  const scorer = fieldPlayers.find(p => p.id === scorerId) ?? null;
  const guestField = roster.guestPlayers.filter(p => p.onField);
  const guestScorer = guestField.find(p => p.id === guestScorerId) ?? null;
  const word = getPack(lang).sports[state.sport].scoreWord;
  const guestName = roster.opponent.trim() || t(lang, 'tabGuests');

  const env: ActionEnv = {
    state, queue, speech, blobs: { score: scoreBlob },
    onStart: () => setError(false), onError: () => setError(true),
  };

  const chip = (p: Player, selected: boolean, set: (id: string | null) => void) => (
    <button type="button" class="chip" key={p.id} aria-pressed={selected}
      onClick={() => set(selected ? null : p.id)}>{p.number ? `${p.number} ${p.name}` : p.name}</button>
  );

  return (
    <div class="game-panel">
      <div class="callout-actions">
        <button type="button" class="primary score-button" onClick={() => callScore(env, 'home', scorer)}>{`${SPORTS[state.sport].icon} ${word}!`}</button>
        {playing && <button type="button" class="stop" onClick={() => stopPlaying(env)}>{t(lang, 'stopPlaying')}</button>}
      </div>
      {error && <p role="alert" class="error">{t(lang, 'ttsError')}</p>}
      <p class="hint" id="scorer-label">{t(lang, 'scorerLabel')}</p>
      <div class="chips" role="group" aria-labelledby="scorer-label">
        {fieldPlayers.map(p => chip(p, p.id === scorerId, setScorerId))}
        <button type="button" class="chip" aria-pressed={scorer === null} onClick={() => setScorerId(null)}>{t(lang, 'ourTeam')}</button>
      </div>
      {roster.guestPlayers.length > 0 && (
        <div class="guest-score">
          <button type="button" class="guest-score-button" onClick={() => callScore(env, 'guest', guestScorer)}>
            {`${SPORTS[state.sport].icon} ${fill(t(lang, 'guestScoreButton'), { word, opponent: guestName })}`}
          </button>
          <p class="hint" id="guest-scorer-label">{t(lang, 'guestScorerLabel')}</p>
          <div class="chips" role="group" aria-labelledby="guest-scorer-label">
            {guestField.map(p => chip(p, p.id === guestScorerId, setGuestScorerId))}
            <button type="button" class="chip" aria-pressed={guestScorer === null} onClick={() => setGuestScorerId(null)}>{guestName}</button>
          </div>
        </div>
      )}
    </div>
  );
}
