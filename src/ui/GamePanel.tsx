import { useContext, useEffect, useState } from 'preact/hooks';
import { defaultSoundBlob } from '../audio/defaultSounds';
import type { QueueItem } from '../audio/queue';
import type { Player } from '../domain/model';
import { SPORTS } from '../domain/sports';
import { guestScoreText, scoreText, speechText } from '../domain/template';
import { getPack, t } from '../i18n';
import { currentRoster } from '../state/reducer';
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

  const playScore = (rawText: string) => {
    queue.unlock(); // synchronously inside the click, before anything async
    setError(false);
    const text = speechText(rawText, roster);
    const items: QueueItem[] = [];
    if (state.soundsEnabled) items.push(scoreBlob ?? defaultSoundBlob('score'));
    items.push(async () => {
      try {
        return await speech.get(state.voiceId, text);
      } catch (e) {
        setError(true);
        throw e;
      }
    });
    void queue.play(items);
  };

  const chip = (p: Player, selected: boolean, set: (id: string | null) => void) => (
    <button type="button" class="chip" key={p.id} aria-pressed={selected}
      onClick={() => set(selected ? null : p.id)}>{p.number ? `${p.number} ${p.name}` : p.name}</button>
  );

  return (
    <div class="game-panel">
      <div class="callout-actions">
        <button type="button" class="primary score-button" onClick={() => playScore(scoreText(scorer, roster))}>{`${SPORTS[state.sport].icon} ${word}!`}</button>
        {playing && <button type="button" class="stop" onClick={() => queue.stop()}>{t(lang, 'stopPlaying')}</button>}
      </div>
      {error && <p role="alert" class="error">{t(lang, 'ttsError')}</p>}
      <p class="hint" id="scorer-label">{t(lang, 'scorerLabel')}</p>
      <div class="chips" role="group" aria-labelledby="scorer-label">
        {fieldPlayers.map(p => chip(p, p.id === scorerId, setScorerId))}
        <button type="button" class="chip" aria-pressed={scorer === null} onClick={() => setScorerId(null)}>{t(lang, 'ourTeam')}</button>
      </div>
      {roster.guestPlayers.length > 0 && (
        <div class="guest-score">
          <button type="button" class="guest-score-button" onClick={() => playScore(guestScoreText(guestScorer, roster))}>
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
