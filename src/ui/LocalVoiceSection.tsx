import { useRef, useState } from 'preact/hooks';
import type { Dispatch, StateUpdater } from 'preact/hooks';
import type { Lang } from '../domain/model';
import { LANGS, getPack, t } from '../i18n';
import type { UiStrings } from '../i18n';
import { HttpTtsEngine, LOCAL_TTS_DEFAULT_URL, isLocalUrl } from '../tts/httpEngine';
import type { ClubVoice, RemoteVoice } from '../tts/httpEngine';
import { LOCAL_PREFIX } from '../tts/routingEngine';
import { defaultVoiceFor } from '../tts/voices';
import { ClubVoiceDialog } from './ClubVoiceDialog';
import { fill } from './fill';
import { LocalError } from './LocalError';
import type { PanelProps } from './types';

const getPackName = (code: string): string => ((LANGS as readonly string[]).includes(code) ? getPack(code as Lang).nativeName : code);

interface Props extends PanelProps {
  /** The voices of the connected server; the voice select of the Sounds panel lists them too. */
  remote: RemoteVoice[];
  setRemote: Dispatch<StateUpdater<RemoteVoice[]>>;
}

/** Step 4, "Local voice server (advanced)": connect to Fanfare Studio on this computer and manage club voices. */
export function LocalVoiceSection({ state, dispatch, remote, setRemote }: Props) {
  const lang = state.lang;
  const tr = (k: keyof UiStrings) => t(lang, k);
  const [urlField, setUrlField] = useState(state.localTts?.url ?? LOCAL_TTS_DEFAULT_URL);
  const [status, setStatus] = useState<{ kind: 'busy' } | { kind: 'ok'; count: number } | { kind: 'error'; error: unknown } | null>(null);
  const [recording, setRecording] = useState(false);
  const [clubNote, setClubNote] = useState<{ name: string; warnings: string[] } | null>(null);
  const [clubError, setClubError] = useState<unknown>(null);
  const recordButton = useRef<HTMLButtonElement>(null);

  const connect = async () => {
    const url = urlField.trim().replace(/\/+$/, '');
    if (!isLocalUrl(url)) { setStatus({ kind: 'error', error: new Error(tr('localUrlInvalid')) }); return; }
    setStatus({ kind: 'busy' });
    try {
      const found = await new HttpTtsEngine(url).listVoices();
      setRemote(found);
      dispatch({ type: 'setLocalTts', url });
      setStatus({ kind: 'ok', count: found.length });
    } catch (e) {
      setStatus({ kind: 'error', error: e });
    }
  };

  const disconnect = () => {
    dispatch({ type: 'setLocalTts', url: null });
    setRemote([]);
    setStatus(null);
    setClubNote(null);
  };

  const clubSaved = (v: ClubVoice) => {
    setRecording(false);
    setRemote(list => [...list.filter(x => x.id !== v.id), { id: v.id, lang: v.lang, label: v.label }]);
    setClubNote({ name: v.label, warnings: v.warnings });
    if (v.lang === lang) dispatch({ type: 'setVoice', voiceId: LOCAL_PREFIX + v.id });
    requestAnimationFrame(() => recordButton.current?.focus());
  };

  const deleteClub = async (v: RemoteVoice) => {
    if (!state.localTts || !window.confirm(fill(tr('clubDeleteConfirm'), { name: v.label }))) return;
    setClubError(null);
    try {
      await new HttpTtsEngine(state.localTts.url).deleteReference(v.id);
      setRemote(list => list.filter(x => x.id !== v.id));
      if (state.voiceId === LOCAL_PREFIX + v.id) dispatch({ type: 'setVoice', voiceId: defaultVoiceFor(lang) });
    } catch (e) {
      setClubError(e);
    }
  };

  const clubVoices = remote.filter(v => v.id.startsWith('club-'));
  return (
    <>
      <details class="help local-server">
        <summary>{tr('localServerTitle')}</summary>
        <p class="hint">{tr('localServerHint')}</p>
        <label class="stack">{tr('localServerUrl')}
          <input type="url" inputMode="url" dir="ltr" value={urlField} spellcheck={false} autocomplete="off"
            onInput={e => setUrlField(e.currentTarget.value)} />
        </label>
        <div class="row-actions">
          <button type="button" disabled={status?.kind === 'busy'} onClick={() => void connect()}>{tr('localConnect')}</button>
          {state.localTts && <button type="button" onClick={disconnect}>{tr('localDisconnect')}</button>}
        </div>
        {status?.kind === 'busy' && <p role="status">{tr('localConnecting')}</p>}
        {status?.kind === 'ok' && <p role="status">{fill(tr('localVoicesFound'), { count: status.count })}</p>}
        {status?.kind === 'error' && <LocalError lang={lang} error={status.error} prefix={detail => fill(tr('localConnectFailed'), { detail })} />}
        {state.localTts && (
          <>
            <button type="button" ref={recordButton} onClick={() => { setClubNote(null); setRecording(true); }}>{tr('clubRecord')}</button>
            {clubNote && (
              <p role="status">
                {fill(tr('clubSaved'), { name: clubNote.name })}
                {clubNote.warnings.map(w => <><br />{fill(tr('clubWarning'), { detail: w })}</>)}
              </p>
            )}
            {clubError !== null && <LocalError lang={lang} error={clubError} prefix={detail => fill(tr('clubDeleteFailed'), { detail })} />}
            {clubVoices.length > 0 && (
              <ul class="club-voices">
                {clubVoices.map(v => (
                  <li key={v.id}>
                    <span>{v.label} <small>({getPackName(v.lang)})</small></span>
                    <button type="button" aria-label={`${tr('clubDelete')}: ${v.label}`} title={tr('clubDelete')} onClick={() => void deleteClub(v)}>🗑</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </details>
      {recording && state.localTts && (
        <ClubVoiceDialog lang={lang} serverUrl={state.localTts.url} onSaved={clubSaved} onClose={() => { setRecording(false); requestAnimationFrame(() => recordButton.current?.focus()); }} />
      )}
    </>
  );
}
