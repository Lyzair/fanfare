import { render, screen, within, waitFor, act } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'preact/hooks';
import CalloutPanel, { lineupSequence } from '../../src/ui/CalloutPanel';
import { ServicesContext } from '../../src/ui/types';
import type { Services } from '../../src/ui/types';
import type { Action } from '../../src/state/reducer';
import { initialState, reducer, currentRoster } from '../../src/state/reducer';
import { TtsUnavailableError } from '../../src/tts/engine';
import type { AppState } from '../../src/domain/model';
import type { QueueItem } from '../../src/audio/queue';

let latest: AppState;
let latestDispatch: (a: Action) => void;
const calls: string[] = [];
const blobFor = (text: string) => new Blob([text]);

function makeServices(opts: { fail?: boolean } = {}) {
  const ready = new Set<string>();
  const speech = {
    has: (v: string, t: string) => ready.has(`${v}|${t.trim()}`),
    get: vi.fn(async (v: string, t: string) => {
      if (opts.fail) throw new TtsUnavailableError('nope');
      ready.add(`${v}|${t.trim()}`);
      return blobFor(t);
    }),
    prepare: vi.fn(async (v: string, texts: string[], onProgress: (d: number, t: number) => void) => {
      const u = [...new Set(texts)];
      for (let i = 0; i < u.length; i++) { ready.add(`${v}|${u[i].trim()}`); onProgress(i + 1, u.length); }
    }),
  };
  const queue = {
    playing: false,
    onChange: undefined as ((p: boolean) => void) | undefined,
    unlock: vi.fn(() => { calls.push('unlock'); }),
    stop: vi.fn(),
    play: vi.fn(async (items: QueueItem[]) => {
      calls.push('play');
      queue.playing = true; queue.onChange?.(true);
      for (const it of items) { if (typeof it === 'function') { try { await it(); } catch { /* skipped */ } } }
    }),
  };
  return { queue, speech, services: { queue, speech } as unknown as Services };
}

function Harness({ services, init }: { services: Services; init?: (s: AppState) => AppState }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => (init ? init(initialState('en')) : initialState('en')));
  latest = state;
  latestDispatch = dispatch;
  return <ServicesContext.Provider value={services}><CalloutPanel state={state} dispatch={dispatch} /></ServicesContext.Provider>;
}
const setup = (s: AppState) => {
  let st = reducer(s, { type: 'setMatch', home: 'FC Test', opponent: 'SV Gegner' });
  st = reducer(st, { type: 'addPlayers', text: '7 Lea\n9 Tom', onField: true });
  return reducer(st, { type: 'addPlayers', text: '12 Ann', onField: false });
};

beforeEach(() => { calls.length = 0; });

test('each player shows an editable text prefilled from the template', () => {
  const { services } = makeServices();
  render(<Harness services={services} init={setup} />);
  const box = screen.getByLabelText('Announcement text for Lea') as HTMLTextAreaElement;
  expect(box.value).toContain('Lea');
  expect(box.value).toContain('number 7');
  expect(screen.getByLabelText('Announcement text for Ann')).toBeInTheDocument();
});

test('editing a text stores customText; "↺" resets it to null', async () => {
  const { services } = makeServices();
  render(<Harness services={services} init={setup} />);
  const box = screen.getByLabelText('Announcement text for Lea');
  await userEvent.clear(box);
  await userEvent.type(box, 'Hi Lea');
  expect(currentRoster(latest).players[0].customText).toBe('Hi Lea');
  await userEvent.click(screen.getByRole('button', { name: 'Reset to the standard text' }));
  expect(currentRoster(latest).players[0].customText).toBeNull();
  expect((screen.getByLabelText('Announcement text for Lea') as HTMLTextAreaElement).value).toContain('number 7');
});

test('▶ on a row calls queue.unlock() synchronously, then plays that clip', async () => {
  const { services, queue, speech } = makeServices();
  render(<Harness services={services} init={setup} />);
  await userEvent.click(screen.getByRole('button', { name: 'Play Lea' }));
  expect(calls).toEqual(['unlock', 'play']);
  const items = queue.play.mock.calls[0][0] as QueueItem[];
  expect(items).toHaveLength(1);
  await (items[0] as () => Promise<Blob>)();
  expect(speech.get).toHaveBeenCalledWith(latest.voiceId, expect.stringContaining('Lea'));
});

test('lineupSequence: intro sound, intro text, field then bench', async () => {
  const { speech } = makeServices();
  const st = setup(initialState('en'));
  const sound = blobFor('SOUND');
  const seq = lineupSequence(st, speech as never, sound);
  expect(seq).toHaveLength(5);
  expect(seq[0]).toBe(sound);
  const texts: string[] = [];
  for (const it of seq.slice(1)) await (it as () => Promise<Blob>)();
  speech.get.mock.calls.forEach(c => texts.push(c[1]));
  expect(texts[0]).toContain('FC Test');
  expect(texts[1]).toContain('Lea');
  expect(texts[2]).toContain('Tom');
  expect(texts[3]).toContain('Ann');
  expect(lineupSequence({ ...st, soundsEnabled: false }, speech as never, sound)).toHaveLength(4);
  expect(lineupSequence(st, speech as never, null)[0]).toBeInstanceOf(Blob);
});

test('"Announce lineup" unlocks then plays the sequence', async () => {
  const { services, queue } = makeServices();
  render(<Harness services={services} init={setup} />);
  await userEvent.click(screen.getByRole('button', { name: /Announce lineup/ }));
  expect(calls).toEqual(['unlock', 'play']);
  expect(queue.play.mock.calls[0][0]).toHaveLength(5);
});

test('"Prepare voices" shows progress "3 / 4" and a ready badge per row', async () => {
  const { services, speech } = makeServices();
  let release!: () => void;
  speech.prepare.mockImplementationOnce(async (v, texts, onProgress) => {
    texts.forEach(x => speech.get(v, x));
    onProgress(3, 4);
    await new Promise<void>(r => { release = r; });
  });
  render(<Harness services={services} init={setup} />);
  expect(screen.queryByText('Ready')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: /Prepare voices/ }));
  expect(await screen.findByText('3 / 4')).toBeInTheDocument();
  release();
  await waitFor(() => expect(screen.getAllByText('Ready').length).toBeGreaterThanOrEqual(3));
});

test('TTS failure shows a readable error and leaves the page usable', async () => {
  const { services } = makeServices({ fail: true });
  render(<Harness services={services} init={setup} />);
  await userEvent.click(screen.getByRole('button', { name: 'Play Lea' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('The voice could not be loaded. Check your connection and try again — sounds still work.');
  expect(screen.getByRole('button', { name: 'Play Lea' })).toBeEnabled();
});

test('templates editor is collapsed in <details> and editing it updates untouched rows', async () => {
  const { services } = makeServices();
  render(<Harness services={services} init={setup} />);
  const summary = screen.getByText('Change the standard texts (rarely needed)');
  const details = summary.closest('details')!;
  expect(details.open).toBe(false);
  await userEvent.click(summary);
  const field = within(details).getByLabelText('Field players') as HTMLTextAreaElement;
  await userEvent.clear(field);
  await userEvent.type(field, 'Go {{name}!');
  expect(currentRoster(latest).templates.field).toBe('Go {name}!');
  expect((screen.getByLabelText('Announcement text for Lea') as HTMLTextAreaElement).value).toBe('Go Lea!');
  expect(within(details).getByText(/Text in \[brackets\] is skipped/)).toBeInTheDocument();
});

test('placeholder chips insert at the caret of the focused template textarea', async () => {
  const { services } = makeServices();
  render(<Harness services={services} init={setup} />);
  await userEvent.click(screen.getByText('Change the standard texts (rarely needed)'));
  const bench = screen.getByLabelText('Bench players') as HTMLTextAreaElement;
  await userEvent.clear(bench);
  await userEvent.type(bench, 'ab');
  bench.setSelectionRange(1, 1);
  await userEvent.click(screen.getByRole('button', { name: 'Insert {number}' }));
  expect(currentRoster(latest).templates.bench).toBe('a{number}b');
});

test('Stop button visible only while playing', async () => {
  const { services, queue } = makeServices();
  render(<Harness services={services} init={setup} />);
  expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Play Lea' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(queue.stop).toHaveBeenCalled();
});

test('Prepare voices: second click while preparing does not start another prepare; done message on success', async () => {
  const { services, speech } = makeServices();
  let release!: () => void;
  speech.prepare.mockImplementationOnce(async (_v, _t, onProgress) => {
    await new Promise<void>(r => { release = r; });
    onProgress(4, 4);
  });
  render(<Harness services={services} init={setup} />);
  const btn = screen.getByRole('button', { name: /Prepare voices/ });
  await userEvent.click(btn);
  expect(btn).toBeDisabled();
  await userEvent.click(btn);
  expect(speech.prepare).toHaveBeenCalledTimes(1);
  release();
  expect(await screen.findByText('All voices ready ✓')).toBeInTheDocument();
  expect(btn).toBeEnabled();
  expect(screen.queryByText(/^\d+ \/ \d+$/)).toBeNull();
});

test('Prepare voices failure clears progress, re-enables the button and shows the alert', async () => {
  const { services, speech } = makeServices();
  speech.prepare.mockImplementationOnce(async (_v, _t, onProgress) => {
    onProgress(1, 4);
    throw new TtsUnavailableError('nope');
  });
  render(<Harness services={services} init={setup} />);
  await userEvent.click(screen.getByRole('button', { name: /Prepare voices/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The voice could not be loaded');
  expect(screen.queryByText(/^\d+ \/ \d+$/)).toBeNull();
  expect(screen.queryByText('All voices ready ✓')).toBeNull();
  expect(screen.getByRole('button', { name: /Prepare voices/ })).toBeEnabled();
});

const withHint = (s: AppState) => {
  const st = setup(s);
  const lea = currentRoster(st).players.find(p => p.name === 'Lea')!;
  return reducer(st, { type: 'updatePlayer', id: lea.id, patch: { sayAs: 'Lee-ah' } });
};

test('speech gets the hint while the textarea keeps the real name', async () => {
  const { services, queue, speech } = makeServices();
  render(<Harness services={services} init={withHint} />);
  expect((screen.getByLabelText('Announcement text for Lea') as HTMLTextAreaElement).value).toContain('Lea');
  expect((screen.getByLabelText('Announcement text for Lea') as HTMLTextAreaElement).value).not.toContain('Lee-ah');
  await userEvent.click(screen.getByRole('button', { name: 'Play Lea' }));
  await (queue.play.mock.calls[0][0] as QueueItem[])[0]!.valueOf();
  const got = speech.get.mock.calls.at(-1)![1];
  expect(got).toContain('Lee-ah');
  expect(got).not.toContain('Lea ');
});

test('lineupSequence and Prepare use the speech text', async () => {
  const { services, speech } = makeServices();
  const seq = lineupSequence(withHint(initialState('en')), speech as never, null);
  for (const it of seq.slice(1)) await (it as () => Promise<Blob>)();
  expect(speech.get.mock.calls.map(c => c[1]).some(t => t.includes('Lee-ah'))).toBe(true);
  expect(speech.get.mock.calls.map(c => c[1]).some(t => /\bLea\b/.test(t))).toBe(false);
  render(<Harness services={services} init={withHint} />);
  await userEvent.click(screen.getByRole('button', { name: /Prepare/ }));
  const texts = speech.prepare.mock.calls[0][1] as string[];
  expect(texts.some(t => t.includes('Lee-ah'))).toBe(true);
  expect(texts.some(t => /\bLea\b/.test(t))).toBe(false);
});

test('changing a hint changes the cache key: the Ready badge disappears for that row', async () => {
  const { services } = makeServices();
  render(<Harness services={services} init={withHint} />);
  await userEvent.click(screen.getByRole('button', { name: /Prepare/ }));
  const row = () => screen.getByLabelText('Announcement text for Lea').closest('li')!;
  await waitFor(() => expect(within(row()).getByText('Ready')).toBeInTheDocument());
  const lea = currentRoster(latest).players.find(p => p.name === 'Lea')!;
  act(() => latestDispatch({ type: 'updatePlayer', id: lea.id, patch: { sayAs: 'Lay-ah' } }));
  expect(within(row()).queryByText('Ready')).toBeNull();
});
