import { act, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import RemoteApp from '../../src/ui/RemoteApp';
import { FakeEventSource, fakeFetch } from './remoteHarness';

const UNENCRYPTED = 'Connection not encrypted: others on this Wi-Fi could see player names and send commands they intercept. Use --https for encryption (see risks).';
const SNAP = {
  sport: 'football', scoreWord: 'Goal', hasGuests: true, playing: false, activated: true,
  home: { name: 'FC Example', players: [{ id: 'p1', name: 'Lea' }, { id: 'p2', name: 'Tom' }] },
  guest: { name: 'SV Sample', players: [{ id: 'g1', name: 'Pat' }] },
};

function setLanguages(langs: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(langs);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(langs[0]);
}

function stub(extra: Record<string, unknown> = {}) {
  const f = fakeFetch({
    'POST /remote/pair': { token: 'REMOTE-TOKEN' },
    'POST /remote/command': { ok: true },
    ...extra,
  });
  vi.stubGlobal('fetch', f.fn);
  return f;
}

async function pairUp(code = '123456') {
  await userEvent.type(screen.getByLabelText('Enter the 6-digit code from the laptop'), code);
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
}

async function live(snap: unknown = SNAP, online = true) {
  await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
  act(() => { FakeEventSource.last.open(); FakeEventSource.last.emit('state', { state: snap, online }); });
}

beforeEach(() => {
  FakeEventSource.reset();
  vi.stubGlobal('EventSource', FakeEventSource);
  setLanguages(['en']);
  try { sessionStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('starts with code entry and never plays audio itself', () => {
  stub();
  const audio = vi.fn();
  vi.stubGlobal('Audio', audio);
  render(<RemoteApp />);
  expect(screen.getByLabelText('Enter the 6-digit code from the laptop')).toHaveAttribute('inputmode', 'numeric');
  expect(audio).not.toHaveBeenCalled();
});

test('shows the unencrypted warning on plain http', () => {
  stub();
  render(<RemoteApp />);
  expect(screen.getByText(UNENCRYPTED)).toBeInTheDocument(); // jsdom runs on http://
});

test('pairing posts the code, opens the stream with the token, then shows the soundboard', async () => {
  const f = stub();
  render(<RemoteApp />);
  await pairUp();
  expect(f.find('POST', '/remote/pair')[0].body).toEqual({ code: '123456' });
  expect(f.find('POST', '/remote/pair')[0].headers['Content-Type']).toBe('application/json');
  await live();
  expect(FakeEventSource.last.url).toBe('./remote/events?token=REMOTE-TOKEN');
  expect(await screen.findByRole('button', { name: '⚽ Goal!' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Enter the 6-digit code from the laptop')).toBeNull();
  expect(f.calls.every(c => c.url.startsWith('./remote/'))).toBe(true);
});

test.each([
  [403, { error: 'wrong-code', attemptsLeft: 3 }, 'Wrong code. Try again.'],
  [423, { error: 'locked' }, 'Too many wrong tries. End the remote on the laptop and start it again.'],
  [410, { error: 'expired' }, 'This code has expired. Get a new one on the laptop.'],
  [429, { error: 'full' }, 'Three phones are already connected.'],
  [400, { error: 'bad-code' }, 'Wrong code. Try again.'],
])('pair error %i is explained', async (status, json, text) => {
  stub({ 'POST /remote/pair': { status, json } });
  render(<RemoteApp />);
  await pairUp();
  expect(await screen.findByRole('alert')).toHaveTextContent(text);
  expect(FakeEventSource.instances).toHaveLength(0);
});

test('an unreachable laptop is explained', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net'); }));
  render(<RemoteApp />);
  await pairUp();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the laptop. Are you on the same Wi-Fi?');
});

test('the connect button needs six digits', async () => {
  stub();
  render(<RemoteApp />);
  expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Enter the 6-digit code from the laptop'), '12ab3');
  expect(screen.getByLabelText('Enter the 6-digit code from the laptop')).toHaveValue('123');
});

test('soundboard sends the allowlisted commands with the remote token', async () => {
  const f = stub();
  render(<RemoteApp />);
  await pairUp();
  await live();
  const sent = () => f.find('POST', '/remote/command').map(c => c.body);
  await userEvent.click(await screen.findByRole('button', { name: '⚽ Goal!' }));
  await userEvent.click(screen.getByRole('button', { name: 'Lea' }));
  expect(screen.getByRole('button', { name: 'Lea' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: '⚽ Goal!' }));
  await userEvent.click(screen.getByRole('button', { name: /Goal for SV Sample/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Pat' }));
  await userEvent.click(screen.getByRole('button', { name: /Goal for SV Sample/ }));
  await userEvent.click(screen.getByRole('button', { name: /Announce lineup/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Guests only' }));
  await userEvent.click(screen.getByRole('button', { name: 'Home only' }));
  await userEvent.click(screen.getByRole('button', { name: 'Lineup intro' }));
  await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(sent()).toEqual([
    { cmd: 'score', args: { team: 'home' } },
    { cmd: 'score', args: { team: 'home', player: 'p1' } },
    { cmd: 'score', args: { team: 'guest' } },
    { cmd: 'score', args: { team: 'guest', player: 'g1' } },
    { cmd: 'announce', args: { part: 'all' } },
    { cmd: 'announce', args: { part: 'guests' } },
    { cmd: 'announce', args: { part: 'home' } },
    { cmd: 'sound', args: { slot: 'intro' } },
    { cmd: 'stop', args: {} },
  ]);
  expect(f.find('POST', '/remote/command').every(c => c.headers['X-Fanfare-Remote'] === 'REMOTE-TOKEN')).toBe(true);
  expect(f.find('POST', '/remote/command')[0].headers['Content-Type']).toBe('application/json');
});

test('guest buttons are hidden when there are no guests', async () => {
  stub();
  render(<RemoteApp />);
  await pairUp();
  await live({ ...SNAP, hasGuests: false, guest: { name: '', players: [] } });
  await screen.findByRole('button', { name: '⚽ Goal!' });
  expect(screen.queryByRole('button', { name: /Goal for/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Guests only' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Home only' })).toBeNull();
  expect(screen.getByRole('button', { name: /Announce lineup/ })).toBeInTheDocument();
});

test('shows Playing…, speaker-not-activated and laptop-offline from the state', async () => {
  stub();
  render(<RemoteApp />);
  await pairUp();
  await live();
  await screen.findByRole('button', { name: '⚽ Goal!' });
  expect(screen.queryByText('Playing…')).toBeNull();
  act(() => FakeEventSource.last.emit('state', { state: { ...SNAP, playing: true }, online: true }));
  expect(screen.getByText('Playing…')).toBeInTheDocument();
  act(() => FakeEventSource.last.emit('state', { state: { ...SNAP, activated: false }, online: true }));
  expect(screen.getByText('Speaker not activated yet')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '⚽ Goal!' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  act(() => FakeEventSource.last.emit('state', { state: SNAP, online: false }));
  expect(screen.getByText('Laptop not connected')).toBeInTheDocument();
});

test('reconnects automatically after a dropped connection', async () => {
  stub();
  render(<RemoteApp />);
  await pairUp();
  await live();
  act(() => FakeEventSource.last.fail(false));
  expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
  expect(FakeEventSource.last.closed).toBe(false); // the browser retries on its own
  act(() => FakeEventSource.last.open());
  expect(screen.queryByText('Reconnecting…')).toBeNull();
});

test('when the laptop ends the remote, the phone says so and asks for a code again', async () => {
  stub();
  render(<RemoteApp />);
  await pairUp();
  await live();
  act(() => FakeEventSource.last.emit('ended', {}));
  expect(await screen.findByText('The remote was ended on the laptop.')).toBeInTheDocument();
  expect(FakeEventSource.last.closed).toBe(true);
  expect(screen.queryByRole('button', { name: '⚽ Goal!' })).toBeNull();
  expect(screen.getByLabelText('Enter the 6-digit code from the laptop')).toBeInTheDocument();
});

test('a rejected token (401) ends the session on the phone', async () => {
  stub({ 'POST /remote/command': { status: 401, json: { error: 'unauthorized' } } });
  render(<RemoteApp />);
  await pairUp();
  await live();
  await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));
  expect(await screen.findByText('The remote was ended on the laptop.')).toBeInTheDocument();
});

test('a stream refused by the server (closed with an error) means ended', async () => {
  stub();
  render(<RemoteApp />);
  await pairUp();
  await live();
  act(() => FakeEventSource.last.fail(true));
  expect(await screen.findByText('The remote was ended on the laptop.')).toBeInTheDocument();
});

test('the pairing survives a reload of the phone page', async () => {
  stub();
  const first = render(<RemoteApp />);
  await pairUp();
  await live();
  first.unmount();
  FakeEventSource.reset();
  render(<RemoteApp />);
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
  expect(FakeEventSource.last.url).toBe('./remote/events?token=REMOTE-TOKEN');
  expect(screen.queryByLabelText('Enter the 6-digit code from the laptop')).toBeNull();
});

test('uses the phone language, right-to-left for Arabic', async () => {
  setLanguages(['de-DE']);
  stub();
  const de = render(<RemoteApp />);
  expect(screen.getByLabelText('Gib den 6-stelligen Code vom Laptop ein')).toBeInTheDocument();
  expect(document.documentElement.lang).toBe('de');
  de.unmount();
  setLanguages(['ar']);
  render(<RemoteApp />);
  expect(document.documentElement.dir).toBe('rtl');
  expect(screen.getByRole('button', { name: 'ربط' }).textContent).toBeTruthy();
});

test('soundboard buttons are at least 64 px tall in the stylesheet', () => {
  const css = readFileSync('src/ui/styles.css', 'utf8');
  const rule = css.match(/\.remote-app button[^{]*\{[^}]*\}/g)?.join('\n') ?? '';
  const heights = [...rule.matchAll(/min-height:\s*(\d+)px/g)].map(m => Number(m[1]));
  expect(heights.length).toBeGreaterThan(0);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(64);
  expect(css).toMatch(/\.remote-app \.chip[^{]*\{[^}]*min-height:\s*6[4-9]px/);
});

test('scorer chips list the field players of each team', async () => {
  stub();
  render(<RemoteApp />);
  await pairUp();
  await live();
  const home = await screen.findByRole('group', { name: 'Who scored? (optional)' });
  expect(within(home).getAllByRole('button').map(b => b.textContent)).toEqual(['Lea', 'Tom', 'Our team']);
  const guest = screen.getByRole('group', { name: 'Who scored for the guests? (optional)' });
  expect(within(guest).getAllByRole('button').map(b => b.textContent)).toEqual(['Pat', 'SV Sample']);
});
