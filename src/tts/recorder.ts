export type RecordingErrorKind = 'denied' | 'no-mic' | 'unsupported' | 'failed' | 'cancelled';

export class RecordingError extends Error {
  readonly kind: RecordingErrorKind;
  constructor(kind: RecordingErrorKind, options?: { cause?: unknown }) {
    super(`recording: ${kind}`, options);
    this.name = 'RecordingError';
    this.kind = kind;
  }
}

/** A club-voice sample is at most this long; the recorder stops itself then. */
export const RECORD_MAX_MS = 20_000;

export interface ActiveRecording {
  /** Stops recording; `done` then resolves with the audio. */
  stop(): void;
  /** Stops and throws the audio away (`done` rejects with kind "cancelled"). */
  cancel(): void;
  done: Promise<Blob>;
}

/**
 * Records the microphone. Call only from a click on "Record". The microphone stream is stopped as
 * soon as recording ends (stop, auto-stop, cancel or error). The audio exists only in the returned
 * Blob: it is not stored anywhere.
 */
export async function startRecording(maxMs: number = RECORD_MAX_MS): Promise<ActiveRecording> {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new RecordingError('unsupported');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new RecordingError('denied', { cause: e });
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new RecordingError('no-mic', { cause: e });
    throw new RecordingError('failed', { cause: e });
  }
  const release = () => stream.getTracks().forEach(t => t.stop());
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream);
  } catch (e) {
    release();
    throw new RecordingError('unsupported', { cause: e });
  }
  const chunks: Blob[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  let settled = false;
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      clearTimeout(timer);
      release();
      settled = true;
      if (cancelled) { chunks.length = 0; reject(new RecordingError('cancelled')); return; }
      const type = (recorder.mimeType || 'audio/webm').split(';')[0];
      resolve(new Blob(chunks, { type }));
    };
    recorder.onerror = () => {
      clearTimeout(timer);
      release();
      settled = true;
      reject(new RecordingError('failed'));
    };
  });
  done.catch(() => undefined); // a cancelled recording is not an unhandled rejection
  try {
    recorder.start();
  } catch (e) {
    release();
    throw new RecordingError('failed', { cause: e });
  }
  const stop = () => { if (!settled && recorder.state !== 'inactive') recorder.stop(); };
  timer = setTimeout(stop, maxMs);
  return { stop, cancel: () => { cancelled = true; if (recorder.state !== 'inactive') recorder.stop(); else release(); }, done };
}
