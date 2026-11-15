import { readFileSync } from 'node:fs';
import { parseReleases, validateReleaseMetadata } from '../src/releases.ts';

const metadata = JSON.parse(readFileSync(new URL('../release.json', import.meta.url), 'utf8'));
const releases = parseReleases(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
validateReleaseMetadata(metadata, releases);
console.log(`Release ${metadata.version}: changelog OK`);
