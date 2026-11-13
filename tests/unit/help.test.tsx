import { render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import App from '../../src/ui/App';
import { t } from '../../src/i18n';
import type { Lang } from '../../src/domain/model';

const KEY = 'fanfare.welcomeDismissed';

function setReducedMotion(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  document.documentElement.removeAttribute('dir');
  vi.restoreAllMocks();
  localStorage.clear();
  setReducedMotion(false);
  Object.defineProperty(navigator, 'languages', { value: ['en'], configurable: true });
});

const welcome = () => screen.queryByRole('region', { name: 'Welcome to Fanfare!' });

test('first visit shows the welcome card with the three lines', async () => {
  render(<App />);
  const card = await screen.findByRole('region', { name: 'Welcome to Fanfare!' });
  expect(within(card).getAllByRole('listitem').map(li => li.textContent)).toEqual([
    "Enter your team and today's opponent.",
    'Press "Prepare voices" while you have Wi-Fi.',
    'On game day: "Announce lineup" and celebrate every goal.',
  ]);
  const link = within(card).getByRole('link', { name: 'Show me how' });
  expect(link).toHaveAttribute('href', './manual/en.html');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
});

test('Got it hides the card, persists, and focuses the step 1 heading', async () => {
  const { unmount } = render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Got it' }));
  expect(welcome()).toBeNull();
  expect(localStorage.getItem(KEY)).toBe('1');
  expect(document.activeElement).toBe(document.getElementById('step1-title'));
  unmount();
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
  expect(welcome()).toBeNull();
});

test('storage throwing: card still dismissible and page works', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Got it' }));
  expect(welcome()).toBeNull();
});

test('? button reopens the card', async () => {
  localStorage.setItem(KEY, '1');
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
  expect(welcome()).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Help' }));
  expect(welcome()).not.toBeNull();
});

test('de strings are exact', async () => {
  Object.defineProperty(navigator, 'languages', { value: ['de'], configurable: true });
  render(<App />);
  const card = await screen.findByRole('region', { name: 'Willkommen bei Fanfare!' });
  expect(within(card).getAllByRole('listitem').map(li => li.textContent)).toEqual([
    'Gib dein Team und den heutigen Gegner ein.',
    'Drück „Stimmen vorbereiten“, solange du WLAN hast.',
    'Am Spieltag: „Aufstellung ansagen“ und jedes Tor feiern.',
  ]);
  expect(screen.getByRole('button', { name: 'Hilfe' })).toBeInTheDocument();
});

const FILES = ['add-players.gif', 'announce.gif', 'score.gif', '05-sounds.png', '06-save.png'];

test('Show me inserts the image only after click, per step, and Hide removes it', async () => {
  localStorage.setItem(KEY, '1');
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
  expect(document.querySelectorAll('figure img')).toHaveLength(0);
  const toggles = screen.getAllByRole('button', { name: '▶ Show me' });
  expect(toggles).toHaveLength(5);
  for (let i = 0; i < 5; i++) {
    await userEvent.click(toggles[i]);
    const section = document.querySelector(`section[aria-labelledby="step${i + 1}-title"]`)!;
    const img = section.querySelector('figure img')!;
    expect(img.getAttribute('src')).toBe(`./manual/media/en/${FILES[i]}`);
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('alt')).toBeTruthy();
  }
  const hide = screen.getAllByRole('button', { name: 'Hide' });
  await userEvent.click(hide[0]);
  expect(document.querySelectorAll('figure img')).toHaveLength(4);
});

test('Show me uses the current language', async () => {
  localStorage.setItem(KEY, '1');
  render(<App />);
  await userEvent.selectOptions(await screen.findByLabelText(/language/i), 'de' as Lang);
  await userEvent.click(screen.getAllByRole('button', { name: t('de', 'showMe') })[0]);
  expect(document.querySelector('figure img')!.getAttribute('src')).toBe('./manual/media/de/add-players.gif');
});

test('reduced motion shows PNG stills instead of GIFs', async () => {
  localStorage.setItem(KEY, '1');
  setReducedMotion(true);
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
  const toggles = screen.getAllByRole('button', { name: '▶ Show me' });
  for (let i = 0; i < 3; i++) await userEvent.click(toggles[i]);
  const srcs = [...document.querySelectorAll('figure img')].map(i => i.getAttribute('src'));
  expect(srcs).toEqual(['./manual/media/en/02-players.png', './manual/media/en/03-announcements.png', './manual/media/en/04-game.png']);
});
