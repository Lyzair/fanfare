import { shouldRegister } from '../../src/pwa/register';

const ok = { prod: true, secure: true, supported: true, search: '' };
test('registers only in production, secure contexts with SW support', () => {
  expect(shouldRegister(ok)).toBe(true);
  expect(shouldRegister({ ...ok, prod: false })).toBe(false);
  expect(shouldRegister({ ...ok, secure: false })).toBe(false);
  expect(shouldRegister({ ...ok, supported: false })).toBe(false);
});
test('?nosw and ?test switch it off', () => {
  expect(shouldRegister({ ...ok, search: '?nosw' })).toBe(false);
  expect(shouldRegister({ ...ok, search: '?test' })).toBe(false);
  expect(shouldRegister({ ...ok, search: '?foo=1' })).toBe(true);
});
