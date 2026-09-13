export type Release = { version: string; sections: { title: string; items: string[] }[] };
export const versionPattern = /^\d{4}\.\d{2}\.\d{2}\.[1-9]\d*$/;

// Deliberately small Markdown subset: version headings, section headings, bullets.
export function parseReleases(source: string): Release[] {
  const releases: Release[] = [];
  let release: Release | undefined;
  let section: Release['sections'][number] | undefined;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('# ')) continue;
    if (line.startsWith('## ')) {
      const version = line.slice(3);
      if (!versionPattern.test(version) || releases.some(item => item.version === version)) throw new Error(`Некорректная или повторная версия: ${version}`);
      release = { version, sections: [] }; section = undefined; releases.push(release);
    } else if (line.startsWith('### ') && release) {
      section = { title: line.slice(4), items: [] }; release.sections.push(section);
    } else if (line.startsWith('- ') && section) {
      section.items.push(line.slice(2));
    } else throw new Error(`Неподдерживаемая строка CHANGELOG.md: ${line}`);
  }
  if (!releases.length || releases.some(item => !item.sections.length || item.sections.some(group => !group.items.length))) throw new Error('В истории нужны версии, разделы и пункты изменений.');
  for (let i = 1; i < releases.length; i++) {
    if (!isNewerVersion(releases[i - 1].version, releases[i].version)) throw new Error('Новые версии должны идти первыми.');
  }
  return releases;
}

export function isNewerVersion(current: string, previous: string): boolean {
  if (!versionPattern.test(previous)) return false;
  const a = current.split('.').map(Number), b = previous.split('.').map(Number);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
