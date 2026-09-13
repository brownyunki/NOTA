import { useEffect, useRef, useState } from 'react';
import metadata from '../release.json';
import changelog from '../CHANGELOG.md?raw';
import { isNewerVersion, parseReleases } from './releases';

const releases = parseReleases(changelog);
const version = metadata.version;
const openedKey = 'nota-last-opened-version';
const readKey = 'nota-changelog-read-version';
function readVersion() {
  try { return localStorage.getItem(readKey) ?? localStorage.getItem(openedKey); } catch { return null; }
}
export function ReleaseHistory({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [previous] = useState(readVersion);
  const [unread, setUnread] = useState(() => previous !== null && isNewerVersion(version, previous));
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  function outsideDialog(x: number, y: number) {
    const bounds = dialog.current?.getBoundingClientRect();
    return !!bounds && (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom);
  }
  useEffect(() => {
    try {
      localStorage.setItem(openedKey, version);
      if (previous === null) localStorage.setItem(readKey, version);
      else if (!localStorage.getItem(readKey)) localStorage.setItem(readKey, previous);
    } catch { /* History remains available without storage. */ }
  }, [previous]);
  function openHistory() {
    dialog.current?.showModal(); onOpenChange(true); setUnread(false);
    try { localStorage.setItem(readKey, version); } catch { /* Optional persistence. */ }
  }
  return <>
    <button className="version-button" onClick={openHistory} aria-haspopup="dialog" aria-label={`Версия ${version}. История изменений${unread ? '. Есть обновления' : ''}`}>
      v{version}{unread && <span className="version-dot" aria-hidden="true" />}
    </button>
    <dialog ref={dialog} className="release-dialog" aria-labelledby="release-title" onClose={() => onOpenChange(false)}
      onPointerDown={event => { backdropPress.current = event.target === event.currentTarget && outsideDialog(event.clientX, event.clientY); }}
      onPointerUp={event => {
        if (backdropPress.current && event.target === event.currentTarget && outsideDialog(event.clientX, event.clientY)) event.currentTarget.close();
        backdropPress.current = false;
      }}
      onPointerCancel={() => { backdropPress.current = false; }}>
      <div className="release-heading"><h2 id="release-title">Что нового</h2><button className="text-button" autoFocus onClick={() => dialog.current?.close()} aria-label="Закрыть историю изменений">✕</button></div>
      <div className="release-content">{releases.map(release => <article key={release.version}>
        <h3>v{release.version}</h3>
        {release.sections.map((section, i) => <section key={i}><h4>{section.title}</h4><ul>{section.items.map((item, j) => <li key={j}>{item}</li>)}</ul></section>)}
      </article>)}</div>
    </dialog>
  </>;
}
