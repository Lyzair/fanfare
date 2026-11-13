import { render, screen, waitFor, within, act } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import SuggestPanel from '../../src/ui/SuggestPanel';
import { ServicesContext } from '../../src/ui/types';
import type { Services } from '../../src/ui/types';
import type { Suggestions } from '../../src/domain/respell/suggest';
import { SuggestError } from '../../src/domain/respell/suggest';
import { PhonemizeError } from '../../src/tts/phonemize';
import { defaultVoiceFor } from '../../src/tts/voices';

const result: Suggestions = {
  source: ['v'],
  baseline: { text: 'Wojciech', ipa: ['v'], distance: 0.57, level: 1 },
  candidates: [
    { text: 'Wojtschech', ipa: ['v', 'a'], distance: 0.1, level: 3 },
    { text: 'Wojtschäh', ipa: ['v', 'b'], distance: 0.22, level: 2 },
  ],
};

function makeServices() {
  const speech = { get: vi.fn(async () => new Blob(['x'])) };
  const queue = { unlock: vi.fn(), play: vi.fn(async (_jobs: Array<() => Promise<Blob>>) => undefined) };
  return { queue, speech, services: { queue, speech } as unknown as Services };
}

function setup(over: Partial<Parameters<typeof SuggestPanel>[0]> = {}) {
  const m = makeServices();
  const props = {
    lang: 'en' as const, voiceId: defaultVoiceFor('en'), name: 'Wojciech', origSpelling: '', nameLang: '',
    onFields: vi.fn(), onUse: vi.fn(), run: vi.fn(async () => result), ...over,
  };
  render(<ServicesContext.Provider value={m.services}><SuggestPanel {...props} /></ServicesContext.Provider>);
  return { ...m, props };
}
const open = () => userEvent.click(screen.getByRole('button', { name: '✨ Suggest' }));
const find = () => userEvent.click(screen.getByRole('button', { name: 'Find suggestions' }));

test('the ✨ button opens the panel with language and original spelling prefilled', async () => {
  setup();
  expect(screen.queryByLabelText('Original spelling')).toBeNull();
  await open();
  expect(screen.getByRole('button', { name: '✨ Suggest' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByLabelText('Original spelling')).toHaveValue('Wojciech');
  const sel = screen.getByLabelText("Name's language") as HTMLSelectElement;
  expect(sel.value).toBe('en-us'); // default = team language
  expect(within(sel).getByRole('option', { name: /polski/ })).toBeInTheDocument(); // native name
});

test('changing language and spelling is reported, an explicit language shows as selected', async () => {
  const { props } = setup({ nameLang: 'pl', origSpelling: 'Wojciech' });
  await open();
  expect((screen.getByLabelText("Name's language") as HTMLSelectElement).value).toBe('pl');
  await userEvent.selectOptions(screen.getByLabelText("Name's language"), 'tr');
  expect(props.onFields).toHaveBeenCalledWith({ nameLang: 'tr' });
  await userEvent.type(screen.getByLabelText('Original spelling'), 'x');
  expect(props.onFields).toHaveBeenLastCalledWith({ origSpelling: 'Wojciechx' });
});

test('Find suggestions runs with the fields, shows a spinner, then the baseline and candidates with closeness', async () => {
  let release!: (s: Suggestions) => void;
  const run = vi.fn(() => new Promise<Suggestions>((r) => { release = r; }));
  setup({ nameLang: 'pl', run });
  await open();
  await find();
  expect(run).toHaveBeenCalledWith({ name: 'Wojciech', origSpelling: 'Wojciech', nameVoice: 'pl', targetLang: 'en' });
  expect(screen.getByRole('status')).toHaveTextContent('Working…');
  await act(async () => release(result));
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveTextContent('Wojciech');
  expect(items[0]).toHaveTextContent('as written');
  expect(within(items[1]).getByRole('img', { name: 'very close' })).toHaveTextContent('●●●');
  expect(within(items[2]).getByRole('img', { name: 'close' })).toHaveTextContent('●●○');
  expect(within(items[0]).getByRole('img', { name: 'rough' })).toHaveTextContent('●○○');
  expect(within(items[0]).queryByRole('button', { name: /Use this/ })).toBeNull();
});

test('▶ speaks the candidate through speech.get with the current voice, unlocking first', async () => {
  const { queue, speech, props } = setup();
  await open(); await find();
  await userEvent.click(await screen.findByRole('button', { name: 'Hear Wojtschech' }));
  expect(queue.unlock).toHaveBeenCalledTimes(1);
  expect(queue.unlock.mock.invocationCallOrder[0]).toBeLessThan(queue.play.mock.invocationCallOrder[0]);
  await (queue.play.mock.calls.at(-1)![0] as Array<() => Promise<Blob>>)[0]();
  expect(speech.get).toHaveBeenCalledWith(props.voiceId, 'Wojtschech');
});

test('Use this fills sayAs with the candidate', async () => {
  const { props } = setup();
  await open(); await find();
  await userEvent.click(await screen.findByRole('button', { name: 'Use this: Wojtschäh' }));
  expect(props.onUse).toHaveBeenCalledWith('Wojtschäh');
});

test('a voice language without a table shows the message and no controls', async () => {
  setup({ voiceId: defaultVoiceFor('fr') }); // UI in English, the voice speaks French
  await open();
  expect(screen.getByText('Suggestions are not available for this voice language yet.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Find suggestions' })).toBeNull();
});

test('errors are readable and the button can be pressed again', async () => {
  const run = vi.fn().mockRejectedValueOnce(new PhonemizeError('boom')).mockResolvedValueOnce(result);
  setup({ run });
  await open(); await find();
  expect(await screen.findByRole('alert')).toHaveTextContent('Suggestions could not be made');
  await find();
  expect(await screen.findByRole('button', { name: 'Hear Wojtschech' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('nothing better found shows a message; an unreadable name shows an error', async () => {
  const run = vi.fn().mockResolvedValueOnce({ ...result, candidates: [] }).mockRejectedValueOnce(new SuggestError('empty'));
  setup({ run });
  await open(); await find();
  expect(await screen.findByText(/already sounds close|no better/)).toBeInTheDocument();
  await find();
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
});

test('German UI strings', async () => {
  setup({ lang: 'de', voiceId: defaultVoiceFor('de') });
  await userEvent.click(screen.getByRole('button', { name: '✨ Vorschlagen' }));
  expect(screen.getByLabelText('Sprache des Namens')).toBeInTheDocument();
  expect(screen.getByLabelText('Originalschreibweise')).toBeInTheDocument();
});

test('a player normalized from an old saved state works: name shown as original spelling, Find runs', async () => {
  const { reducer, initialState, currentRoster } = await import('../../src/state/reducer');
  const old = { version: 1, sport: 'football', lang: 'en', voiceId: defaultVoiceFor('en'), soundsEnabled: true, customSounds: {},
    rosters: { football: { homeTeam: '', opponent: '', showPositions: false, players: [{ id: 'p', name: 'Wojciech', number: '', position: '', onField: true }], templates: {} } } };
  const p = currentRoster(reducer(initialState('en'), { type: 'replaceAll', state: old as never })).players[0];
  const { props } = setup({ name: p.name, origSpelling: p.origSpelling, nameLang: p.nameLang });
  await open();
  expect(screen.getByLabelText('Original spelling')).toHaveValue('Wojciech');
  await find();
  expect(await screen.findByRole('button', { name: 'Hear Wojtschech' })).toBeInTheDocument();
  expect(props.run).toHaveBeenCalledWith(expect.objectContaining({ origSpelling: 'Wojciech' }));
});
