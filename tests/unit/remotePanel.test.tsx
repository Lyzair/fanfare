import { act, render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'preact/hooks';
import RemotePanel from '../../src/ui/RemotePanel';
import { ServicesContext } from '../../src/ui/types';
import type { Services } from '../../src/ui/types';
import { initialState, reducer } from '../../src/state/reducer';
import type { QueueItem } from '../../src/audio/queue';
import { FakeEventSource, fakeFetch } from './remoteHarness';
import { queueEvents } from './queueEvents';

vi.mock('../../src/state/persist', () => ({ loadSoundBlob: vi.fn(async () => null) }));

const URL_LAN = 'http://192.168.1.23:8080';
const NEEDS_LOCAL = 'Phone remote needs Fanfare running on this laptop. See the manual: "No internet at all?"';
const UNENCRYPTED = 'Connection not encrypted: others on this Wi-Fi could see player names and send commands they intercept. Use --https for encryption (see risks).';

function makeServices() {
  const queue = {
    playing: false, ...queueEvents(),
    unlock: vi.fn(), stop: vi.fn(), play: vi.fn(async (_items: QueueItem[]) => {}),
  };
  const speech = { get: vi.fn(async () => new Blob(['s'])) };
  return { queue, speech, services: { queue, speech } as unknown as Services };
}

function Harness({ services }: { services: Services }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    let s = initialState('en');
    s = reducer(s, { type: 'setMatch', home: 'FC Test', opponent: 'SV Gegner' });
    return reducer(s, { type: 'addPlayers', text: '7 Lea\n9 Tom', onField: true });
  });
  return <ServicesContext.Provider value={services}><RemotePanel state={state} dispatch={dispatch} /></ServicesContext.Provider>;
}

function routes(extra: Record<string, unknown> = {}, health: unknown = { fanfare: 'local', urls: [URL_LAN], secure: false }) {
  return fakeFetch({
    'GET /remote/health': health,
    'POST /remote/session': { speakerToken: 'SPK', code: '123456', expiresIn: 600 },
    'POST /remote/state': { ok: true },
    'DELETE /remote/session': { ok: true },
    'POST /remote/code': { code: '654321', expiresIn: 600 },
    ...extra,
  });
}

beforeEach(() => {
  FakeEventSource.reset();
  vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function activate(services: Services) {
  render(<Harness services={services} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Activate speaker' }));
  await screen.findByText('123456');
}

test('without fanfare-local (probe 404) it only explains how to get it', async () => {
  vi.stubGlobal('fetch', fakeFetch({}).fn);
  const { services } = makeServices();
  render(<Harness services={services} />);
  expect(screen.getByRole('heading', { name: '📱 Use a phone as remote' })).toBeInTheDocument();
  expect(await screen.findByText(NEEDS_LOCAL)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Activate speaker' })).toBeNull();
});

test('a page that answers 200 with something else than the relay health is not fanfare-local', async () => {
  vi.stubGlobal('fetch', fakeFetch({ 'GET /remote/health': { json: '<html>' } }).fn);
  render(<Harness services={makeServices().services} />);
  expect(await screen.findByText(NEEDS_LOCAL)).toBeInTheDocument();
});

test('a network error in the probe is treated as unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
  render(<Harness services={makeServices().services} />);
  expect(await screen.findByText(NEEDS_LOCAL)).toBeInTheDocument();
});

test('fanfare-local without --lan explains that phones cannot reach it', async () => {
  vi.stubGlobal('fetch', routes({}, { fanfare: 'local', urls: [], secure: false }).fn);
  render(<Harness services={makeServices().services} />);
  expect(await screen.findByText(/--lan/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Activate speaker' })).toBeNull();
});

test('Activate speaker unlocks audio inside the click, then shows QR, address and code', async () => {
  const f = routes();
  vi.stubGlobal('fetch', f.fn);
  const { services, queue } = makeServices();
  await activate(services);
  expect(queue.unlock).toHaveBeenCalledTimes(1);
  const session = f.find('POST', '/remote/session')[0];
  expect(session.headers['Content-Type']).toBe('application/json');
  expect(f.calls.every(c => c.url.startsWith('./remote/'))).toBe(true); // own origin only
  expect(screen.getByText(`${URL_LAN}/#remote`)).toBeInTheDocument();
  const qr = screen.getByRole('img', { name: /QR/ });
  expect(qr.querySelector('path')).not.toBeNull();
  expect(screen.getByText('Phones connected: 0')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'End remote' })).toBeInTheDocument();
  expect(FakeEventSource.last.url).toBe('./remote/events?token=SPK');
});

test('the QR carries the scheme, host and port of the run, never loopback', async () => {
  vi.stubGlobal('fetch', routes({}, { fanfare: 'local', urls: ['https://10.0.0.7:8443', 'https://192.168.1.9:8443'], secure: true }).fn);
  await activate(makeServices().services);
  expect(screen.getByText('https://10.0.0.7:8443/#remote')).toBeInTheDocument();
  expect(screen.queryByText(/localhost|127\.0\.0\.1/)).toBeNull();
});

test('no secret is read from the page or sent: the laptop is recognised by the server alone', async () => {
  const meta = document.createElement('meta');
  meta.name = 'fanfare-speaker-secret'; meta.content = 'S3CRET';
  document.head.appendChild(meta);
  const f = routes();
  vi.stubGlobal('fetch', f.fn);
  await activate(makeServices().services);
  expect(JSON.stringify(f.calls)).not.toMatch(/S3CRET|Secret/i);
  meta.remove();
});

test('a pairing lock is shown to the speaker until a new code is requested', async () => {
  const f = routes();
  vi.stubGlobal('fetch', f.fn);
  await activate(makeServices().services);
  act(() => FakeEventSource.last.emit('locked', {}));
  expect(await screen.findByText('Too many wrong codes — press New code.')).toBeInTheDocument();
  expect(screen.queryByText('123456')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'New code' }));
  expect(await screen.findByText('654321')).toBeInTheDocument();
  expect(screen.queryByText('Too many wrong codes — press New code.')).toBeNull();
});

test('plain-http warning is shown on the speaker panel unless the phones use https', async () => {
  vi.stubGlobal('fetch', routes().fn);
  const first = render(<Harness services={makeServices().services} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Activate speaker' }));
  expect(await screen.findByText(UNENCRYPTED)).toBeInTheDocument();
  first.unmount();
  vi.stubGlobal('fetch', routes({}, { fanfare: 'local', urls: ['https://192.168.1.9:8443'], secure: true }).fn);
  render(<Harness services={makeServices().services} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Activate speaker' }));
  await screen.findByText('https://192.168.1.9:8443/#remote');
  expect(screen.queryByText(UNENCRYPTED)).toBeNull();
});

test('the panel pushes the sanitised snapshot to the relay and updates it when playing changes', async () => {
  const f = routes();
  vi.stubGlobal('fetch', f.fn);
  const { services, queue } = makeServices();
  await activate(services);
  await waitFor(() => expect(f.find('POST', '/remote/state').length).toBe(1));
  const first = f.find('POST', '/remote/state')[0];
  expect(first.headers['X-Fanfare-Speaker-Token']).toBe('SPK');
  const body = first.body as { home: { name: string; players: Array<Record<string, string>> }; activated: boolean; playing: boolean };
  expect(body.activated).toBe(true);
  expect(body.home.name).toBe('FC Test');
  expect(body.home.players.map(p => p.name)).toEqual(['Lea', 'Tom']);
  expect(JSON.stringify(body)).not.toMatch(/number|position|"7"/);
  act(() => queue.emit(true));
  await waitFor(() => expect(f.find('POST', '/remote/state').length).toBe(2));
  expect((f.find('POST', '/remote/state')[1].body as { playing: boolean }).playing).toBe(true);
});

test('commands from the remote run through the same handlers (score sequence on the speaker queue)', async () => {
  vi.stubGlobal('fetch', routes().fn);
  const { services, queue, speech } = makeServices();
  await activate(services);
  queue.unlock.mockClear();
  act(() => FakeEventSource.last.emit('command', { cmd: 'score', args: { team: 'home' } }));
  await waitFor(() => expect(queue.play).toHaveBeenCalledTimes(1));
  expect(queue.unlock).toHaveBeenCalled();
  const items = queue.play.mock.calls[0][0];
  expect(items).toHaveLength(2);
  expect(items[0]).toBeInstanceOf(Blob);
  await (items[1] as () => Promise<Blob>)();
  expect(speech.get).toHaveBeenCalled();
  act(() => FakeEventSource.last.emit('command', { cmd: 'stop', args: {} }));
  expect(queue.stop).toHaveBeenCalled();
  // a malformed command is dropped
  act(() => FakeEventSource.last.emit('command', { cmd: 'format-disk', args: {} }));
  expect(queue.play).toHaveBeenCalledTimes(1);
});

test('status follows the remotes event; 1 phone reads as the brief says', async () => {
  vi.stubGlobal('fetch', routes().fn);
  await activate(makeServices().services);
  act(() => FakeEventSource.last.emit('remotes', { count: 1 }));
  expect(screen.getByText('1 phone connected')).toBeInTheDocument();
  act(() => FakeEventSource.last.emit('remotes', { count: 3 }));
  expect(screen.getByText('Phones connected: 3')).toBeInTheDocument();
});

test('a new code arrives after a phone paired; an expired one can be renewed', async () => {
  const f = routes();
  vi.stubGlobal('fetch', f.fn);
  await activate(makeServices().services);
  act(() => FakeEventSource.last.emit('code', { code: '222333', expiresIn: 600 }));
  expect(screen.getByText('222333')).toBeInTheDocument();
  act(() => FakeEventSource.last.emit('code', { code: '444555', expiresIn: 0 }));
  expect(await screen.findByText('This code has expired. Get a new one on the laptop.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'New code' }));
  expect(await screen.findByText('654321')).toBeInTheDocument();
  expect(f.find('POST', '/remote/code')[0].headers['X-Fanfare-Speaker-Token']).toBe('SPK');
});

test('End remote ends the session and removes the QR', async () => {
  const f = routes();
  vi.stubGlobal('fetch', f.fn);
  await activate(makeServices().services);
  await userEvent.click(screen.getByRole('button', { name: 'End remote' }));
  await waitFor(() => expect(f.find('DELETE', '/remote/session')).toHaveLength(1));
  expect(f.find('DELETE', '/remote/session')[0].headers['X-Fanfare-Speaker-Token']).toBe('SPK');
  expect(FakeEventSource.last.closed).toBe(true);
  expect(screen.queryByRole('img', { name: /QR/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Activate speaker' })).toBeInTheDocument();
});

test('a failing session request shows an error and no QR', async () => {
  vi.stubGlobal('fetch', routes({ 'POST /remote/session': { status: 403, json: { error: 'not-the-speaker' } } }).fn);
  render(<Harness services={makeServices().services} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Activate speaker' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Could not start the phone remote/);
  expect(screen.queryByRole('img', { name: /QR/ })).toBeNull();
});

test('when the server ended the session the panel returns to the start', async () => {
  vi.stubGlobal('fetch', routes().fn);
  await activate(makeServices().services);
  act(() => FakeEventSource.last.fail(true));
  expect(await screen.findByRole('button', { name: 'Activate speaker' })).toBeInTheDocument();
});
