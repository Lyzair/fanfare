import { encodeWav } from '../../src/audio/wav';
import { synthFanfare, synthIntro, defaultSoundBlob } from '../../src/audio/defaultSounds';

async function bytes(b: Blob): Promise<ArrayBuffer> {
  return typeof b.arrayBuffer === 'function' ? b.arrayBuffer() : new Response(b).arrayBuffer();
}
function peak(s: Float32Array): number {
  let m = 0;
  for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(s[i]));
  return m;
}

test('encodeWav writes a valid RIFF header', async () => {
  const b = encodeWav(new Float32Array(100), 22050);
  const v = new DataView(await bytes(b));
  expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
  expect(v.getUint32(24, true)).toBe(22050);
  expect(v.getUint16(34, true)).toBe(16);
  expect(b.size).toBe(44 + 200);
  expect(b.type).toBe('audio/wav');
});

test('samples are clipped to [-1, 1]', async () => {
  const v = new DataView(await bytes(encodeWav(new Float32Array([2, -2]), 22050)));
  expect(v.getInt16(44, true)).toBe(32767);
  expect(v.getInt16(46, true)).toBe(-32768);
});

test('fanfare length and peak', () => {
  const s = synthFanfare(22050);
  expect(s.length / 22050).toBeCloseTo(1.8, 1);
  expect(peak(s)).toBeLessThanOrEqual(0.9);
  expect(peak(s)).toBeGreaterThan(0.8);
  expect(s[0]).toBe(0);
  expect(s[s.length - 1]).toBeCloseTo(0, 2);
});

test('intro length and edges', () => {
  const s = synthIntro(22050);
  expect(s.length / 22050).toBeCloseTo(1.5, 1);
  expect(peak(s)).toBeLessThanOrEqual(0.9);
  expect(peak(s)).toBeGreaterThan(0.1);
  expect(s[0]).toBe(0);
  expect(s[s.length - 1]).toBeCloseTo(0, 2);
});

test('defaultSoundBlob memoizes per slot', () => {
  expect(defaultSoundBlob('score')).toBe(defaultSoundBlob('score'));
  expect(defaultSoundBlob('intro')).toBe(defaultSoundBlob('intro'));
  expect(defaultSoundBlob('score')).not.toBe(defaultSoundBlob('intro'));
  expect(defaultSoundBlob('score').type).toBe('audio/wav');
});
