import { describe, expect, test } from 'vitest';
import { findProblems } from '../../scripts/check-dist.mjs';

describe('check-dist URL detector', () => {
  test('ignores URLs in licence and sourcemap comments', () => {
    const js = '/*! lib v1 https://example.com/license */\n// see https://example.com\nconsole.log(1);\n//# sourceMappingURL=https://x.test/a.map';
    expect(findProblems(js, '.js')).toEqual([]);
  });
  test('flags a URL inside a string in code', () => {
    const problems = findProblems('fetch("https://evil.example/a")', '.js');
    expect(problems.join()).toContain('https://evil.example/a');
  });
  test('does not mistake // inside a string for a comment', () => {
    expect(findProblems('x="https://a.test"; // tail', '.js')).toHaveLength(1);
  });
  test('flags an absolute src path', () => {
    expect(findProblems('<script src="/x.js"></script>', '.html')).toHaveLength(1);
  });
  test('accepts relative paths and html comments', () => {
    expect(findProblems('<!-- https://a.test --><script src="./x.js"></script>', '.html')).toEqual([]);
  });
  test('ignores css comments, flags css url()', () => {
    expect(findProblems('/* https://a.test */ a{b:c}', '.css')).toEqual([]);
    expect(findProblems('a{background:url(https://a.test/i.png)}', '.css')).toHaveLength(1);
  });
});
