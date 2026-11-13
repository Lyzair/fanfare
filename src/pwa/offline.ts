export type OfflineStatus = 'ready' | 'noShell' | 'noVoice';

/** Ready = app shell precached (a worker controls the page) and the voice is on the device or every text is already a clip. */
export function offlineStatus(i: { controlled: boolean; voiceStored: boolean; allClips: boolean }): OfflineStatus {
  if (!i.controlled) return 'noShell';
  return i.voiceStored || i.allClips ? 'ready' : 'noVoice';
}

/**
 * Is the voice model in the speech library's OPFS store? The patched
 * piper-tts-web keeps `<voiceId>.onnx` (+ `.onnx.json`) in the OPFS
 * directory "piper" (see its readBlob/writeBlob).
 */
export async function voiceInOpfs(voiceId: string): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('piper');
    await dir.getFileHandle(`${voiceId}.onnx`);
    await dir.getFileHandle(`${voiceId}.onnx.json`);
    return true;
  } catch {
    return false;
  }
}
