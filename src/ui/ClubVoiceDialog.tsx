import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import type { Lang } from '../domain/model';
import { LANGS, getPack, t } from '../i18n';
import type { UiStrings } from '../i18n';
import { HttpTtsEngine } from '../tts/httpEngine';
import type { ClubVoice } from '../tts/httpEngine';
import { RECORD_MAX_MS, RecordingError, startRecording } from '../tts/recorder';
import type { ActiveRecording } from '../tts/recorder';
import { fill } from './fill';
import { LocalError } from './LocalError';
import { ServicesContext } from './types';

const NAME_MAX = 40;

/**
 * Records a short sample of the club's announcer and sends it to the user's own voice server.
 * The recording lives only in this component's memory (never IndexedDB, speech cache or export):
 * it is dropped on save, cancel and unmount. The microphone is opened only after "Record".
 */
export function ClubVoiceDialog({ lang, serverUrl, onSaved, onClose }: {
  lang: Lang; serverUrl: string; onSaved: (v: ClubVoice) => void; onClose: () => void;
}) {
  const services = useContext(ServicesContext);
  const tr = (k: keyof UiStrings) => t(lang, k);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [left, setLeft] = useState(RECORD_MAX_MS / 1000);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [name, setName] = useState(tr('clubNameDefault'));
  const [voiceLang, setVoiceLang] = useState<Lang>(lang);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const blob = useRef<Blob | null>(null);
  const active = useRef<ActiveRecording | null>(null);
  const urlRef = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const mounted = useRef(true);

  const dropRecording = () => {
    blob.current = null;
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  };

  useEffect(() => {
    mounted.current = true;
    root.current?.focus();
    return () => {
      mounted.current = false;
      active.current?.cancel();
      dropRecording();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    const started = Date.now();
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil((RECORD_MAX_MS - (Date.now() - started)) / 1000))), 250);
    return () => clearInterval(id);
  }, [phase]);

  const record = async () => {
    setError(null);
    dropRecording();
    setPlaybackUrl(null);
    setPhase('idle');
    let rec: ActiveRecording;
    try {
      rec = await startRecording();
    } catch (e) {
      if (mounted.current) setError(e);
      return;
    }
    if (!mounted.current) { rec.cancel(); return; }
    active.current = rec;
    setLeft(RECORD_MAX_MS / 1000);
    setPhase('recording');
    rec.done.then(
      b => {
        active.current = null;
        if (!mounted.current) return;
        blob.current = b;
        urlRef.current = URL.createObjectURL(b);
        setPlaybackUrl(urlRef.current);
        setPhase('recorded');
      },
      (e: unknown) => {
        active.current = null;
        if (!mounted.current) return;
        setPhase('idle');
        if (!(e instanceof RecordingError && e.kind === 'cancelled')) setError(e);
      },
    );
  };

  const play = () => {
    services?.queue.unlock();
    void audio.current?.play().catch(() => undefined);
  };

  const save = async () => {
    const b = blob.current;
    if (!b || !consent || !name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const voice = await new HttpTtsEngine(serverUrl).uploadReference(b, { name: name.trim().slice(0, NAME_MAX), lang: voiceLang });
      dropRecording(); // uploaded: nothing of the recording stays in memory
      if (!mounted.current) return;
      setPlaybackUrl(null);
      onSaved(voice);
    } catch (e) {
      if (mounted.current) { setError(e); setSaving(false); }
    }
  };

  const close = () => { active.current?.cancel(); dropRecording(); onClose(); };

  const errorView = () => {
    if (!error) return null;
    if (error instanceof RecordingError) {
      const key = ({ denied: 'clubMicDenied', 'no-mic': 'clubNoMic' } as Partial<Record<string, keyof UiStrings>>)[error.kind] ?? 'clubMicFailed';
      return <p role="alert" class="error">{tr(key)}</p>;
    }
    return <LocalError lang={lang} error={error} prefix={detail => fill(tr('clubRejected'), { detail })} />;
  };

  return (
    <div class="club-dialog-backdrop">
      <div class="club-dialog" role="dialog" aria-modal="true" aria-labelledby="club-dialog-title" tabIndex={-1} ref={root}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <h3 id="club-dialog-title">{tr('clubDialogTitle')}</h3>
        <p class="hint">{tr('clubReadIntro')}</p>
        <blockquote class="club-reading" lang={lang}>{tr('clubReadText')}</blockquote>
        <div class="row-actions club-record-row">
          {phase !== 'recording'
            ? <button type="button" class="primary" disabled={saving} onClick={() => void record()}>{tr('clubStart')}</button>
            : <button type="button" class="stop" onClick={() => active.current?.stop()}>{tr('clubStopRec')}</button>}
          {phase === 'recording' && <span role="timer" class="countdown">{fill(tr('clubCountdown'), { seconds: left })}</span>}
          {phase === 'recorded' && playbackUrl && (
            <>
              <button type="button" aria-label={tr('clubPlayback')} title={tr('clubPlayback')} onClick={play}>▶</button>
              <audio ref={audio} src={playbackUrl} />
            </>
          )}
        </div>
        <label class="stack">{tr('clubName')}
          <input type="text" value={name} maxLength={NAME_MAX} onInput={e => setName(e.currentTarget.value)} />
        </label>
        <label class="stack">{tr('clubLang')}
          <select value={voiceLang} onChange={e => setVoiceLang(e.currentTarget.value as Lang)}>
            {LANGS.map(l => <option key={l} value={l}>{getPack(l).nativeName}</option>)}
          </select>
        </label>
        <label class="check">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.currentTarget.checked)} />
          {tr('clubConsent')}
        </label>
        <p class="hint">{tr('clubPrivacy')}</p>
        {errorView()}
        <div class="row-actions">
          <button type="button" class="primary" disabled={!consent || phase !== 'recorded' || !name.trim() || saving} onClick={() => void save()}>
            {saving ? tr('clubSaving') : tr('clubSave')}
          </button>
          <button type="button" onClick={close}>{tr('clubCancel')}</button>
        </div>
      </div>
    </div>
  );
}
