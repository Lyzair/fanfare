import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { QrCode } from '../remote/qr';
import { probeRemote, SpeakerLink } from '../remote/links';
import type { RemoteHealth } from '../remote/links';
import { runRemoteCommand } from '../remote/dispatch';
import { buildSnapshot } from '../remote/protocol';
import { t } from '../i18n';
import { fill } from './PlayerEditor';
import { useCustomSoundBlob } from './soundMemory';
import { ServicesContext } from './types';
import type { PanelProps } from './types';
import type { ActionEnv } from './actions';

type Probe = 'checking' | 'unavailable' | RemoteHealth;
type Phase = 'idle' | 'starting' | 'active';

/** Step 3: pair a phone as remote. Only works when this page is served by scripts/fanfare-local.py. */
export default function RemotePanel({ state }: PanelProps) {
  const services = useContext(ServicesContext);
  const lang = state.lang;
  const tr = (k: Parameters<typeof t>[1]) => t(lang, k);
  const [probe, setProbe] = useState<Probe>('checking');
  const [phase, setPhase] = useState<Phase>('idle');
  const [failed, setFailed] = useState(false);
  const [ttsFailed, setTtsFailed] = useState(false);
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [expired, setExpired] = useState(false);
  const [count, setCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const link = useRef<SpeakerLink | null>(null);
  const activated = useRef(false);
  const env = useRef<ActionEnv | null>(null);
  const introBlob = useCustomSoundBlob('intro', state.customSounds.intro);
  const scoreBlob = useCustomSoundBlob('score', state.customSounds.score);

  useEffect(() => {
    let cancelled = false;
    void probeRemote().then(p => { if (!cancelled) setProbe(p ?? 'unavailable'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const q = services?.queue;
    if (!q) return;
    const prev = q.onChange;
    q.onChange = p => { setPlaying(p); prev?.(p); };
    setPlaying(q.playing);
    return () => { q.onChange = prev; };
  }, [services]);

  useEffect(() => {
    if (!code) return;
    setExpired(false);
    const id = setTimeout(() => setExpired(true), Math.max(0, code.expiresAt - Date.now()));
    return () => clearTimeout(id);
  }, [code]);

  useEffect(() => {
    if (phase === 'active') link.current?.pushState(buildSnapshot(state, playing, activated.current));
  }, [state, playing, phase]);

  useEffect(() => () => link.current?.detach(), []); // the page goes away: stop listening (the laptop server keeps no trace)

  if (!services) return null;
  const { queue, speech } = services;
  env.current = {
    state, queue, speech, blobs: { intro: introBlob, score: scoreBlob },
    onStart: () => setTtsFailed(false), onError: () => setTtsFailed(true),
  };

  const showCode = (c: string, expiresIn: number) => setCode({ code: c, expiresAt: Date.now() + expiresIn * 1000 });
  const reset = () => { link.current = null; setPhase('idle'); setCode(null); setCount(0); };

  const activate = async () => {
    queue.unlock(); // the tap that lets the browser play sound later; must happen synchronously in the click
    activated.current = true;
    setFailed(false);
    setPhase('starting');
    const l = new SpeakerLink({
      onCommand: cmd => { if (env.current) runRemoteCommand(cmd, env.current, activated.current); },
      onRemotes: setCount,
      onCode: showCode,
      onEnded: reset,
    });
    try {
      const s = await l.start();
      link.current = l;
      showCode(s.code, s.expiresIn);
      setPhase('active');
    } catch {
      void l.end();
      setFailed(true);
      setPhase('idle');
    }
  };

  const end = () => {
    const l = link.current;
    reset();
    void l?.end();
  };

  const renew = async () => {
    const c = await link.current?.newCode();
    if (c) showCode(c.code, c.expiresIn);
  };

  let body;
  if (probe === 'checking') body = null;
  else if (probe === 'unavailable') body = <p class="hint">{tr('remoteNeedsLocal')}</p>;
  else if (probe.urls.length === 0) body = <p class="hint">{tr('remoteNeedsLan')}</p>;
  else if (phase !== 'active') {
    body = (
      <>
        <p class="hint">{tr('remoteActivateHint')}</p>
        <button type="button" class="primary" disabled={phase === 'starting'} onClick={() => void activate()}>{tr('remoteActivate')}</button>
        {failed && <p role="alert" class="error">{tr('remoteStartFailed')}</p>}
      </>
    );
  } else {
    const url = `${probe.urls[0]}/#remote`;
    body = (
      <div class="remote-live">
        <QrCode text={url} label={tr('remoteQrLabel')} />
        <p class="hint">{tr('remoteScan')}</p>
        <p class="remote-url"><code>{url}</code></p>
        {expired ? (
          <>
            <p class="hint">{tr('remoteCodeExpired')}</p>
            <button type="button" onClick={() => void renew()}>{tr('remoteNewCode')}</button>
          </>
        ) : (
          <>
            <p class="hint">{tr('remoteCodeLabel')}</p>
            <strong class="remote-code">{code?.code}</strong>
          </>
        )}
        <p role="status" class="progress">{count === 1 ? tr('remotePhonesOne') : fill(tr('remotePhonesMany'), { n: count })}</p>
        {!probe.secure && <p class="notice warn" role="note">{tr('remoteUnencrypted')}</p>}
        <button type="button" onClick={end}>{tr('remoteEnd')}</button>
      </div>
    );
  }
  return (
    <section class="remote-panel" aria-labelledby="remote-title">
      <h3 id="remote-title">{tr('remoteTitle')}</h3>
      {body}
      {ttsFailed && <p role="alert" class="error">{tr('ttsError')}</p>}
    </section>
  );
}
