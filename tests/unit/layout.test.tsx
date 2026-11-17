import { render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import App from '../../src/ui/App';
import { loadLayout, saveLayout } from '../../src/ui/layout';

beforeEach(() => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  vi.restoreAllMocks();
  localStorage.clear();
});

test('the layout defaults to "game on the side"', () => {
  expect(loadLayout()).toBe('game-side');
});

test('an unknown stored value falls back to the default', () => {
  localStorage.setItem('fanfare.layout', 'xyz');
  expect(loadLayout()).toBe('game-side');
});

test('blocked storage (private mode) falls back to the default and saving does not throw', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  expect(loadLayout()).toBe('game-side');
  expect(() => saveLayout('columns')).not.toThrow();
});

test('a saved layout is read back', () => {
  saveLayout('columns');
  expect(loadLayout()).toBe('columns');
});

test('the page marks the layout and each step card', async () => {
  const { container } = render(<App />);
  await screen.findByRole('group', { name: 'Layout' });
  expect(container.querySelector('main')?.getAttribute('data-layout')).toBe('game-side');
  expect([...container.querySelectorAll('section[data-step]')].map(s => s.getAttribute('data-step'))).toEqual(['1', '2', '3', '4', '5']);
});

test('the switch changes and remembers the layout', async () => {
  const { container } = render(<App />);
  const columns = await screen.findByRole('button', { name: 'Columns' });
  expect(screen.getByRole('button', { name: 'Game on the side' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(columns);
  expect(columns).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('main')?.getAttribute('data-layout')).toBe('columns');
  expect(localStorage.getItem('fanfare.layout')).toBe('columns');
});
