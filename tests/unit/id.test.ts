import { afterEach, expect, test, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { newId } from '../../src/domain/id';
import { importArchive } from '../../src/io/archive';
import { currentRoster, initialState, reducer } from '../../src/state/reducer';

// Plain-http LAN origins (fanfare-local --lan, the Pi appliance) are not secure contexts:
// there `crypto.randomUUID` does not exist, only `crypto.getRandomValues`.
const realCrypto = globalThis.crypto;
function insecureContext() {
  vi.stubGlobal('crypto', { getRandomValues: <T extends ArrayBufferView<ArrayBuffer>>(a: T) => realCrypto.getRandomValues(a) });
}
afterEach(() => vi.unstubAllGlobals());

test('newId uses randomUUID where it exists', () => {
  expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
});

test('newId falls back to 32 random hex characters without a secure context', () => {
  insecureContext();
  const a = newId(), b = newId();
  expect(a).toMatch(/^[0-9a-f]{32}$/);
  expect(a).not.toBe(b);
});

test('adding players works without a secure context', () => {
  insecureContext();
  const s = reducer(initialState('en'), { type: 'addPlayers', text: 'Lea\nTom', onField: true });
  const ps = currentRoster(s).players;
  expect(ps.map(p => p.name)).toEqual(['Lea', 'Tom']);
  expect(ps[0].id).not.toBe(ps[1].id);
});

test('importing a guest team works without a secure context', () => {
  insecureContext();
  const s = reducer(initialState('en'), {
    type: 'importGuestTeam',
    team: { fanfareTeam: 1, sport: 'football', teamName: 'SV X', teamSayAs: '', teamOrigSpelling: '', teamNameLang: '',
      players: [{ name: 'Gus', number: '', position: '', onField: true, sayAs: '', origSpelling: '', nameLang: '' }] },
  });
  expect(currentRoster(s).guestPlayers[0].id).toMatch(/^[0-9a-f]{32}$/);
});

test('importing an archive whose player has no id works without a secure context', async () => {
  insecureContext();
  const base = initialState('en');
  const json = { ...base, rosters: { football: { ...currentRoster(base),
    players: [{ name: 'Ann', number: '', position: '', onField: true, customText: null }] } } };
  const out = await importArchive(new Blob([zipSync({ 'fanfare.json': strToU8(JSON.stringify(json)) }) as BlobPart]));
  expect(out.state.rosters.football!.players[0].id).toMatch(/^[0-9a-f]{32}$/);
});
