import { voicePath } from '../../src/tts/voices';
import { isVoicePresent, resetVoicePresence } from '../../src/tts/voicePresence';

const res = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response;

beforeEach(() => resetVoicePresence());

test('voicePath follows the piper-voices layout under voices/', () => {
  expect(voicePath('de_DE-thorsten-medium')).toBe('de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx');
  expect(voicePath('uk_UA-ukrainian_tts-medium')).toBe('uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium.onnx');
});

test('a voice whose model card answers 200 is present, asked with a plain GET next to the page', async () => {
  const f = vi.fn(async () => res(200));
  expect(await isVoicePresent('de_DE-thorsten-medium', f)).toBe(true);
  expect(f).toHaveBeenCalledWith('./voices/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json', { cache: 'no-store' });
});

test('a 404 means the voice is not in this download', async () => {
  expect(await isVoicePresent('en_US-ljspeech-medium', async () => res(404))).toBe(false);
});

test('a network error is not taken as missing (offline, the voice may be cached)', async () => {
  expect(await isVoicePresent('fr_FR-siwis-medium', async () => { throw new TypeError('offline'); })).toBe(true);
});

test('offline the voice is not asked for and counts as present', async () => {
  const f = vi.fn(async () => res(404));
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  expect(await isVoicePresent('it_IT-paola-medium', f)).toBe(true);
  expect(f).not.toHaveBeenCalled();
  online.mockRestore();
});

test('other statuses are not taken as missing', async () => {
  expect(await isVoicePresent('es_ES-davefx-medium', async () => res(500))).toBe(true);
});

test('the answer is remembered: one request for two questions', async () => {
  const f = vi.fn(async () => res(404));
  await isVoicePresent('pl_PL-mc_speech-medium', f);
  expect(await isVoicePresent('pl_PL-mc_speech-medium', f)).toBe(false);
  expect(f).toHaveBeenCalledTimes(1);
});
