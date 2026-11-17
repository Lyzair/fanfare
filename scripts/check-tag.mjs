#!/usr/bin/env node
// node scripts/check-tag.mjs <ref>: exit 0 when the git tag (refs/tags/v1.0.0 or v1.0.0) is
// "v" + the version in package.json, so a release never ships files with another version.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** @param {string} ref @param {string} version */
export function tagMatches(ref, version) {
  if (ref.startsWith('refs/') && !ref.startsWith('refs/tags/')) return false;
  return ref.replace(/^refs\/tags\//, '') === `v${version}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ref = process.argv[2] ?? '';
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  if (!tagMatches(ref, version)) {
    console.error(`Tag ${ref.replace(/^refs\/tags\//, '')} does not match package.json version ${version}`);
    process.exit(1);
  }
  console.log(`Tag v${version} matches package.json`);
}
