import { render, screen, within, waitFor, act } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import App from '../../src/ui/App';
import { t } from '../../src/i18n';
import { initialState } from '../../src/state/reducer';
import * as persist from '../../src/state/persist';

beforeEach(async () => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  document.documentElement.removeAttribute('dir');
  vi.restoreAllMocks();
});

test('sport dropdown lists 7 sports with icons and switches theme', async () => {
  render(<App />);
  const sel = await screen.findByLabelText(/sport/i);
  const opts = within(sel).getAllByRole('option');
  expect(opts).toHaveLength(7);
  expect(opts[0].textContent).toContain('⚽');
  await userEvent.selectOptions(sel, 'handball');
  expect(document.querySelector('[data-sport="handball"]')).not.toBeNull();
});

test('language dropdown lists all 10 languages by native name', async () => {
  render(<App />);
  const sel = await screen.findByLabelText(/language/i);
  const opts = within(sel).getAllByRole('option');
  expect(opts).toHaveLength(10);
  const text = opts.map(o => o.textContent).join('|');
  for (const n of ['Deutsch', 'English', 'Français', 'Türkçe', 'Українська', 'العربية']) expect(text).toContain(n);
});

test('language dropdown switches UI text', async () => {
  render(<App />);
  const sel = await screen.findByLabelText(/language/i);
  await userEvent.selectOptions(sel, 'fr');
  expect(await screen.findByRole('heading', { level: 2, name: new RegExp(t('fr', 'step1Title')) })).toBeInTheDocument();
});

test('Arabic switches the page to right-to-left', async () => {
  render(<App />);
  await userEvent.selectOptions(await screen.findByLabelText(/language/i), 'ar');
  await waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
  expect(document.documentElement.lang).toBe('ar');
});

test('first-run language follows navigator.languages', async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['tr-TR']);
  render(<App />);
  expect(await screen.findByRole('heading', { level: 2, name: new RegExp(t('tr', 'step1Title')) })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe('tr');
});

test('state restored from IndexedDB on load', async () => {
  await persist.saveState({ ...initialState('en'), sport: 'basketball' });
  render(<App />);
  await waitFor(() => expect(document.querySelector('[data-sport="basketball"]')).not.toBeNull());
  expect((await screen.findByLabelText(/sport/i) as HTMLSelectElement).value).toBe('basketball');
});

test('panels are numbered steps 1-5 in order', async () => {
  localStorage.setItem('fanfare.welcomeDismissed', '1');
  render(<App />);
  const heads = await screen.findAllByRole('heading', { level: 2 });
  expect(heads).toHaveLength(5);
  heads.forEach((h, i) => expect(h.textContent).toMatch(new RegExp(`^${i + 1}\\s`)));
});

test('autosaves state after 300 ms debounce', async () => {
  const save = vi.spyOn(persist, 'saveState').mockResolvedValue();
  render(<App />);
  await screen.findByLabelText(/sport/i);
  await userEvent.selectOptions(screen.getByLabelText(/sport/i), 'handball');
  await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 1500 });
  expect(save.mock.calls.at(-1)![0].sport).toBe('handball');
});

test('storage failure: app still works, one notice shown', async () => {
  vi.spyOn(persist, 'loadState').mockRejectedValue(new Error('no idb'));
  vi.spyOn(persist, 'saveState').mockRejectedValue(new Error('no idb'));
  render(<App />);
  const sel = await screen.findByLabelText(/sport/i);
  const notice = await screen.findByRole('status');
  expect(notice).toHaveTextContent(t('en', 'saveUnavailable'));
  await userEvent.selectOptions(sel, 'handball');
  await act(async () => { await new Promise(r => setTimeout(r, 450)); });
  expect(document.querySelector('[data-sport="handball"]')).not.toBeNull();
  expect(screen.getAllByRole('status')).toHaveLength(1);
});

