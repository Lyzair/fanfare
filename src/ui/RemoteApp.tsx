import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { RemoteLink } from '../remote/links';
import type { LinkStatus, PairResult } from '../remote/links';
import type { RemoteCommand, RemotePlayer, RemoteStateEvent } from '../remote/protocol';
import { SPORTS } from '../domain/sports';
import type { SportId } from '../domain/model';
import { browserLang, getPack, t } from '../i18n';
import type { UiStrings } from '../i18n';
import { ACCENT_CSS } from './accent';
import { fill } from './fill';

const ERRORS: Record<Exclude<PairResult, { ok: true }>['error'], keyof UiStrings> = {
  'wrong-code': 'remoteWrongCode', locked: 'remoteLocked', expired: 'remoteCodeExpired', full: 'remoteFull', network: 'remoteConnectFail',
};

/** The soundboard on the phone (page opened with #remote). It only sends commands and never plays audio itself. */
export default function RemoteApp() {
  const lang = useMemo(browserLang, []);
  const tr = (k: keyof UiStrings) => t(lang, k);
  const dir = getPack(lang).dir;
  const [phase, setPhase] = useState<'code' | 'board' | 'ended'>(() => (RemoteLink.hasStoredSession() ? 'board' : 'code'));
  const [status, setStatus] = useState<LinkStatus>('connecting');
  const [event, setEvent] = useState<RemoteStateEvent | null>(null);
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<keyof UiStrings | null>(null);
  const [busy, setBusy] = useState(false);
  const [homeScorer, setHomeScorer] = useState<string | null>(null);
  const [guestScorer, setGuestScorer] = useState<string | null>(null);
  const link = useRef<RemoteLink | null>(null);

  link.current ??= new RemoteLink({
    onState: setEvent,
    onStatus: s => {
      if (s === 'ended') { setEvent(null); setPhase('ended'); setDigits(''); } else setStatus(s);
    },
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);
  useEffect(() => {
    if (phase === 'board') link.current?.resume();
    return () => link.current?.close();
  }, []);

  const pair = async (e: Event) => {
    e.preventDefault();
    if (digits.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const r = await link.current!.pair(digits);
    setBusy(false);
    if (r.ok) setPhase('board'); else setError(ERRORS[r.error]);
  };

  const send = (cmd: RemoteCommand) => { void link.current?.send(cmd); };
  const warn = typeof location !== 'undefined' && location.protocol !== 'https:';

  const snap = event?.state ?? null;
  const online = event?.online ?? false;
  let banner: keyof UiStrings | null = null;
  if (status === 'reconnecting' || (phase === 'board' && !event)) banner = 'remoteReconnecting';
  else if (event && !online) banner = 'remoteSpeakerOffline';
  else if (snap && !snap.activated) banner = 'remoteNotActivated';
  else if (snap?.playing) banner = 'remotePlaying';
  const ready = !!snap && online && snap.activated && status !== 'reconnecting';

  const chips = (list: RemotePlayer[], selected: string | null, set: (id: string | null) => void, teamLabel: string, labelId: string, label: string) => (
    <>
      <p class="hint" id={labelId}>{label}</p>
      <div class="chips" role="group" aria-labelledby={labelId}>
        {list.map(p => (
          <button type="button" class="chip" key={p.id} aria-pressed={selected === p.id} disabled={!ready}
            onClick={() => set(selected === p.id ? null : p.id)}>{p.name}</button>
        ))}
        <button type="button" class="chip" aria-pressed={selected === null} disabled={!ready} onClick={() => set(null)}>{teamLabel}</button>
      </div>
    </>
  );

  let board = null;
  if (phase === 'board' && snap) {
    const sport = (snap.sport in SPORTS ? snap.sport : 'football') as SportId;
    const icon = SPORTS[sport].icon;
    const guestName = snap.guest.name.trim() || tr('tabGuests');
    board = (
      <div class="remote-board" data-sport={sport}>
        <button type="button" class="goal" disabled={!ready}
          onClick={() => send({ cmd: 'score', args: homeScorer ? { team: 'home', player: homeScorer } : { team: 'home' } })}>{`${icon} ${snap.scoreWord}!`}</button>
        {chips(snap.home.players, homeScorer, setHomeScorer, tr('ourTeam'), 'remote-home-label', tr('scorerLabel'))}
        {snap.hasGuests && (
          <>
            <button type="button" class="goal guest-goal" disabled={!ready}
              onClick={() => send({ cmd: 'score', args: guestScorer ? { team: 'guest', player: guestScorer } : { team: 'guest' } })}>
              {`${icon} ${fill(tr('guestScoreButton'), { word: snap.scoreWord, opponent: guestName })}`}
            </button>
            {chips(snap.guest.players, guestScorer, setGuestScorer, guestName, 'remote-guest-label', tr('guestScorerLabel'))}
          </>
        )}
        <button type="button" class="lineup" disabled={!ready} onClick={() => send({ cmd: 'announce', args: { part: 'all' } })}>{tr('announceLineup')}</button>
        {snap.hasGuests && (
          <div class="remote-row">
            <button type="button" disabled={!ready} onClick={() => send({ cmd: 'announce', args: { part: 'guests' } })}>{tr('announceGuestsOnly')}</button>
            <button type="button" disabled={!ready} onClick={() => send({ cmd: 'announce', args: { part: 'home' } })}>{tr('announceHomeOnly')}</button>
          </div>
        )}
        <button type="button" disabled={!ready} onClick={() => send({ cmd: 'sound', args: { slot: 'intro' } })}>{tr('slotIntro')}</button>
        <button type="button" class="stop" onClick={() => send({ cmd: 'stop', args: {} })}>{tr('stopPlaying')}</button>
      </div>
    );
  }

  return (
    <div class="remote-app" data-sport={snap?.sport ?? 'football'}>
      <style>{ACCENT_CSS}</style>
      <h1>{`${tr('appTitle')} · ${tr('remoteTitle')}`}</h1>
      {warn && <p class="notice warn" role="note">{tr('remoteUnencrypted')}</p>}
      {phase !== 'board' && (
        <form class="remote-pair" onSubmit={pair}>
          {phase === 'ended' && <p role="status" class="notice">{tr('remoteEnded')}</p>}
          <label class="stack">{tr('remoteEnterCode')}
            <input value={digits} inputMode="numeric" autocomplete="one-time-code" maxLength={6} pattern="[0-9]*"
              onInput={e => setDigits(e.currentTarget.value.replace(/\D/g, '').slice(0, 6))} />
          </label>
          {error && <p role="alert" class="error">{tr(error)}</p>}
          <button type="submit" class="goal" disabled={digits.length !== 6 || busy}>{tr('remoteConnect')}</button>
        </form>
      )}
      {phase === 'board' && banner && <p role="status" class="remote-status">{tr(banner)}</p>}
      {board}
    </div>
  );
}
