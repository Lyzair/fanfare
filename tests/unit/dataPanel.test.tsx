import { render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'preact/hooks';
import DataPanel from '../../src/ui/DataPanel';
import { ServicesContext } from '../../src/ui/types';
import type { Services } from '../../src/ui/types';
import { initialState, reducer } from '../../src/state/reducer';
import type { AppState, Lang } from '../../src/domain/model';
import { exportArchive, importArchive, ImportError } from '../../src/io/archive';
import type { ImportErrorCode } from '../../src/io/archive';
import { LANGS, t } from '../../src/i18n';
import type { UiStrings } from '../../src/i18n';
import { clearAll, saveSoundBlob } from '../../src/state/persist';
import { recalledSound, rememberSound } from '../../src/ui/soundMemory';
import { SpeechCache } from '../../src/tts/speechCache';

vi.mock('../../src/state/persist', () => ({
  loadSoundBlob: vi.fn(async () => null),
  saveSoundBlob: vi.fn(async () => {}),
  saveSpeech: vi.fn(async () => {}),
  loadSpeech: vi.fn(async () => null),
  clearAll: vi.fn(async () => {}),
}));

let latest: AppState;
let speech: SpeechCache;
function setup(lang: Lang = 'en', init?: (s: AppState) => AppState) {
  speech = new SpeechCache({ synthesize: async () => new Blob(['x']) } as never, { save: async () => {}, load: async () => null });
  const services = { queue: {}, speech } as unknown as Services;
  function H() {
    const [state, dispatch] = useReducer(reducer, undefined, () => (init ? init(initialState(lang)) : initialState(lang)));
    latest = state;
    return <ServicesContext.Provider value={services}><DataPanel state={state} dispatch={dispatch} /></ServicesContext.Provider>;
  }
  render(<H />);
}
const withPlayer = (s: AppState): AppState => reducer(s, { type: 'addPlayers', text: 'Lea', onField: true });
const names = () => latest.rosters[latest.sport]!.players.map(p => p.name);
const fileInput = () => document.querySelector('input[type=file]') as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  rememberSound('score', null); rememberSound('intro', null);
  vi.restoreAllMocks();
});

test('export downloads fanfare-YYYY-MM-DD.zip', async () => {
  setup('en', withPlayer);
  const create = vi.fn(() => 'blob:x'); const revoke = vi.fn();
  URL.createObjectURL = create; URL.revokeObjectURL = revoke;
  let download = '';
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { download = this.download; });
  await userEvent.click(screen.getByRole('button', { name: t('en', 'exportData') }));
  await waitFor(() => expect(create).toHaveBeenCalled());
  expect(revoke).not.toHaveBeenCalled();
  await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:x'), { timeout: 3000 });
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
  expect(download).toBe(`fanfare-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.zip`);
  expect(create).toHaveBeenCalledTimes(1);
});

test('export uses in-memory sounds and speech when storage has nothing', async () => {
  const blob = new Blob(['snd'], { type: 'audio/mpeg' });
  rememberSound('score', blob);
  setup('en', s => reducer(s, { type: 'setCustomSound', slot: 'score', sound: { name: 'a.mp3', mime: 'audio/mpeg' } }));
  speech.load(new Map([['v|hi', new Blob(['w'])]]));
  let exported: Blob | undefined;
  URL.createObjectURL = vi.fn((b: Blob) => { exported = b; return 'blob:y'; }); URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await userEvent.click(screen.getByRole('button', { name: t('en', 'exportData') }));
  await waitFor(() => expect(exported).toBeDefined());
  const back = await importArchive(exported!);
  expect(back.sounds.score).toBeDefined();
  expect(back.speech.size).toBe(1);
});

test('import replaces state after confirm and clears stale in-memory sounds', async () => {
  const src = withPlayer({ ...initialState('en'), soundsEnabled: false });
  const file = new File([await exportArchive({ state: src, sounds: {}, speech: new Map([['v|hi', new Blob(['w'])]]) })], 'x.zip');
  rememberSound('intro', new Blob(['stale']));
  setup('en');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.upload(fileInput(), file);
  await waitFor(() => expect(names()).toEqual(['Lea']));
  expect(latest.soundsEnabled).toBe(false);
  expect(window.confirm).toHaveBeenCalled();
  expect(recalledSound('intro')).toBeUndefined();
  expect(speech.entries().has('v|hi')).toBe(true);
  expect(screen.getByRole('status')).toHaveTextContent(t('en', 'importDone'));
});

test('import remembers and saves imported sounds, applying even if saving fails', async () => {
  const snd = new Blob(['snd'], { type: 'audio/mpeg' });
  const src: AppState = { ...withPlayer(initialState('en')), customSounds: { score: { name: 'a.mp3', mime: 'audio/mpeg' } } };
  const file = new File([await exportArchive({ state: src, sounds: { score: snd }, speech: new Map() })], 'x.zip');
  vi.mocked(saveSoundBlob).mockRejectedValue(new Error('private'));
  setup('en');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.upload(fileInput(), file);
  await waitFor(() => expect(names()).toEqual(['Lea']));
  expect(recalledSound('score')).toBeDefined();
  expect(saveSoundBlob).toHaveBeenCalledWith('score', expect.anything());
});

test('declining the import confirm changes nothing', async () => {
  const file = new File([await exportArchive({ state: withPlayer(initialState('en')), sounds: {}, speech: new Map() })], 'x.zip');
  setup('en');
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  await userEvent.upload(fileInput(), file);
  await waitFor(() => expect(window.confirm).toHaveBeenCalled());
  expect(names()).toEqual([]);
});

test('import of a broken file shows the ImportError message and keeps state', async () => {
  setup('en', withPlayer);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.upload(fileInput(), new File(['hello'], 'notes.txt', { type: 'text/plain' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(t('en', 'import.not-zip'));
  expect(names()).toEqual(['Lea']);
  expect(window.confirm).not.toHaveBeenCalled();
});

test('a file over 200 MB is rejected with the too-large message', async () => {
  setup('en', withPlayer);
  const big = new File(['x'], 'big.zip');
  Object.defineProperty(big, 'size', { value: 200 * 1024 * 1024 + 1 });
  await userEvent.upload(fileInput(), big);
  expect(await screen.findByRole('alert')).toHaveTextContent(t('en', 'import.too-large'));
  expect(names()).toEqual(['Lea']);
});

test('unexpected errors during import give a generic alert and keep state', async () => {
  setup('en', withPlayer);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const file = new File([await exportArchive({ state: initialState('en'), sounds: {}, speech: new Map() })], 'x.zip');
  rememberSound('score', new Blob(['keep']));
  const keep = recalledSound('score');
  speech.load(new Map([['v|old', new Blob(['o'])]]));
  const spy = vi.spyOn(speech, 'replace').mockImplementationOnce(() => { throw new Error('boom'); });
  await userEvent.upload(fileInput(), file);
  expect(await screen.findByRole('alert')).toHaveTextContent(t('en', 'import.failed'));
  expect(names()).toEqual(['Lea']);
  expect(saveSoundBlob).not.toHaveBeenCalled();
  expect(recalledSound('score')).toBe(keep);
  expect(spy).toHaveBeenCalledTimes(2);
  expect([...speech.entries().keys()]).toEqual(['v|old']);
});

test('successful import replaces (not merges) speech entries', async () => {
  const file = new File([await exportArchive({ state: initialState('en'), sounds: {}, speech: new Map([['v|new', new Blob(['n'])]]) })], 'x.zip');
  setup('en');
  speech.load(new Map([['v|old', new Blob(['o'])]]));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.upload(fileInput(), file);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(t('en', 'importDone')));
  expect([...speech.entries().keys()]).toEqual(['v|new']);
});

test.each(LANGS)('%s has a message for every ImportError code', lang => {
  const codes: ImportErrorCode[] = ['not-zip', 'missing-json', 'bad-version', 'invalid-data', 'too-large'];
  for (const c of codes) expect(new ImportError(c).code).toBe(c);
  for (const c of codes) expect(t(lang, `import.${c}` as keyof UiStrings).trim()).not.toBe('');
  for (const k of ['import.failed', 'importDone', 'deleteDone', 'exportFailed', 'exportData', 'importData', 'deleteAll', 'importConfirm', 'deleteConfirm', 'privacyNote'] as const) {
    expect(t(lang, k).trim()).not.toBe('');
  }
});

test('"Delete all data on this device" asks to confirm, then clears storage, memory and state', async () => {
  rememberSound('score', new Blob(['s'])); rememberSound('intro', new Blob(['i']));
  setup('de', withPlayer);
  speech.load(new Map([['v|hi', new Blob(['w'])]]));
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  const btn = screen.getByRole('button', { name: t('de', 'deleteAll') });
  await userEvent.click(btn);
  expect(clearAll).not.toHaveBeenCalled();
  expect(names()).toEqual(['Lea']);
  await userEvent.click(btn);
  await waitFor(() => expect(names()).toEqual([]));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(clearAll).toHaveBeenCalledTimes(1);
  expect(latest.lang).toBe('de');
  expect(recalledSound('score')).toBeUndefined();
  expect(recalledSound('intro')).toBeUndefined();
  expect(speech.entries().size).toBe(0);
});

test('delete all still resets state when clearAll rejects', async () => {
  vi.mocked(clearAll).mockRejectedValueOnce(new Error('nope'));
  setup('en', withPlayer);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: t('en', 'deleteAll') }));
  await waitFor(() => expect(names()).toEqual([]));
});

test('privacy note is visible and says nothing leaves the device', () => {
  setup('en');
  expect(screen.getByText(/never sent to any server/)).toBeVisible();
  expect(screen.getByText(/Everything stays on this device/)).toBeInTheDocument();
});

describe('share our team', () => {
  const grab = () => {
    let blob: Blob | undefined; let download = ''; let inDom = false;
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return 'blob:team'; }); URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { download = this.download; inDom = document.body.contains(this); });
    return { get: () => ({ blob, download, inDom }) };
  };
  test('downloads a names-only team file with the safe pattern and shows the privacy note', async () => {
    const g = grab();
    setup('en', s => reducer(withPlayer(s), { type: 'setMatch', home: 'FC Beispiel', opponent: 'Other' }));
    expect(screen.getByText("This file contains names. Only send it to the other team's coach.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Share our team' }));
    const { blob, download, inDom } = g.get();
    const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
    expect(download).toBe(`fanfare-team-fc-beispiel-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`);
    expect(inDom).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    const json = JSON.parse(await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsText(blob!); }));
    expect(json).toMatchObject({ fanfareTeam: 1, sport: 'football', teamName: 'FC Beispiel', players: [{ name: 'Lea', onField: true }] });
    expect(json).not.toHaveProperty('opponent');
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:team'), { timeout: 3000 });
  });
  test('without players it explains instead of downloading', async () => {
    const g = grab();
    setup('en');
    await userEvent.click(screen.getByRole('button', { name: 'Share our team' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add players in step 1 first.');
    expect(g.get().blob).toBeUndefined();
  });
  test('the note is translated', () => {
    setup('de');
    expect(screen.getByText('Diese Datei enthält Namen. Schick sie nur an das Trainerteam der anderen Mannschaft.')).toBeInTheDocument();
  });
});
