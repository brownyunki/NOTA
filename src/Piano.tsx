import { useState } from 'react';

const whiteKeys = [
  ['До', 'C'], ['Ре', 'D'], ['Ми', 'E'], ['Фа', 'F'],
  ['Соль', 'G'], ['Ля', 'A'], ['Си', 'B'], ['До', 'C'],
];
const blackKeys = [
  { after: 1, sharp: 'До♯', flat: 'Ре♭', letters: 'C♯ / D♭' },
  { after: 2, sharp: 'Ре♯', flat: 'Ми♭', letters: 'D♯ / E♭' },
  { after: 4, sharp: 'Фа♯', flat: 'Соль♭', letters: 'F♯ / G♭' },
  { after: 5, sharp: 'Соль♯', flat: 'Ля♭', letters: 'G♯ / A♭' },
  { after: 6, sharp: 'Ля♯', flat: 'Си♭', letters: 'A♯ / B♭' },
];

export function Piano({ onPlay }: { onPlay: (midi: number) => void }) {
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  function select(key: string, midi: number) { setSelected(current => current === key ? null : key); onPlay(midi); }
  return <section className="piano-card" aria-labelledby="piano-title">
    <div className="piano-header"><div><h3 id="piano-title">Клавиши и ноты</h3></div>
      <button className="piano-eye" aria-pressed={visible} aria-label={visible ? 'Скрыть постоянные подписи нот' : 'Всегда показывать названия нот'} title={visible ? 'Скрыть подписи' : 'Показать все подписи'} onClick={() => { setVisible(v => !v); setSelected(null); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{visible ? <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></> : <><path d="M3 9c4 7 14 7 18 0" /><path d="m5 12-2 3m5.5-1  -1 3m4.5-2v3m3.5-4 1 3m2.5-5 2 3" /></>}</svg>
      </button>
    </div>
    <div className={`piano-keys ${visible ? 'show-labels' : ''}`} role="group" aria-label="Клавиши фортепиано от До до следующей До">
      {whiteKeys.map(([name, letter], i) => <button key={i} className={`piano-key white-key ${selected === `w${i}` ? 'selected' : ''}`} onClick={() => select(`w${i}`, [60, 62, 64, 65, 67, 69, 71, 72][i])} onBlur={() => setSelected(null)} aria-label={`${name} (${letter})${i === 7 ? ', следующая октава' : ''}`}><span className="piano-label"><strong>{name}</strong><small>{letter}</small></span></button>)}
      {blackKeys.map(key => <button key={key.after} style={{ left: `${key.after * 12.5}%` }} className={`piano-key black-key ${selected === `b${key.after}` ? 'selected' : ''}`} onClick={() => select(`b${key.after}`, [60, 62, 64, 65, 67, 69, 71][key.after - 1] + 1)} onBlur={() => setSelected(null)} aria-label={`${key.sharp} или ${key.flat} (${key.letters})`}><span className="piano-label"><strong>{key.sharp}</strong><strong>{key.flat}</strong><small>{key.letters.split(' / ')[0]}</small><small>{key.letters.split(' / ')[1]}</small></span></button>)}
    </div>
    <p>{visible ? 'Все названия видны. ♯ — диез, ♭ — бемоль.' : 'Наведи курсор или нажми на клавишу, чтобы увидеть ноту.'}</p>
  </section>;
}
