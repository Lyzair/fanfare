import { RecordingError, startRecording, RECORD_MAX_MS } from '../../src/tts/recorder';

class FakeTrack { stopped = false; stop() { this.stopped = true; } }
class FakeStream { tracks = [new FakeTrack(), new FakeTrack()]; getTracks() { return this.tracks; } }
let recorders: FakeRecorder[] = [];
class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  stream: FakeStream;
  constructor(stream: FakeStream) { this.stream = stream; recorders.push(this); }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['abc'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

let stream: FakeStream;
let getUserMedia: ReturnType<typeof vi.fn>;
beforeEach(() => {
  recorders = [];
  stream = new FakeStream();
  getUserMedia = vi.fn(async () => stream);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

test('the microphone is only opened by startRecording, and tracks are stopped right after stop()', async () => {
  expect(getUserMedia).not.toHaveBeenCalled();
  const rec = await startRecording();
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  expect(stream.tracks.every(t => !t.stopped)).toBe(true);
  rec.stop();
  const blob = await rec.done;
  expect(blob.size).toBe(3);
  expect(blob.type).toBe('audio/webm');
  expect(stream.tracks.every(t => t.stopped)).toBe(true);
});

test('auto-stops after 20 seconds', async () => {
  vi.useFakeTimers();
  const rec = await startRecording();
  expect(RECORD_MAX_MS).toBe(20_000);
  await vi.advanceTimersByTimeAsync(19_999);
  expect(recorders[0].state).toBe('recording');
  await vi.advanceTimersByTimeAsync(2);
  await rec.done;
  expect(recorders[0].state).toBe('inactive');
  expect(stream.tracks.every(t => t.stopped)).toBe(true);
});

test('cancel stops the tracks and drops the audio', async () => {
  const rec = await startRecording();
  rec.cancel();
  expect(stream.tracks.every(t => t.stopped)).toBe(true);
  await expect(rec.done).rejects.toMatchObject({ kind: 'cancelled' });
});

test.each([
  ['NotAllowedError', 'denied'],
  ['SecurityError', 'denied'],
  ['NotFoundError', 'no-mic'],
  ['OverconstrainedError', 'no-mic'],
  ['AbortError', 'failed'],
])('getUserMedia %s → RecordingError %s', async (name, kind) => {
  getUserMedia.mockRejectedValueOnce(new DOMException('x', name));
  await expect(startRecording()).rejects.toMatchObject({ name: 'RecordingError', kind });
});

test('no mediaDevices or MediaRecorder → unsupported', async () => {
  vi.stubGlobal('MediaRecorder', undefined);
  await expect(startRecording()).rejects.toBeInstanceOf(RecordingError);
  await expect(startRecording()).rejects.toMatchObject({ kind: 'unsupported' });
  expect(getUserMedia).not.toHaveBeenCalled();
});
