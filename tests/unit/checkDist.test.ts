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

describe('check-dist local voice server', () => {
  test('allows loopback addresses only', () => {
    expect(findProblems('x="http://127.0.0.1:5123"; y="http://localhost:*;"', '.js')).toEqual([]);
    expect(findProblems('x="http://localhost.evil.com/a"', '.js')).toHaveLength(1);
    expect(findProblems('x="http://192.168.1.5:5123"', '.js')).toHaveLength(1);
  });
});

describe('check-dist manifest and service worker', () => {
  test('accepts a relative manifest', () => {
    expect(findProblems('{"start_url":"./","icons":[{"src":"icons/a.png"}]}', '.webmanifest')).toEqual([]);
  });
  test('flags rooted paths and external URLs in a manifest', () => {
    expect(findProblems('{"start_url":"/app"}', '.webmanifest').join()).toContain('absolute path');
    expect(findProblems('{"icons":[{"src":"https://cdn.example/a.png"}]}', '.webmanifest').join()).toContain('https://cdn.example/a.png');
  });
  test('flags an external URL in a service worker', () => {
    expect(findProblems('fetch("https://cdn.example/x.js")', '.js').join()).toContain('cdn.example');
  });
});
