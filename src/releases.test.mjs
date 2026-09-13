import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewerVersion, parseReleases } from './releases.ts';

test('versions compare numeric release counters and dates', () => {
  assert.equal(isNewerVersion('2026.09.13.10', '2026.09.13.9'), true);
  assert.equal(isNewerVersion('2026.09.14.1', '2026.09.13.10'), true);
  assert.equal(isNewerVersion('2026.09.13.1', '2026.09.13.1'), false);
  assert.equal(isNewerVersion('2026.09.13.1', '2026.09.14.1'), false);
  assert.equal(isNewerVersion('2026.09.13.1', 'broken'), false);
});
test('editable changelog keeps section and item text, including safe literal markup', () => {
  const parsed = parseReleases('# История\r\n\r\n## 2026.09.13.1\r\n### Новое\r\n- Ноты <b>крупнее</b>\r\n');
  assert.equal(parsed[0].sections[0].items[0], 'Ноты <b>крупнее</b>');
});
test('invalid or unordered changelogs fail validation before deployment', () => {
  for (const text of ['', '## nope', '## 2026.09.13.1\n### Новое', '## 2026.09.13.1\n### Новое\n- A\n## 2026.09.14.1\n### Новое\n- B']) assert.throws(() => parseReleases(text));
});
