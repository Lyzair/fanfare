import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within, act } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'preact/hooks';
import RosterPanel from '../../src/ui/RosterPanel';
import { initialState, reducer, currentRoster } from '../../src/state/reducer';
import type { AppState, Lang } from '../../src/domain/model';

let latest: AppState;
function Harness({ lang = 'en', init }: { lang?: Lang; init?: (s: AppState) => AppState }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => (init ? init(initialState(lang)) : initialState(lang)));
  latest = state;
  return <RosterPanel state={state} dispatch={dispatch} />;
}
const fixture = readFileSync(resolve(process.cwd(), 'tests/fixtures/fussballde-kader.txt'), 'utf8');
const withPlayers = (n: number) => (s: AppState) =>
  reducer(s, { type: 'addPlayers', text: Array.from({ length: n }, (_, i) => `P${i + 1}`).join('\n'), onField: true });

test('match fields "Home team" and "Opponent" sit at the top and dispatch setMatch', async () => {
  render(<Harness />);
  const home = screen.getByLabelText('Home team'), opp = screen.getByLabelText('Opponent');
  expect(home.compareDocumentPosition(screen.getByLabelText('Paste or type a list of players')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await userEvent.type(home, 'FC Test');
  await userEvent.type(opp, 'SV Gegner');
  expect(currentRoster(latest).homeTeam).toBe('FC Test');
  expect(currentRoster(latest).opponent).toBe('SV Gegner');
});

test('adding names via textarea creates field players', async () => {
  render(<Harness />);
  await userEvent.type(screen.getByLabelText('Paste or type a list of players'), '7 Lea{Enter}Tom');
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getAllByLabelText('Name')).toHaveLength(2);
  const first = currentRoster(latest).players[0];
  expect(first).toMatchObject({ name: 'Lea', number: '7', onField: true });
  expect(screen.getByDisplayValue('Lea')).toBeInTheDocument();
});

test('pasting the fussball.de fixture adds 5 players with positions and turns positions on', async () => {
  render(<Harness lang="de" />);
  const box = screen.getByLabelText('Spielerliste einfügen oder eintippen');
  await userEvent.click(box);
  await userEvent.paste(fixture);
  await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
  expect(currentRoster(latest).players).toHaveLength(5);
  expect(currentRoster(latest).showPositions).toBe(true);
  expect(screen.getAllByRole('combobox', { name: 'Position' })).toHaveLength(5);
  expect(screen.getByDisplayValue('Lea Müller')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Torwart')).toBeInTheDocument();
});

test('"Coming from fussball.de?" help is collapsed and explains copy & paste', async () => {
  render(<Harness />);
  const summary = screen.getByText('Coming from fussball.de?');
  const details = summary.closest('details')!;
  expect(details.open).toBe(false);
  await userEvent.click(summary);
  expect(details.open).toBe(true);
  expect(within(details).getByText(/copy it and paste it/)).toBeInTheDocument();
  expect(details.textContent).toContain('never connects to fussball.de');
});

test('Enter in the single-name box adds one player', async () => {
  render(<Harness />);
  const one = screen.getByLabelText('Add one player');
  await userEvent.type(one, 'Max{Enter}');
  expect(currentRoster(latest).players.map(p => p.name)).toEqual(['Max']);
  expect(one).toHaveValue('');
});

test('field/bench toggle moves a player to the bench list', async () => {
  render(<Harness init={withPlayers(1)} />);
  const field = screen.getByRole('region', { name: 'On the field' });
  await userEvent.click(within(field).getByRole('button', { name: 'Move to bench' }));
  expect(currentRoster(latest).players[0].onField).toBe(false);
  const bench = screen.getByRole('region', { name: 'Bench' });
  expect(within(bench).getByDisplayValue('P1')).toBeInTheDocument();
});

test('position column hidden until "Use positions" is checked', async () => {
  render(<Harness init={withPlayers(1)} />);
  expect(screen.queryByRole('combobox', { name: 'Position' })).toBeNull();
  await userEvent.click(screen.getByLabelText('Use positions'));
  const combo = screen.getByRole('combobox', { name: 'Position' });
  const list = document.getElementById(combo.getAttribute('list')!)!;
  expect([...list.querySelectorAll('option')].map(o => o.getAttribute('value'))).toEqual(
    ['Goalkeeper', 'Defence', 'Midfield', 'Attack']);
  await userEvent.type(combo, 'Libero');
  expect(currentRoster(latest).players[0].position).toBe('Libero');
});

test('counter warns when more field players than the sport allows', () => {
  render(<Harness init={withPlayers(12)} />);
  const status = screen.getByText('12 / 11 on the field');
  expect(status).toHaveAttribute('role', 'status');
});

test('typing in a name input keeps focus and caret', async () => {
  render(<Harness init={withPlayers(2)} />);
  const input = screen.getByDisplayValue('P1');
  await userEvent.click(input);
  await userEvent.type(input, 'xyz');
  expect(screen.getByDisplayValue('P1xyz')).toBe(document.activeElement);
});

test('up/down reorders within the list', async () => {
  render(<Harness init={withPlayers(3)} />);
  const field = screen.getByRole('region', { name: 'On the field' });
  await userEvent.click(within(field).getAllByRole('button', { name: 'Move down' })[0]);
  expect(currentRoster(latest).players.map(p => p.name)).toEqual(['P2', 'P1', 'P3']);
});

test('remove asks no confirmation but offers Undo for 5 s', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    render(<Harness init={withPlayers(3)} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    expect(currentRoster(latest).players.map(p => p.name)).toEqual(['P1', 'P3']);
    expect(screen.getByRole('status')).toHaveTextContent('Removed P2');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(currentRoster(latest).players.map(p => p.name)).toEqual(['P1', 'P2', 'P3']);
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  } finally { vi.useRealTimers(); }
});
