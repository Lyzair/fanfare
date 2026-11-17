// @vitest-environment node
import { tagMatches } from '../../scripts/check-tag.mjs';

test('a tag matches when it is v + the package version', () => {
  expect(tagMatches('refs/tags/v1.0.0', '1.0.0')).toBe(true);
  expect(tagMatches('v1.0.0', '1.0.0')).toBe(true);
});

test('anything else does not match', () => {
  for (const ref of ['v1.0', 'v1.0.1', '1.0.0', 'refs/tags/v1.0.0-rc1', 'refs/heads/v1.0.0', ''])
    expect(tagMatches(ref, '1.0.0'), ref).toBe(false);
});
