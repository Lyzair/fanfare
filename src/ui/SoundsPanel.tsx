import { useContext, useState } from 'preact/hooks';
import type { SoundSlot } from '../domain/model';
import { t } from '../i18n';
import type { UiStrings } from '../i18n';
import { saveSoundBlob } from '../state/persist';
import { VOICES } from '../tts/voices';
import { playSound } from './actions';
import { rememberSound, useCustomSoundBlob } from './soundMemory';
import { ServicesContext } from './types';
import type { PanelProps } from './types';

const MAX_BYTES = 10 * 1024 * 1024;
const SLOTS: { slot: SoundSlot; label: keyof UiStrings }[] = [
  { slot: 'score', label: 'slotScore' },
  { slot: 'intro', label: 'slotIntro' },
];

export default function SoundsPanel({ state, dispatch }: PanelProps) {
  const services = useContext(ServicesContext);
  const lang = state.lang;
  const tr = (k: keyof UiStrings) => t(lang, k);
  const [error, setError] = useState<keyof UiStrings | null>(null);
  const blobs: Record<SoundSlot, Blob | null> = {
    score: useCustomSoundBlob('score', state.customSounds.score),
    intro: useCustomSoundBlob('intro', state.customSounds.intro),
  };
  if (!services) return null;
  const { queue, speech } = services;

  const preview = (slot: SoundSlot) => playSound({ state, queue, speech, blobs }, slot);

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
  return (
    <div class="sounds-panel">
      <label class="stack">{tr('voiceLabel')}
        <select value={state.voiceId} onChange={e => dispatch({ type: 'setVoice', voiceId: e.currentTarget.value })}>
          {voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </label>
      <label class="check">
        <input type="checkbox" checked={state.soundsEnabled}
          onChange={e => dispatch({ type: 'setSoundsEnabled', on: e.currentTarget.checked })} />
        {tr('playSounds')}
      </label>
      {error && <p role="alert" class="error">{tr(error)}</p>}
      {SLOTS.map(({ slot, label }) => {
        const custom = state.customSounds[slot];
        const name = tr(label);
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
    </div>
  );
}
