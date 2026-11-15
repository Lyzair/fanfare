import { useContext, useEffect, useState } from 'preact/hooks';
import type { SoundSlot } from '../domain/model';
import { t } from '../i18n';
import type { UiStrings } from '../i18n';
import { ImportError, exportArchive, importArchive } from '../io/archive';
import { dateStamp, downloadBlob } from '../io/download';
import { exportTeamFile, teamFileName } from '../io/teamFile';
import type { ArchiveContent } from '../io/archive';
import { currentRoster, initialState } from '../state/reducer';
import { clearAll, loadSoundBlob, saveSoundBlob } from '../state/persist';
import { recalledSound, rememberSound } from './soundMemory';
import { offlineStatus, voiceInOpfs } from '../pwa/offline';
import type { OfflineStatus } from '../pwa/offline';
import { usePwaState } from '../pwa/register';
import { lineupTexts } from './CalloutPanel';
import { ServicesContext } from './types';
import type { PanelProps } from './types';

const SLOTS: SoundSlot[] = ['score', 'intro'];

export default function DataPanel({ state, dispatch }: PanelProps) {
  const services = useContext(ServicesContext);
  const lang = state.lang;
  const tr = (k: keyof UiStrings) => t(lang, k);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; key: keyof UiStrings } | null>(null);
  const pwa = usePwaState();
  const [voiceStored, setVoiceStored] = useState(false);
  const [allClips, setAllClips] = useState(false);
  const speechForStatus = services?.speech;
  const voiceId = state.voiceId;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const stored = await voiceInOpfs(voiceId);
      const texts = lineupTexts(state);
      const clips = !!speechForStatus && texts.length > 0 && texts.every(x => speechForStatus.has(voiceId, x));
      if (cancelled) return;
      setVoiceStored(stored);
      setAllClips(clips);
      if (!(stored || clips)) timer = setTimeout(() => void check(), 2000); // pick up a finished "Prepare voices"
    };
    void check();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [voiceId, state, speechForStatus]);
  if (!services) return null;
  const { speech } = services;
  const offline: OfflineStatus = offlineStatus({ controlled: pwa.controlled, voiceStored, allClips });
  const offlineKey = { ready: 'offlineReady', noShell: 'offlineNoShell', noVoice: 'offlineNoVoice' } as const;

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
      downloadBlob(zip, `fanfare-${dateStamp()}.zip`);
    } catch {
      setMessage({ kind: 'error', key: 'exportFailed' });
    }
  };

  /** Names only (no clips, no settings), meant to be sent to the other team's coach. */
  const doShare = () => {
    setMessage(null);
    const roster = currentRoster(state);
    if (roster.players.length === 0) { setMessage({ kind: 'error', key: 'shareNoPlayers' }); return; }
    try {
      const json = JSON.stringify(exportTeamFile(state), null, 2);
      downloadBlob(new Blob([json], { type: 'application/json' }), teamFileName(roster.homeTeam));
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
    // All-or-nothing: speech + state first (revertible), sounds only afterwards.
    const previousSpeech = speech.entries();
    try {
      speech.replace(content.speech);
      dispatch({ type: 'replaceAll', state: content.state });
    } catch {
      speech.replace(previousSpeech);
      setMessage({ kind: 'error', key: 'import.failed' });
      return;
    }
    for (const slot of SLOTS) rememberSound(slot, content.sounds[slot] ?? null);
    for (const slot of SLOTS) {
      try { await saveSoundBlob(slot, content.sounds[slot] ?? null); } catch { /* private mode: in-memory copy is used */ }
    }
    setMessage({ kind: 'ok', key: 'importDone' });
  };

  const deleteAll = async () => {
    if (!window.confirm(tr('deleteConfirm'))) return;
    setMessage(null);
    speech.clear(); // first: a clip still being made must not be stored after the wipe
    try { await clearAll(); } catch { /* nothing stored or storage unavailable */ }
    for (const slot of SLOTS) rememberSound(slot, null);
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
      <div class="share-team">
        <button type="button" onClick={doShare}>{tr('shareTeam')}</button>
        <p class="hint">{tr('shareNote')}</p>
      </div>
      <p class="offline-status" data-offline={offline} aria-live="polite">{tr(offlineKey[offline])}</p>
      {message?.kind === 'error' && <p role="alert" class="error">{tr(message.key)}</p>}
      {message?.kind === 'ok' && <p role="status">{tr(message.key)}</p>}
      <p class="privacy-note">{tr('privacyNote')}</p>
    </div>
  );
}
