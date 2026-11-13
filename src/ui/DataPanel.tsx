import { useContext, useState } from 'preact/hooks';
import type { SoundSlot } from '../domain/model';
import { t } from '../i18n';
import type { UiStrings } from '../i18n';
import { ImportError, exportArchive, importArchive } from '../io/archive';
import type { ArchiveContent } from '../io/archive';
import { initialState } from '../state/reducer';
import { clearAll, loadSoundBlob, saveSoundBlob } from '../state/persist';
import { recalledSound, rememberSound } from './soundMemory';
import { ServicesContext } from './types';
import type { PanelProps } from './types';

const SLOTS: SoundSlot[] = ['score', 'intro'];

function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function DataPanel({ state, dispatch }: PanelProps) {
  const services = useContext(ServicesContext);
  const lang = state.lang;
  const tr = (k: keyof UiStrings) => t(lang, k);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; key: keyof UiStrings } | null>(null);
  if (!services) return null;
  const { speech } = services;

  const doExport = async () => {
    setMessage(null);
    try {
      const sounds: ArchiveContent['sounds'] = {};
      for (const slot of SLOTS) {
        if (!state.customSounds[slot]) continue;
        let blob: Blob | null | undefined = recalledSound(slot);
        if (!blob) { try { blob = await loadSoundBlob(slot); } catch { blob = null; } }
        if (blob) sounds[slot] = blob;
      }
      const zip = await exportArchive({ state, sounds, speech: speech.entries() });
      const url = URL.createObjectURL(zip);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sports-caller-${todayStamp()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage({ kind: 'error', key: 'exportFailed' });
    }
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    let content: ArchiveContent;
    try {
      content = await importArchive(file);
    } catch (e) {
      setMessage({ kind: 'error', key: e instanceof ImportError ? (`import.${e.code}` as keyof UiStrings) : 'import.failed' });
      return;
    }
    if (!window.confirm(tr('importConfirm'))) return;
    try {
      for (const slot of SLOTS) rememberSound(slot, null);
      for (const slot of SLOTS) {
        const blob = content.sounds[slot];
        if (blob) rememberSound(slot, blob);
      }
      for (const slot of SLOTS) {
        try { await saveSoundBlob(slot, content.sounds[slot] ?? null); } catch { /* private mode: in-memory copy is used */ }
      }
      speech.load(content.speech); // also persists each clip, logging failures
      dispatch({ type: 'replaceAll', state: content.state });
      setMessage({ kind: 'ok', key: 'importDone' });
    } catch {
      setMessage({ kind: 'error', key: 'import.failed' });
    }
  };

  const deleteAll = async () => {
    if (!window.confirm(tr('deleteConfirm'))) return;
    setMessage(null);
    try { await clearAll(); } catch { /* nothing stored or storage unavailable */ }
    for (const slot of SLOTS) rememberSound(slot, null);
    speech.clear();
    dispatch({ type: 'replaceAll', state: initialState(lang) });
    setMessage({ kind: 'ok', key: 'deleteDone' });
  };

  return (
    <div class="data-panel">
      <div class="row-actions">
        <button type="button" onClick={() => void doExport()}>{tr('exportData')}</button>
        <label class="file-button">
          <span>{tr('importData')}</span>
          <input type="file" aria-label={tr('importData')}
            onChange={e => { const input = e.currentTarget; void doImport(input.files?.[0]).finally(() => { input.value = ''; }); }} />
        </label>
        <button type="button" class="danger" onClick={() => void deleteAll()}>{tr('deleteAll')}</button>
      </div>
      {message?.kind === 'error' && <p role="alert" class="error">{tr(message.key)}</p>}
      {message?.kind === 'ok' && <p role="status">{tr(message.key)}</p>}
      <p class="privacy-note">{tr('privacyNote')}</p>
    </div>
  );
}
