import { render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'preact/hooks';
import SoundsPanel from '../../src/ui/SoundsPanel';
import { ServicesContext } from '../../src/ui/types';
import type { Services } from '../../src/ui/types';
import { initialState, reducer } from '../../src/state/reducer';
import type { AppState, Lang } from '../../src/domain/model';
import type { QueueItem } from '../../src/audio/queue';
import { saveSoundBlob } from '../../src/state/persist';
import { queueEvents } from './queueEvents';

vi.mock('../../src/state/persist', () => ({
  loadSoundBlob: vi.fn(async () => null),
  saveSoundBlob: vi.fn(async () => {}),
}));

let latest: AppState;
function setup(lang: Lang = 'en', init?: (s: AppState) => AppState) {
  const queue = { playing: false, ...queueEvents(), unlock: vi.fn(), stop: vi.fn(), play: vi.fn(async (_i: QueueItem[]) => {}) };
  const services = { queue, speech: { get: vi.fn() } } as unknown as Services;
  function H() {
    const [state, dispatch] = useReducer(reducer, undefined, () => (init ? init(initialState(lang)) : initialState(lang)));
    latest = state;
    return <ServicesContext.Provider value={services}><SoundsPanel state={state} dispatch={dispatch} /></ServicesContext.Provider>;
  }
  render(<H />);
  return { queue };
}
beforeEach(() => vi.clearAllMocks());

test('voice select only lists voices of the current language', () => {
  setup('de');
  const select = screen.getByRole('combobox', { name: 'Stimme' });
  const opts = Array.from(select.querySelectorAll('option'));
  expect(opts.length).toBeGreaterThan(0);
  expect(opts.every(o => o.value.startsWith('de_'))).toBe(true);
});

const fileInput = (slotLabel: string) => screen.getByLabelText(slotLabel, { selector: 'input[type=file]' }) as HTMLInputElement;

test('uploading a file stores blob + name and shows "Reset to default"', async () => {
  setup();
  expect(screen.queryByRole('button', { name: /Reset to default/ })).toBeNull();
  const file = new File(['abc'], 'horn.mp3', { type: 'audio/mpeg' });
  await userEvent.upload(fileInput('Score sound'), file);
  await waitFor(() => expect(latest.customSounds.score).toEqual({ name: 'horn.mp3', mime: 'audio/mpeg' }));
  expect(saveSoundBlob).toHaveBeenCalledWith('score', file);
  expect(screen.getByText('horn.mp3')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Reset to default.*Score sound|Score sound.*Reset to default/ }));
  expect(latest.customSounds.score).toBeUndefined();
  expect(saveSoundBlob).toHaveBeenLastCalledWith('score', null);
});

test('upload still registers the sound when storage fails, and previews from memory', async () => {
  vi.mocked(saveSoundBlob).mockRejectedValueOnce(new Error('private'));
  const { queue } = setup();
  const file = new File(['abc'], 'horn.mp3', { type: 'audio/mpeg' });
  await userEvent.upload(fileInput('Score sound'), file);
  await waitFor(() => expect(latest.customSounds.score?.name).toBe('horn.mp3'));
  await waitFor(async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Preview Score sound' }));
    expect(queue.play.mock.calls.at(-1)![0][0]).toBe(file);
  });
});

test('non-audio file is rejected with a message', async () => {
  setup();
  await userEvent.upload(fileInput('Score sound'), new File(['x'], 'a.txt', { type: 'text/plain' }), { applyAccept: false });
  expect(await screen.findByRole('alert')).toHaveTextContent('not an audio file');
  expect(latest.customSounds.score).toBeUndefined();
  expect(saveSoundBlob).not.toHaveBeenCalled();
});

test('file > 10 MB is rejected', async () => {
  setup();
  const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.wav', { type: 'audio/wav' });
  await userEvent.upload(fileInput('Lineup intro'), big);
  expect(await screen.findByRole('alert')).toHaveTextContent('too large');
  expect(latest.customSounds.intro).toBeUndefined();
});

test('▶ preview plays the current sound for each slot', async () => {
  const { queue } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Preview Score sound' }));
  await userEvent.click(screen.getByRole('button', { name: 'Preview Lineup intro' }));
  expect(queue.unlock).toHaveBeenCalledTimes(2);
  expect(queue.play).toHaveBeenCalledTimes(2);
  expect(queue.play.mock.calls[0][0][0]).toBeInstanceOf(Blob);
  expect(queue.play.mock.calls[1][0][0]).toBeInstanceOf(Blob);
});

test('Play sounds checkbox toggles soundsEnabled', async () => {
  setup();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Play sounds' }));
  expect(latest.soundsEnabled).toBe(false);
});

test('a file without a type (some Android pickers) is accepted by its audio extension and gets the matching type', async () => {
  setup();
  const file = new File(['abc'], 'Tor Hymne.M4A', { type: '' });
  await userEvent.upload(fileInput('Score sound'), file, { applyAccept: false });
  await waitFor(() => expect(latest.customSounds.score).toEqual({ name: 'Tor Hymne.M4A', mime: 'audio/mp4' }));
  const stored = vi.mocked(saveSoundBlob).mock.calls.at(-1)![1] as Blob;
  expect(stored.type).toBe('audio/mp4');
  expect(stored.size).toBe(3);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a file without a type and without an audio extension is still refused', async () => {
  setup();
  await userEvent.upload(fileInput('Score sound'), new File(['x'], 'notes.pdf', { type: '' }), { applyAccept: false });
  expect(await screen.findByRole('alert')).toHaveTextContent('not an audio file');
  expect(latest.customSounds.score).toBeUndefined();
});
