import { useState } from 'preact/hooks';
import { SOUND_SLOTS } from '../domain/model';
import type { SoundSlot } from '../domain/model';
import { t } from '../i18n';
import type { UiStrings } from '../i18n';
import { saveSoundBlob } from '../state/persist';
import type { RemoteVoice } from '../tts/httpEngine';
import { LOCAL_PREFIX } from '../tts/routingEngine';
import { VOICES } from '../tts/voices';
import { playSound } from './actions';
import { LocalVoiceSection } from './LocalVoiceSection';
import { rememberSound } from './soundMemory';
import type { PanelProps } from './types';
import { usePlayback } from './usePlayback';

const MAX_BYTES = 10 * 1024 * 1024;
const SLOT_LABEL: Record<SoundSlot, keyof UiStrings> = { score: 'slotScore', intro: 'slotIntro' };

export default function SoundsPanel({ state, dispatch }: PanelProps) {
  const lang = state.lang;
  const tr = (k: keyof UiStrings) => t(lang, k);
  const [error, setError] = useState<keyof UiStrings | null>(null);
  const [remote, setRemote] = useState<RemoteVoice[]>([]);
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

  const voices = VOICES.filter(v => v.lang === lang);
  const localVoices = remote.filter(v => v.lang === lang);
  const selectedLocal = state.voiceId.startsWith(LOCAL_PREFIX) ? state.voiceId.slice(LOCAL_PREFIX.length) : null;
  // a local voice chosen earlier stays selectable (its clips may be cached) even while not connected
  const orphan = selectedLocal !== null && !localVoices.some(v => v.id === selectedLocal) ? selectedLocal : null;
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
      <LocalVoiceSection state={state} dispatch={dispatch} remote={remote} setRemote={setRemote} />
    </div>
  );
}
