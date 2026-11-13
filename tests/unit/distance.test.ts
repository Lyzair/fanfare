import { closeness, normalizedDistance, segments, weightedDistance } from '../../src/domain/respell/distance';

const ipa = (s: string) => s.split(' ');

test('identical sequences have distance 0', () => {
  const a = ipa('v ˈɔ j t ɕ ɛ x');
  expect(weightedDistance(a, a)).toBe(0);
  expect(normalizedDistance(a, a)).toBe(0);
});

test('stress and length marks attach to the segment', () => {
  expect(segments(['ʃ', 'ˈ', 'ɔ', 'ː', 'n'])).toEqual([{ s: 'ʃ', st: false }, { s: 'ɔː', st: true }, { s: 'n', st: false }]);
});

test('combining marks join the phoneme: c + U+0327 is the single segment ç', () => {
  expect(segments(['ɛ', 'c', '\u0327']).map((x) => x.s)).toEqual(['ɛ', 'ç']);
  expect(weightedDistance(['x'], ['c', '\u0327'])).toBeCloseTo(0.4);
});

test('feature-close substitutions cost less than far ones', () => {
  const base = ipa('v ˈɔ j t ɕ ɛ x');
  const close = ipa('v ˈɔ j t ʃ ɛ ç');
  const far = ipa('v ˈɔ j t k ɛ m');
  expect(weightedDistance(base, close)).toBeGreaterThan(0);
  expect(weightedDistance(base, close)).toBeLessThan(weightedDistance(base, far));
  expect(weightedDistance(ipa('k ˈɛ'), ipa('k ˈɛː'))).toBeLessThan(weightedDistance(ipa('k ˈɛ'), ipa('k ˈɔ')));
});

test('insertions and deletions cost a full unit; the distance is symmetric', () => {
  expect(weightedDistance(ipa('a b'), ipa('a'))).toBe(1);
  const a = ipa('m ˈa t s'), b = ipa('m ˈɛ t');
  expect(weightedDistance(a, b)).toBeCloseTo(weightedDistance(b, a));
});

test('normalized distance divides by the longer sequence; empty vs empty is 0', () => {
  expect(normalizedDistance(ipa('a b c d'), ipa('a b c'))).toBeCloseTo(0.25);
  expect(normalizedDistance([], [])).toBe(0);
});

test('closeness levels: <= 0.15 very close, <= 0.35 close, else rough', () => {
  expect(closeness(0)).toBe(3);
  expect(closeness(0.15)).toBe(3);
  expect(closeness(0.16)).toBe(2);
  expect(closeness(0.35)).toBe(2);
  expect(closeness(0.36)).toBe(1);
});
