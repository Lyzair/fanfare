import { render, screen, waitFor, act } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'preact/hooks';
import CalloutPanel from '../../src/ui/CalloutPanel';
import { ServicesContext } from '../../src/ui/types';
import type { Services } from '../../src/ui/types';
import { initialState, reducer } from '../../src/state/reducer';
import type { Action } from '../../src/state/reducer';
import type { QueueItem } from '../../src/audio/queue';

const blobs: Record<string, Blob> = {};
vi.mock('../../src/state/persist', () => ({
  loadSoundBlob: vi.fn(async (slot: string) => blobs[slot] ?? null),
}));

test('replacing the custom intro sound reloads the intro blob', async () => {
  blobs.intro = new Blob(['first']);
  const played: QueueItem[][] = [];
  const queue = { playing: false, onChange: undefined, unlock: vi.fn(), stop: vi.fn(), play: vi.fn(async (i: QueueItem[]) => { played.push(i); }) };
  const speech = { has: () => false, get: vi.fn(async () => new Blob(['x'])), prepare: vi.fn() };
  const services = { queue, speech } as unknown as Services;
  let dispatchOut!: (a: Action) => void;
  function H() {
    const [state, dispatch] = useReducer(reducer, undefined, () =>
      reducer(initialState('en'), { type: 'setCustomSound', slot: 'intro', sound: { name: 'a.mp3', mime: 'audio/mpeg' } }));
    dispatchOut = dispatch;
    return <ServicesContext.Provider value={services}><CalloutPanel state={state} dispatch={dispatch} /></ServicesContext.Provider>;
  }
  render(<H />);
  const announce = () => userEvent.click(screen.getByRole('button', { name: /Announce lineup/ }));
  await waitFor(async () => { await announce(); expect(played.at(-1)![0]).toBe(blobs.intro); });
  const second = new Blob(['second']);
  blobs.intro = second;
  act(() => dispatchOut({ type: 'setCustomSound', slot: 'intro', sound: { name: 'b.mp3', mime: 'audio/mpeg' } }));
  await waitFor(async () => { await announce(); expect(played.at(-1)![0]).toBe(second); });
});
