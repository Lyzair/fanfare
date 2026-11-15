import { useRef, useState } from 'preact/hooks';
import { SOUND_SLOTS } from '../domain/model';
import type { Lang, SoundSlot } from '../domain/model';
import { LANGS, getPack, t } from '../i18n';
import type { UiStrings } from '../i18n';
import { saveSoundBlob } from '../state/persist';
import { HttpTtsEngine, LOCAL_TTS_DEFAULT_URL, isLocalUrl } from '../tts/httpEngine';
import type { ClubVoice, RemoteVoice } from '../tts/httpEngine';
import { LOCAL_PREFIX } from '../tts/routingEngine';
import { VOICES, defaultVoiceFor } from '../tts/voices';
import { playSound } from './actions';
import { ClubVoiceDialog } from './ClubVoiceDialog';
import { fill } from './fill';
import { LocalError } from './LocalError';
import { rememberSound } from './soundMemory';
import type { PanelProps } from './types';
import { usePlayback } from './usePlayback';

const MAX_BYTES = 10 * 1024 * 1024;
const SLOT_LABEL: Record<SoundSlot, keyof UiStrings> = { score: 'slotScore', intro: 'slotIntro' };

const getPackName = (code: string): string => ((LANGS as readonly string[]).includes(code) ? getPack(code as Lang).nativeName : code);

export default function SoundsPanel({ state, dispatch }: PanelProps) {
  const lang = state.lang;
  const tr = (k: keyof UiStrings) => t(lang, k);
  const [error, setError] = useState<keyof UiStrings | null>(null);
  const [urlField, setUrlField] = useState(state.localTts?.url ?? LOCAL_TTS_DEFAULT_URL);
  const [remote, setRemote] = useState<RemoteVoice[]>([]);
  const [status, setStatus] = useState<{ kind: 'busy' } | { kind: 'ok'; count: number } | { kind: 'error'; error: unknown } | null>(null);
  const [recording, setRecording] = useState(false);
  const [clubNote, setClubNote] = useState<{ name: string; warnings: string[] } | null>(null);
  const [clubError, setClubError] = useState<unknown>(null);
  const recordButton = useRef<HTMLButtonElement>(null);
  const playback = usePlayback(state);
  if (!playback) return null;

  const preview = (slot: SoundSlot) => playSound(playback.env, slot);

  const upload = async (slot: SoundSlot, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('audio/')) { setError('errorNotAudio'); return; }
    if (file.size > MAX_BYTES) { setError('errorTooLarge'); return; }
    setError(null);
    rememberSound(slot, file); // keeps it usable this session even if storage fails
    try { await saveSoundBlob(slot, file); } catch { /* private mode: in-memory copy is used */ }
    dispatch({ type: 'setCustomSound', slot, sound: { name: file.name, mime: file.type } });
  };

  const reset = async (slot: SoundSlot) => {
    setError(null);
    rememberSound(slot, null);
    try { await saveSoundBlob(slot, null); } catch { /* nothing stored */ }
    dispatch({ type: 'setCustomSound', slot, sound: null });
  };

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

  const voices = VOICES.filter(v => v.lang === lang);
  const localVoices = remote.filter(v => v.lang === lang);
  const selectedLocal = state.voiceId.startsWith(LOCAL_PREFIX) ? state.voiceId.slice(LOCAL_PREFIX.length) : null;
  // a local voice chosen earlier stays selectable (its clips may be cached) even while not connected
  const orphan = selectedLocal !== null && !localVoices.some(v => v.id === selectedLocal) ? selectedLocal : null;
  const clubVoices = remote.filter(v => v.id.startsWith('club-'));
  return (
    <div class="sounds-panel">
      <label class="stack">{tr('voiceLabel')}
        <select value={state.voiceId} onChange={e => dispatch({ type: 'setVoice', voiceId: e.currentTarget.value })}>
          {voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          {(localVoices.length > 0 || orphan !== null) && (
            <optgroup label={tr('localVoicesGroup')}>
              {localVoices.map(v => <option key={v.id} value={LOCAL_PREFIX + v.id}>{v.label}</option>)}
              {orphan !== null && <option value={LOCAL_PREFIX + orphan}>{orphan}</option>}
            </optgroup>
          )}
        </select>
      </label>
      <label class="check">
        <input type="checkbox" checked={state.soundsEnabled}
          onChange={e => dispatch({ type: 'setSoundsEnabled', on: e.currentTarget.checked })} />
        {tr('playSounds')}
      </label>
      {error && <p role="alert" class="error">{tr(error)}</p>}
      {SOUND_SLOTS.map(slot => {
        const custom = state.customSounds[slot];
        const name = tr(SLOT_LABEL[slot]);
        return (
          <div class="sound-slot" key={slot}>
            <strong>{name}</strong>
            <span class="sound-name">{custom ? custom.name : tr('defaultSoundName')}</span>
            <div class="row-actions">
              <button type="button" aria-label={`${tr('previewSound')} ${name}`} title={tr('previewSound')} onClick={() => preview(slot)}>▶</button>
              <label class="file-button">
                <span>{tr('chooseFile')}</span>
                <input type="file" accept="audio/*" aria-label={name}
                  onChange={e => { const input = e.currentTarget; void upload(slot, input.files?.[0]).finally(() => { input.value = ''; }); }} />
              </label>
              {custom && <button type="button" aria-label={`${tr('resetSound')} (${name})`} onClick={() => void reset(slot)}>{tr('resetSound')}</button>}
            </div>
          </div>
        );
      })}
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
    </div>
  );
}
