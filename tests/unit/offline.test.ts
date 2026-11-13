import { offlineStatus, voiceInOpfs } from '../../src/pwa/offline';

test('status combines shell and voice/clips', () => {
  expect(offlineStatus({ controlled: false, voiceStored: true, allClips: true })).toBe('noShell');
  expect(offlineStatus({ controlled: true, voiceStored: false, allClips: false })).toBe('noVoice');
  expect(offlineStatus({ controlled: true, voiceStored: true, allClips: false })).toBe('ready');
  expect(offlineStatus({ controlled: true, voiceStored: false, allClips: true })).toBe('ready');
});

function fakeOpfs(files: string[]) {
  const dir = { getFileHandle: async (n: string) => { if (!files.includes(n)) throw new DOMException('x', 'NotFoundError'); return {}; } };
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { getDirectory: async () => ({ getDirectoryHandle: async (n: string) => { if (n !== 'piper') throw new Error('x'); return dir; } }) },
  });
}

test('voiceInOpfs needs model and config in the piper directory', async () => {
  fakeOpfs(['v1.onnx', 'v1.onnx.json', 'v2.onnx']);
  expect(await voiceInOpfs('v1')).toBe(true);
  expect(await voiceInOpfs('v2')).toBe(false);
  expect(await voiceInOpfs('v3')).toBe(false);
});

test('voiceInOpfs is false when OPFS is unavailable', async () => {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
  expect(await voiceInOpfs('v1')).toBe(false);
});
