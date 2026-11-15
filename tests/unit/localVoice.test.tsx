import { render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'preact/hooks';
import SoundsPanel from '../../src/ui/SoundsPanel';
import { ServicesContext } from '../../src/ui/types';
import type { Services } from '../../src/ui/types';
import { initialState, reducer } from '../../src/state/reducer';
import type { AppState } from '../../src/domain/model';
import * as persist from '../../src/state/persist';
import { queueEvents } from './queueEvents';

vi.mock('../../src/state/persist', () => ({
  loadSoundBlob: vi.fn(async () => null),
  saveSoundBlob: vi.fn(async () => {}),
  saveSpeech: vi.fn(async () => {}),
  saveState: vi.fn(async () => {}),
}));

let latest: AppState;
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
let fetchMock: ReturnType<typeof vi.fn>;
let queue: { unlock: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; playing: boolean };

function setup(init?: (s: AppState) => AppState) {
  queue = { playing: false, ...queueEvents(), unlock: vi.fn(), stop: vi.fn(), play: vi.fn(async () => {}) };
  const services = { queue, speech: { get: vi.fn() } } as unknown as Services;
  function H() {
    const [state, dispatch] = useReducer(reducer, undefined, () => (init ? init(initialState('en')) : initialState('en')));
    latest = state;
    return <ServicesContext.Provider value={services}><SoundsPanel state={state} dispatch={dispatch} /></ServicesContext.Provider>;
  }
  render(<H />);
}

const VOICES = [
  { id: 'en-high', lang: 'en', label: 'English (high quality)' },
  { id: 'de-high', lang: 'de', label: 'German (high quality)' },
  { id: 'en-fast', lang: 'en', label: 'English (fast)' },
];

async function connect() {
  await userEvent.click(screen.getByText('Local voice server (advanced)'));
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
}

// ---- fake microphone ----
class FakeTrack { stopped = false; stop() { this.stopped = true; } }
let tracks: FakeTrack[];
class FakeRecorder {
  state = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['RAWAUDIO'], { type: 'audio/webm' }) }); this.onstop?.(); }
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  tracks = [new FakeTrack()];
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn(async () => ({ getTracks: () => tracks })) }, configurable: true });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

test('the local server section is collapsed, has the default address and the hint', () => {
  setup();
  const summary = screen.getByText('Local voice server (advanced)');
  expect(summary.closest('details')).not.toHaveAttribute('open');
  expect(screen.getByLabelText('Server address')).toHaveValue('http://127.0.0.1:5123');
  expect(screen.getByText(/Generate high-quality voices on your own computer/)).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled(); // nothing is requested until the user clicks Connect
});

test('connect success lists the voices of the current language in an "On this computer" group', async () => {
  fetchMock.mockResolvedValueOnce(json(VOICES));
  setup();
  await connect();
  expect(await screen.findByText('✓ 3 voices found')).toBeInTheDocument();
  expect(latest.localTts).toEqual({ url: 'http://127.0.0.1:5123' });
  const group = screen.getByRole('group', { name: 'On this computer' });
  const options = within(group).getAllByRole('option').map(o => [o.getAttribute('value'), o.textContent]);
  expect(options).toEqual([['local:en-high', 'English (high quality)'], ['local:en-fast', 'English (fast)']]);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('http://127.0.0.1:5123/voices');
  expect((init.headers as Record<string, string>)['X-Fanfare']).toBe('1');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Voice' }), 'local:en-high');
  expect(latest.voiceId).toBe('local:en-high');
});

test('connect failure shows an alert; a non-local address is refused without any request', async () => {
  fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
  setup();
  await connect();
  expect(await screen.findByRole('alert')).toHaveTextContent(/Could not connect: .*boom/);
  expect(latest.localTts).toBeNull();
  fetchMock.mockClear();
  await userEvent.clear(screen.getByLabelText('Server address'));
  await userEvent.type(screen.getByLabelText('Server address'), 'http://192.168.1.5:5123');
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Only addresses on this computer/);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a refused origin shows this page\'s origin and the exact command with a copy button', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  setup();
  await connect();
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(location.origin);
  expect(within(alert).getByText(`fanfare-studio allow ${location.origin}`)).toBeInTheDocument();
  await userEvent.click(within(alert).getByRole('button', { name: 'Copy command' }));
  expect(writeText).toHaveBeenCalledWith(`fanfare-studio allow ${location.origin}`);
  expect(await within(alert).findByText('Copied ✓')).toBeInTheDocument();
});

test('disconnect clears localTts and falls back from a local voice', async () => {
  fetchMock.mockResolvedValueOnce(json(VOICES));
  setup();
  await connect();
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Voice' }), 'local:en-high');
  await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  expect(latest.localTts).toBeNull();
  expect(latest.voiceId.startsWith('local:')).toBe(false);
  expect(screen.queryByRole('button', { name: /Record club voice/ })).toBeNull();
});

test('a saved local voice that is not in the list stays selectable (cached clips still play)', () => {
  setup(s => ({ ...s, voiceId: 'local:en-high', localTts: { url: 'http://127.0.0.1:5123' } }));
  expect(screen.getByRole('combobox', { name: 'Voice' })).toHaveValue('local:en-high');
});

test('Record club voice only appears when connected', async () => {
  setup();
  expect(screen.queryByRole('button', { name: /Record club voice/ })).toBeNull();
  fetchMock.mockResolvedValueOnce(json(VOICES));
  await connect();
  expect(await screen.findByRole('button', { name: /Record club voice/ })).toBeInTheDocument();
});

async function openDialog() {
  setup();
  fetchMock.mockResolvedValueOnce(json(VOICES));
  await connect();
  await userEvent.click(await screen.findByRole('button', { name: /Record club voice/ }));
  return screen.getByRole('dialog');
}

async function record(dialog: HTMLElement) {
  await userEvent.click(within(dialog).getByRole('button', { name: 'Record' }));
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Stop recording' }));
}

test('dialog: no microphone access before Record; Save needs a recording and the consent tick', async () => {
  const dialog = await openDialog();
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  expect(within(dialog).getByText(/Hello everyone and welcome!/)).toBeInTheDocument();
  expect(within(dialog).getByText(/I am the speaker, or the speaker agreed that this voice may be used for our club's announcements\./)).toBeInTheDocument();
  const save = within(dialog).getByRole('button', { name: 'Save voice' });
  expect(save).toBeDisabled();
  await record(dialog);
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
  expect(tracks.every(t => t.stopped)).toBe(true);
  expect(save).toBeDisabled(); // still no consent
  await userEvent.click(within(dialog).getByRole('checkbox'));
  expect(save).toBeEnabled();
  await userEvent.click(within(dialog).getByRole('checkbox'));
  expect(save).toBeDisabled();
});

test('dialog: save uploads only to the local URL with consent=true, then drops the recording and selects the voice', async () => {
  const dialog = await openDialog();
  await record(dialog);
  await userEvent.click(within(dialog).getByRole('checkbox'));
  const name = within(dialog).getByLabelText('Name of this voice');
  await userEvent.clear(name);
  await userEvent.type(name, 'Max');
  fetchMock.mockClear();
  fetchMock.mockResolvedValueOnce(json({ id: 'club-1a2b', lang: 'en', label: 'Max', warnings: ['very quiet'] }, { status: 201 }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save voice' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('http://127.0.0.1:5123/references');
  const form = init.body as FormData;
  expect(form.get('consent')).toBe('true');
  expect(form.get('name')).toBe('Max');
  expect(form.get('lang')).toBe('en');
  expect((form.get('audio') as File).size).toBeGreaterThan(0);

  expect(latest.voiceId).toBe('local:club-1a2b');
  expect(await screen.findByText(/Club voice saved: Max/)).toBeInTheDocument();
  expect(screen.getByText(/very quiet/)).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Max' })).toHaveValue('local:club-1a2b');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake'); // playback copy released
  // the raw recording is never persisted anywhere
  expect(persist.saveSpeech).not.toHaveBeenCalled();
  expect(persist.saveSoundBlob).not.toHaveBeenCalled();
  expect(JSON.stringify(latest)).not.toContain('RAWAUDIO');
});

test('dialog: microphone denied, no microphone and a rejected upload give readable alerts', async () => {
  const dialog = await openDialog();
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new DOMException('x', 'NotAllowedError'));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Record' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Microphone access was blocked/);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new DOMException('x', 'NotFoundError'));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Record' }));
  expect(await within(dialog).findByText(/No microphone found/)).toBeInTheDocument();

  await record(dialog);
  await userEvent.click(within(dialog).getByRole('checkbox'));
  fetchMock.mockResolvedValueOnce(new Response('recording too short', { status: 400, headers: { 'content-type': 'text/plain' } }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save voice' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/did not accept the recording: .*recording too short/);
  expect(screen.getByRole('dialog')).toBeInTheDocument(); // stays open so the user can retry
});

test('dialog: Cancel closes it, releases the playback copy and keeps the microphone off', async () => {
  const dialog = await openDialog();
  await record(dialog);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
});

test('club voices can be deleted after confirming', async () => {
  fetchMock.mockResolvedValueOnce(json([...VOICES, { id: 'club-9', lang: 'en', label: 'Max' }]));
  setup(s => ({ ...s, voiceId: 'local:club-9' }));
  await connect();
  const confirm = vi.spyOn(window, 'confirm');
  confirm.mockReturnValueOnce(false);
  const del = await screen.findByRole('button', { name: /Delete club voice.*Max/ });
  await userEvent.click(del);
  expect(fetchMock).toHaveBeenCalledTimes(1); // only the voices request
  confirm.mockReturnValueOnce(true);
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await userEvent.click(del);
  await waitFor(() => expect(screen.queryByRole('button', { name: /Delete club voice/ })).toBeNull());
  const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
  expect(url).toBe('http://127.0.0.1:5123/references/club-9');
  expect(init.method).toBe('DELETE');
  expect((init.headers as Record<string, string>)['X-Fanfare']).toBe('1');
  expect(latest.voiceId.startsWith('local:club-')).toBe(false); // the deleted voice is no longer selected
  confirm.mockRestore();
});

test('dialog: double-clicking Record asks for the microphone once', async () => {
  const dialog = await openDialog();
  let release!: () => void;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementationOnce(
    () => new Promise(res => { release = () => res({ getTracks: () => tracks } as unknown as MediaStream); }),
  );
  const button = within(dialog).getByRole('button', { name: 'Record' });
  await userEvent.dblClick(button);
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  release();
  expect(await within(dialog).findByRole('button', { name: 'Stop recording' })).toBeInTheDocument();
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
});

test('dialog: recording again releases the previous playback URL', async () => {
  const dialog = await openDialog();
  vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
  await record(dialog);
  await record(dialog);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second');
});

test('dialog: only server-supported languages are offered; an unsupported page language defaults to English', async () => {
  setup(s => ({ ...s, lang: 'uk' }));
  fetchMock.mockResolvedValueOnce(json([]));
  await userEvent.click(screen.getByText(/Локальний сервер голосів/));
  await userEvent.click(screen.getAllByRole('button').find(b => b.textContent === 'Підключити')!);
  await userEvent.click(await screen.findByRole('button', { name: /Записати голос клубу/ }));
  const select = within(screen.getByRole('dialog')).getByRole('combobox') as HTMLSelectElement;
  expect(select.value).toBe('en');
  expect(Array.from(select.options).map(o => o.value).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'tr']);
});
