import { readFileSync } from 'node:fs';
import { parseReleases } from '../src/releases.ts';

const metadata = JSON.parse(readFileSync(new URL('../release.json', import.meta.url), 'utf8'));
const releases = parseReleases(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
if (metadata.version !== releases[0].version) throw new Error('release.json должен совпадать с первой версией в CHANGELOG.md');
console.log(`Release ${metadata.version}: changelog OK`);
