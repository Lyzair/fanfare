import { render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'preact/hooks';
import GamePanel from '../../src/ui/GamePanel';
import { ServicesContext } from '../../src/ui/types';
import type { Services } from '../../src/ui/types';
import { initialState, reducer } from '../../src/state/reducer';
import type { AppState } from '../../src/domain/model';
import type { QueueItem } from '../../src/audio/queue';

vi.mock('../../src/state/persist', () => ({ loadSoundBlob: vi.fn(async () => null) }));

const speechBlob = new Blob(['speech']);
function makeServices(fail = false) {
  const speech = { get: vi.fn(async (_v: string, _t: string) => { if (fail) throw new Error('nope'); return speechBlob; }) };
  const queue = {
    playing: false, onChange: undefined as ((p: boolean) => void) | undefined,
    unlock: vi.fn(), stop: vi.fn(),
    play: vi.fn(async (items: QueueItem[]) => {
      for (const it of items) if (typeof it === 'function') { try { await it(); } catch { /* skipped */ } }
    }),
  };
  return { queue, speech, services: { queue, speech } as unknown as Services };
}
function Harness({ services, init }: { services: Services; init?: (s: AppState) => AppState }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    let s = initialState('en');
    s = reducer(s, { type: 'setMatch', home: 'FC Test', opponent: 'SV Gegner' });
    s = reducer(s, { type: 'addPlayers', text: '7 Lea\n9 Tom', onField: true });
    s = reducer(s, { type: 'addPlayers', text: '12 Ann', onField: false });
    return init ? init(s) : s;
  });
  return <ServicesContext.Provider value={services}><GamePanel state={state} dispatch={dispatch} /></ServicesContext.Provider>;
}

test('score button label uses sport score word', () => {
  const { services } = makeServices();
  render(<Harness services={services} init={s => reducer(s, { type: 'setSport', sport: 'basketball' })} />);
  expect(screen.getByRole('button', { name: '🏀 Basket!' })).toBeInTheDocument();
});

test('score with no scorer plays sound then generic text', async () => {
  const { services, queue, speech } = makeServices();
  render(<Harness services={services} />);
  await userEvent.click(screen.getByRole('button', { name: /Goal!/ }));
  expect(queue.unlock).toHaveBeenCalled();
  expect(queue.unlock.mock.invocationCallOrder[0]).toBeLessThan(queue.play.mock.invocationCallOrder[0]);
  const items = queue.play.mock.calls[0][0];
  expect(items).toHaveLength(2);
  expect(items[0]).toBeInstanceOf(Blob);
  expect(typeof items[1]).toBe('function');
  await waitFor(() => expect(speech.get).toHaveBeenCalled());
  expect(speech.get.mock.calls[0][1]).not.toContain('Lea');
  expect(speech.get.mock.calls[0][1].length).toBeGreaterThan(0);
});

test('choosing a scorer from the quick-pick includes their name', async () => {
  const { services, queue, speech } = makeServices();
  render(<Harness services={services} />);
  const chip = screen.getByRole('button', { name: /Lea/ });
  expect(chip).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(chip);
  expect(screen.getByRole('button', { name: /Lea/ })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: /Goal!/ }));
  await waitFor(() => expect(speech.get).toHaveBeenCalled());
  expect(speech.get.mock.calls[0][1]).toContain('Lea');
  expect(queue.play).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: /Lea/ }));
  expect(screen.getByRole('button', { name: /Lea/ })).toHaveAttribute('aria-pressed', 'false');
});

test('bench players are not offered as scorers', () => {
  const { services } = makeServices();
  render(<Harness services={services} />);
  expect(screen.queryByRole('button', { name: /Ann/ })).toBeNull();
});

test('sounds disabled → only the spoken text plays', async () => {
  const { services, queue } = makeServices();
  render(<Harness services={services} init={s => reducer(s, { type: 'setSoundsEnabled', on: false })} />);
  await userEvent.click(screen.getByRole('button', { name: /Goal!/ }));
  const items = queue.play.mock.calls[0][0];
  expect(items).toHaveLength(1);
  expect(typeof items[0]).toBe('function');
});

test('score still plays its sound when TTS fails', async () => {
  const { services, queue } = makeServices(true);
  render(<Harness services={services} />);
  await userEvent.click(screen.getByRole('button', { name: /Goal!/ }));
  const items = queue.play.mock.calls[0][0];
  expect(items[0]).toBeInstanceOf(Blob);
  expect(await screen.findByRole('alert')).toHaveTextContent(/sounds still work/);
});
