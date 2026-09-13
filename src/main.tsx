import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { guitarBuffer } from './guitar-audio';
import { Microphone } from './Microphone';
import { Piano } from './Piano';
import { emptyNotes, mastery, readNotes, recordNote, type NoteProgress } from './progress';
import { GUITAR_NOTES, guitarPositions, pickNote, isCorrectAnswer, fretMidi, staffChoices } from './training';
import { emptySpeed, readSpeed, recordSpeed, sessionTiming, seconds, RecognitionClock, type SpeedProgress, type TimedAnswer } from './timing';

const NOTES = [
  { name: 'До', letter: 'C', midi: 60, y: 156, hint: 'На добавочной линейке под нотным станом.' },
  { name: 'Ре', letter: 'D', midi: 62, y: 145, hint: 'Под первой линейкой нотного стана.' },
  { name: 'Ми', letter: 'E', midi: 64, y: 134, hint: 'На первой линейке снизу.' },
  { name: 'Фа', letter: 'F', midi: 65, y: 123, hint: 'Между первой и второй линейками снизу.' },
  { name: 'Соль', letter: 'G', midi: 67, y: 112, hint: 'На второй линейке снизу.' },
  { name: 'Ля', letter: 'A', midi: 69, y: 101, hint: 'Между второй и третьей линейками снизу.' },
  { name: 'Си', letter: 'B', midi: 71, y: 90, hint: 'На третьей, средней линейке.' },
  { name: 'До', letter: 'C', midi: 72, y: 79, hint: 'Между третьей и четвёртой линейками снизу.' },
  { name: 'Ре', letter: 'D', midi: 74, y: 68, hint: 'На четвёртой линейке снизу.' },
  { name: 'Ми', letter: 'E', midi: 76, y: 57, hint: 'Между четвёртой и пятой линейками снизу.' },
  { name: 'Фа', letter: 'F', midi: 77, y: 46, hint: 'На пятой, верхней линейке.' },
  { name: 'Соль', letter: 'G', midi: 79, y: 35, hint: 'Над пятой линейкой.' },
  { name: 'Ля', letter: 'A', midi: 81, y: 24, hint: 'На первой добавочной линейке сверху.' },
  { name: 'Си', letter: 'B', midi: 83, y: 13, hint: 'Над первой добавочной линейкой сверху.' },
  { name: 'Ми', letter: 'E', midi: 52, y: 211, hint: 'Под третьей добавочной линейкой снизу.' },
  { name: 'Фа', letter: 'F', midi: 53, y: 200, hint: 'На третьей добавочной линейке снизу.' },
  { name: 'Соль', letter: 'G', midi: 55, y: 189, hint: 'Между второй и третьей добавочными линейками снизу.' },
  { name: 'Ля', letter: 'A', midi: 57, y: 178, hint: 'На второй добавочной линейке снизу.' },
  { name: 'Си', letter: 'B', midi: 59, y: 167, hint: 'Между первой и второй добавочными линейками снизу.' },
] as const;
type Progress = { sessions: number; correct: number; total: number; mistakes: number[]; notes: NoteProgress[]; speed: SpeedProgress };
const fresh = (): Progress => ({ sessions: 0, correct: 0, total: 0, mistakes: Array<number>(19).fill(0), notes: emptyNotes(), speed: emptySpeed() });
function readProgress(key: string): Progress {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (typeof p !== 'object' || p === null) return fresh();
    const v = p as Record<string, unknown>;
    if (![v.sessions, v.correct, v.total].every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0)) return fresh();
    if (!Array.isArray(v.mistakes) || ![7, 14, 19].includes(v.mistakes.length) || !v.mistakes.every(n => Number.isInteger(n) && n >= 0)) return fresh();
    const mistakes = [...v.mistakes as number[], ...Array<number>(19 - v.mistakes.length).fill(0)];
    return { sessions: v.sessions as number, correct: v.correct as number, total: v.total as number, mistakes, notes: readNotes(v.notes), speed: readSpeed(v.speed) };
  } catch { return fresh(); }
}
function shuffleAnswers(previous: number[] = []): number[] {
  const order = NOTES.slice(0, 7).map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.every((n, i) => n === (previous[i] ?? i))) order.push(order.shift()!);
  return order;
}
function readAudio(): { enabled: boolean; volume: number } | null {
  try {
    const value = JSON.parse(localStorage.getItem('nota-audio') ?? 'null');
    return value && typeof value.enabled === 'boolean' && typeof value.volume === 'number' && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 100 ? value : null;
  } catch { return null; }
}
function Staff({ index, reveal }: { index: number; reveal: boolean }) {
  const note = NOTES[index];
  return <svg className="staff" viewBox="0 0 340 245" role="img" aria-label={reveal ? `Нота ${note.name}. ${note.hint} ${guitarPositions(note.midi)}` : 'Нота в скрипичном ключе. Определите её название.'}>
    {[46, 68, 90, 112, 134].map(y => <line key={y} x1="24" y1={y} x2="316" y2={y} stroke="currentColor" strokeWidth="1.3" opacity=".38" />)}
    <text x="35" y="137" fontSize="116" fontFamily="Georgia, 'Times New Roman', serif">𝄞</text>
    {[156, 178, 200].filter(y => note.y >= y).map(y => <line key={y} x1="178" y1={y} x2="222" y2={y} stroke="currentColor" strokeWidth="1.5" />)}
    {note.y <= 24 && <line x1="178" y1="24" x2="222" y2="24" stroke="currentColor" strokeWidth="1.5" />}
    <ellipse cx="200" cy={note.y} rx="12" ry="8.5" transform={`rotate(-20 200 ${note.y})`} fill="currentColor" />
    <line x1={note.y <= 90 ? 189 : 211} x2={note.y <= 90 ? 189 : 211} y1={note.y} y2={note.y + (note.y <= 90 ? 58 : -58)} stroke="currentColor" strokeWidth="2" />
  </svg>;
}
function Chevron() {
  return <svg className="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
const MODES = [
  { label: 'Узнай ноту', key: 'nota-progress', question: 'Какая это нота?', instruction: 'Посмотри на нотный стан и выбери название.' },
  { label: 'Нота → гриф', key: 'nota-progress-to-fret', question: 'Где эта нота на грифе?', instruction: 'Посмотри на ноту и нажми на нужную струну и лад. 0 — открытая струна.' },
  { label: 'Гриф → нота', key: 'nota-progress-to-staff', question: 'Как записать эту ноту?', instruction: 'Найди ноту на стане, которая соответствует отмеченному месту на грифе.' },
  { label: 'С гитарой', key: 'nota-progress-microphone', question: 'Сыграй эту ноту', instruction: 'Сыграй одну ноту на гитаре. Остальные струны приглуши — микрофон услышит её.' },
] as const;
function Fretboard({ target, answer, onChoose, firstButton, labeled = false }: { target: number | null; answer?: number | null; onChoose?: (note: number) => void; firstButton?: React.Ref<HTMLButtonElement>; labeled?: boolean }) {
  return <div className="fretboard-wrap"><div className="fretboard" role="group" aria-label="Гриф: первая тонкая струна сверху, шестая толстая снизу">
    <span className="fret-caption">Струна</span>{[0, 1, 2, 3].map(f => <span className="fret-caption" key={f}>{f === 0 ? '0 · откр.' : `${f} лад`}</span>)}
    {[1, 2, 3, 4, 5, 6].map(string => <React.Fragment key={string}><span className="string-number">{string}</span>{[0, 1, 2, 3].map(fret => {
      const note = NOTES.findIndex(n => n.midi === fretMidi(string, fret));
      const value = note >= 0 ? note : -(string * 4 + fret);
      const marked = target !== null && note === target;
      const wrong = answer === value && !marked;
      const label = `${string}-я струна, ${fret === 0 ? 'открытая' : `${fret}-й лад`}`;
      const content = <><span className="guitar-string" style={{ height: `${0.7 + string * 0.3}px` }} /><span className={`fret-dot ${labeled && note >= 0 ? 'fret-note-label' : ''} ${marked ? 'marked' : ''} ${wrong ? 'wrong' : ''}`}>{labeled && note >= 0 ? `${NOTES[note].name} (${NOTES[note].letter})` : marked ? '●' : wrong ? '×' : ''}</span></>;
      return onChoose ? <button ref={string === 1 && fret === 0 ? firstButton : undefined} className={`fret-cell ${fret === 0 ? 'open-string' : ''}`} key={fret} aria-label={`${label}${labeled && note >= 0 ? `, ${NOTES[note].name} (${NOTES[note].letter})` : ''}${marked ? labeled ? ', выбрано' : ', правильный ответ' : ''}`} disabled={(answer !== null && answer !== undefined) || (labeled && note < 0)} onClick={() => onChoose(value)}>{content}</button> : <div className={`fret-cell ${fret === 0 ? 'open-string' : ''}`} key={fret} aria-label={marked ? `Отмечено: ${label}` : undefined}>{content}</div>;
    })}</React.Fragment>)}
  </div><p className="fret-legend">1 — тонкая струна сверху · 6 — толстая снизу</p></div>;
}
function App() {
  const [mode, setMode] = useState(() => {
    try { const saved = localStorage.getItem('nota-mode'); return saved !== null && ['0', '1', '2', '3'].includes(saved) ? Number(saved) : 0; } catch { return 0; }
  });
  function changeMode(value: number) {
    setMode(value);
    try { localStorage.setItem('nota-mode', String(value)); } catch { /* Keep the mode for this visit. */ }
  }
  return <Trainer key={mode} mode={mode} onModeChange={changeMode} />;
}
function Trainer({ mode, onModeChange }: { mode: number; onModeChange: (mode: number) => void }) {
  const storageKey = MODES[mode].key;
  const [progress, setProgress] = useState(() => readProgress(storageKey));
  const range = 3;
  const count = GUITAR_NOTES.length;
  const [index, setIndex] = useState(() => pickNote(progress.mistakes, count));
  const [answer, setAnswer] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  useEffect(() => {
    if (!successMessage) return;
    const timeout = window.setTimeout(() => setSuccessMessage(''), 1500);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);
  const [round, setRound] = useState(0);
  const noteChoices = useMemo(() => staffChoices(index), [index, round]);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [audioSettings] = useState(readAudio);
  const [sound, setSound] = useState(audioSettings?.enabled ?? false);
  const [volume, setVolume] = useState(audioSettings?.volume ?? 50);
  const [needsAudioChoice, setNeedsAudioChoice] = useState(audioSettings === null);
  const [audioPreview, setAudioPreview] = useState(0);
  useEffect(() => {
    if (!audioPreview) return;
    const timeout = window.setTimeout(() => setAudioPreview(0), 3300);
    return () => window.clearTimeout(timeout);
  }, [audioPreview]);
  const [answerOrder, setAnswerOrder] = useState(() => shuffleAnswers());
  const welcomeDialog = useRef<HTMLDialogElement>(null);
  const masterGain = useRef<GainNode | null>(null);
  const guitarVoice = useRef<{ source: AudioBufferSourceNode; gain: GainNode } | null>(null);
  useEffect(() => () => { void audio.current?.close(); }, []);
  useEffect(() => {
    if (needsAudioChoice && !welcomeDialog.current?.open) welcomeDialog.current?.showModal();
  }, [needsAudioChoice]);
  useEffect(() => {
    if (masterGain.current && audio.current) masterGain.current.gain.setTargetAtTime(sound ? volume / 100 : 0, audio.current.currentTime, 0.02);
    if (!needsAudioChoice) {
      try { localStorage.setItem('nota-audio', JSON.stringify({ enabled: sound, volume })); } catch { /* Preferences remain active for this visit. */ }
    }
  }, [sound, volume, needsAudioChoice]);
  function selectAudio(enabled: boolean) {
    setSound(enabled); setNeedsAudioChoice(false); welcomeDialog.current?.close();
    if (enabled) {
      const previewVolume = volume > 0 ? volume : 50;
      setVolume(previewVolume);
      setAudioPreview(Date.now());
      void play(14, previewVolume);
    }
  }
  const [hint, setHint] = useState(false);
  const [cheatOpen, setCheatOpen] = useState(false);
  const [cheatNote, setCheatNote] = useState(14);
  const usedHint = useRef(false);
  const [storageError, setStorageError] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const locked = useRef(false);
  const nextButton = useRef<HTMLButtonElement>(null);
  const firstAnswer = useRef<HTMLButtonElement>(null);
  const [started, setStarted] = useState(false);
  const [timedAnswers, setTimedAnswers] = useState<TimedAnswer[]>([]);

  const [newRecord, setNewRecord] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const micWrong = useRef(false);
  const recognitionClock = useRef(new RecognitionClock());
  const timing = sessionTiming(timedAnswers);
  const running = started && !finished && answer === null && (mode !== 3 || (micActive && micReady));
  useEffect(() => {
    recognitionClock.current.reset(performance.now(), false);

  }, [index, round, started, range]);
  useEffect(() => {
    if (!running) return;
    const clock = recognitionClock.current;
    const sync = () => {
      if (document.hidden || needsAudioChoice) clock.pause(performance.now(), true);
      else clock.resume(performance.now());

    };
    sync();
    document.addEventListener('visibilitychange', sync);

    return () => {
      clock.pause(performance.now());
      document.removeEventListener('visibilitychange', sync);

    };
  }, [running, needsAudioChoice, index, round, range]);
  async function play(noteIndex = index, previewVolume?: number, pianoMidi?: number) {
    if (previewVolume === undefined && (!sound || volume === 0 || needsAudioChoice || (mode === 3 && pianoMidi === undefined))) return;
    try {
      const ctx = audio.current ?? new AudioContext(); audio.current = ctx;
      await ctx.resume();
      if (!masterGain.current) {
        masterGain.current = ctx.createGain();
        masterGain.current.connect(ctx.destination);
      }
      masterGain.current.gain.value = (previewVolume ?? volume) / 100;
      const previous = guitarVoice.current;
      if (previous) {
        previous.gain.gain.cancelScheduledValues(ctx.currentTime);
        previous.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
        previous.source.stop(ctx.currentTime + 0.08);
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = guitarBuffer(ctx, pianoMidi ?? NOTES[noteIndex].midi - 12);
      source.connect(gain); gain.connect(masterGain.current);
      guitarVoice.current = { source, gain };
      source.onended = () => {
        source.disconnect(); gain.disconnect();
        if (guitarVoice.current?.source === source) guitarVoice.current = null;
      };
      source.start(); setAudioError(false);
    } catch { setAudioError(true); }
  }
  function choose(value: number) {
    if (locked.current || needsAudioChoice || !started) return;
    locked.current = true;
    setAnswer(value); void play();
    const correct = mode === 0 ? isCorrectAnswer(value, index) : value === index;
    const clean = correct && (mode !== 3 || !micWrong.current);
    const assisted = usedHint.current || cheatOpen;
    recognitionClock.current.pause(performance.now());
    const ms = recognitionClock.current.elapsed(performance.now());

    const attempts = [...timedAnswers, { ms, correct: clean, assisted, interrupted: recognitionClock.current.interrupted }];
    setTimedAnswers(attempts);
    const speed = recordSpeed(progress.speed, index, range, attempts);
    setNewRecord(speed.best[range] !== progress.speed.best[range]);
    const updated = { ...progress, speed, total: progress.total + 1, correct: progress.correct + Number(clean), sessions: progress.sessions + Number(round === 9), notes: recordNote(progress.notes, index, clean, assisted), mistakes: progress.mistakes.map((n, i) => i === index ? Math.max(0, n + (clean && !assisted ? -1 : 2)) : n) };
    setProgress(updated); setScore(s => s + Number(clean));
    if (mode === 3) setMicReady(false);
    micWrong.current = false;
    try { localStorage.setItem(storageKey, JSON.stringify(updated)); setStorageError(false); } catch { setStorageError(true); }
    if (correct) {
      setSuccessMessage(`Предыдущая нота — ${NOTES[index].name} (${NOTES[index].letter}). Верно!`);
      usedHint.current = cheatOpen;
      setHint(false);
      if (round === 9) {
        setFinished(true);
      } else {
        setRound(r => r + 1);
        setIndex(pickNote(updated.mistakes, count, index));
        setAnswerOrder(order => shuffleAnswers(order));
        setAnswer(null);
        requestAnimationFrame(() => {
          locked.current = false;
          firstAnswer.current?.focus();
        });
      }
    } else {
      setSuccessMessage('');
      requestAnimationFrame(() => nextButton.current?.focus());
    }
  }
  function next() {
    setSuccessMessage('');
    usedHint.current = cheatOpen;
    if (round === 9) { setFinished(true); return; }
    setAnswerOrder(order => shuffleAnswers(order));
    setRound(r => r + 1); setIndex(pickNote(progress.mistakes, count, index)); setAnswer(null); setHint(false); locked.current = false;
    requestAnimationFrame(() => firstAnswer.current?.focus());
  }
  function restart() {
    micWrong.current = false;
    setStarted(false); setTimedAnswers([]); setNewRecord(false);
    setSuccessMessage('');
    setAnswerOrder(order => shuffleAnswers(order));
    usedHint.current = cheatOpen;
    setRound(0); setScore(0); setAnswer(null); setHint(false); setFinished(false); setIndex(pickNote(progress.mistakes, count, index)); locked.current = false;
  }
  function resetProgress() {
    if (!window.confirm(`Сбросить статистику режима «${MODES[mode].label}» и начать тренировку заново? Остальные режимы и настройки звука сохранятся.`)) return;
    const cleared = fresh();
    setProgress(cleared);
    restart();
    setIndex(pickNote(cleared.mistakes, count));
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem('nota-range');
      setStorageError(false);
    } catch { setStorageError(true); }
  }
  const accuracy = progress.total ? Math.round(progress.correct / progress.total * 100) : 0;
  return <div className="shell">
    <dialog ref={welcomeDialog} className="welcome-dialog" aria-labelledby="welcome-title" aria-describedby="welcome-description" onCancel={event => { event.preventDefault(); selectAudio(false); }}>
      <div className="eyebrow">ПЕРЕД ПЕРВОЙ НОТОЙ</div>
      <h2 id="welcome-title">Занимаемся со звуком?</h2>
      <p id="welcome-description">Нажми «Включить звук» — прозвучит пример гитарной ноты. В тренировках звук сопровождает ответы, а в режиме с микрофоном звучит короткий сигнал успеха. Громкость можно изменить в любой момент.</p>
      <div className="welcome-actions"><button autoFocus className="primary" onClick={() => selectAudio(true)}>Включить звук</button><button className="answer" onClick={() => selectAudio(false)}>Без звука</button></div>
    </dialog>
    <header><a className="brand" href="./" aria-label="Нота, главная"><span className="brand-icon">♪</span> нота<span className="brand-dot">.</span></a><button className={`sound ${sound ? '' : 'muted'}`} onClick={() => setSound(v => !v)} aria-pressed={sound} aria-label={sound ? 'Выключить звук' : 'Включить звук'}><span aria-hidden="true">{sound ? '♫' : '♩'}</span><span>Звук {sound ? 'вкл' : 'выкл'}</span></button><label className="volume-control"><span>Громкость</span><input type="range" min="0" max="100" step="1" value={volume} onChange={event => setVolume(Number(event.target.value))} aria-label="Громкость звука" /><output>{volume}%</output></label><button className="text-button audio-choice-button" onClick={() => setNeedsAudioChoice(true)}>Выбрать звук</button></header>
    <main>
      <section className="intro"><div className="eyebrow"><span /> НЕМНОГО ПРАКТИКИ КАЖДЫЙ ДЕНЬ</div><h1>Подружись с нотами</h1><p>Учись читать музыку в своём темпе.<br className="mobile-break" /> Одна нота за раз.</p></section>
      <div className="workspace">
        <section className="exercise" aria-label="Тренировка">
          <nav className="mode-picker" aria-label="Режим тренировки">{MODES.map((item, i) => <button key={item.key} aria-pressed={mode === i} onClick={() => onModeChange(i)}>{item.label}{i === 3 && <small className="mic-permission-label">Нужен доступ к микрофону</small>}</button>)}</nav>
          <p className="mode-note">При смене режима начинается новая тренировка. Прогресс каждого режима сохраняется отдельно.</p>
<div className="guitar-range"><strong>Гитара · первые три лада</strong><span>Ми · 6-я открытая → Соль · 1-я, 3-й лад</span><small>Стандартный строй · Только ноты без диезов и бемолей</small></div>
          
          <div className="answer-notice" role="status" aria-live="polite" aria-atomic="true">{successMessage && <span key={round}>{successMessage}</span>}</div>
          {!started ? <div className="timer-start"><div className="eyebrow">В СВОЁМ ТЕМПЕ</div><h2>Готов к 10 нотам?</h2><p>{MODES[mode].instruction} Занимайся в удобном ритме — здесь можно ошибаться.</p><button className="primary" onClick={() => { usedHint.current = cheatOpen; setStarted(true); }}>Начать тренировку →</button></div> : finished ? <div className="results"><div className="result-icon">✓</div><div className="eyebrow">ТРЕНИРОВКА ЗАВЕРШЕНА</div><h2>{score === 10 ? 'Все ноты на месте!' : 'Ещё на шаг ближе'}</h2><p>Каждая попытка помогает запомнить музыку.</p><div className="result-score">{score}<span> / 10</span></div><p>{mode === 3 ? 'нот без поиска другого звука' : 'правильных ответов'}</p><div className="session-speed"><strong>{seconds(timing.total)}</strong><span>на все ответы · в среднем {seconds(timing.average)} на ноту</span><p>{newRecord ? 'Новый личный рекорд!' : timing.eligible ? 'Отличная чистая тренировка!' : 'Для рекорда нужны 10 верных ответов без подсказок и перерывов.'}</p></div><button className="primary" onClick={restart}>Ещё 10 нот <span>→</span></button><small>Ноты, которые вызвали трудности, повторим чаще.</small></div> : <>
            <div className="exercise-top"><span className="lesson-label">01 <span>{MODES[mode].label}</span></span><span className="counter">{round + 1}<span> / 10</span></span></div>
            <div className="progress-track" role="progressbar" aria-label="Прогресс тренировки" aria-valuenow={round + Number(answer !== null)} aria-valuemin={0} aria-valuemax={10}><div style={{ width: `${(round + Number(answer !== null)) * 10}%` }} /></div>
            <div className="question"><h2>{MODES[mode].question}</h2><p>{MODES[mode].instruction}</p></div>
            {mode === 2 ? <Fretboard target={index} /> : <Staff index={index} reveal={answer !== null || hint} />}
            {mode !== 2 && <div className="notation-label">СКРИПИЧНЫЙ КЛЮЧ · ГИТАРА</div>}
            {mode === 0 ? <div className="answers">{answerOrder.map((i, position) => <button ref={position === 0 ? firstAnswer : undefined} key={NOTES[i].letter} disabled={answer !== null} className={`answer ${answer !== null && isCorrectAnswer(i, index) ? 'correct' : ''} ${answer === i && !isCorrectAnswer(i, index) ? 'incorrect' : ''}`} onClick={() => choose(i)}>{NOTES[i].name} <span>({NOTES[i].letter})</span>{answer !== null && isCorrectAnswer(i, index) && <b aria-label="Правильный ответ"> ✓</b>}</button>)}</div>
            : mode === 3 ? <Microphone onEnableSound={() => { setSound(true); if (volume === 0) setVolume(50); }} onReady={ready => { if (!ready) recognitionClock.current.pause(performance.now()); setMicReady(ready); }} target={NOTES[index].midi - 12} sound={sound} volume={volume} paused={needsAudioChoice || audioPreview > 0 || cheatOpen || hint} onMatch={() => choose(index)} onWrong={() => { micWrong.current = true; }} onActive={active => { if (!active && micActive) recognitionClock.current.pause(performance.now(), true); setMicActive(active); }} />
            : mode === 1 ? <Fretboard target={answer !== null || hint ? index : null} answer={answer} onChoose={choose} firstButton={firstAnswer} />
            : <div className="staff-choices">{noteChoices.map((i, position) => <button ref={position === 0 ? firstAnswer : undefined} key={i} disabled={answer !== null} className={`answer staff-choice ${answer !== null && i === index ? 'correct' : ''} ${answer === i && i !== index ? 'incorrect' : ''}`} onClick={() => choose(i)} aria-label={`Вариант ${position + 1}. ${NOTES[i].hint}`}><Staff index={i} reveal={answer !== null} /><span>{answer !== null && i === index ? '✓ Верная нота' : `Вариант ${position + 1}`}</span></button>)}</div>}
            <div className="feedback" aria-live="polite">{answer !== null ? <><div className={(mode === 0 ? isCorrectAnswer(answer, index) : answer === index) ? 'feedback-title success' : 'feedback-title'}>{(mode === 0 ? isCorrectAnswer(answer, index) : answer === index) ? 'Верно, это ' : 'Это '}{NOTES[index].name} ({NOTES[index].letter}){(mode === 0 ? isCorrectAnswer(answer, index) : answer === index) ? '!' : '. Запомним вместе.'}</div><p>{NOTES[index].hint} {guitarPositions(NOTES[index].midi)}.</p><div className="feedback-actions"><button className="text-button" disabled={!sound || mode === 3} onClick={() => void play()}>♫ Послушать</button><button ref={nextButton} className="primary" onClick={next}>{round === 9 ? 'К результатам' : 'Следующая нота'} <span>→</span></button></div></> : <><button className="text-button hint-button" onClick={() => { usedHint.current = true; setHint(v => !v); }} aria-expanded={hint}>ⓘ {hint ? 'Скрыть подсказку' : 'Нужна подсказка?'}</button>{hint ? <p>{NOTES[index].hint} Это {NOTES[index].name} ({NOTES[index].letter}). {guitarPositions(NOTES[index].midi)}.</p> : <p className="encouragement">Без спешки. Здесь можно ошибаться.</p>}</>}</div>
          </>}
        </section>
        <aside><section className="side-card"><div className="eyebrow">{MODES[mode].label.toUpperCase()}</div><h3>Маленькие шаги,<br />заметный прогресс</h3><div className="stats"><div><strong>{progress.sessions}</strong><span>тренировок</span></div><div><strong>{progress.total ? `${accuracy}%` : '—'}</strong><span>{mode === 3 ? 'без поиска' : 'точность'}</span></div></div><p>{progress.total ? `Уже ${progress.total} ${progress.total === 1 ? 'ответ' : 'ответов'}. Продолжай в своём ритме.` : 'Первая нота — начало. Давай попробуем?'}</p><div className="local-note">{storageError ? 'Не удалось сохранить прогресс в браузере.' : 'Прогресс сохраняется в этом браузере'}</div></section>
        <Piano onPlay={midi => {
          if (!sound || volume === 0 || needsAudioChoice) return;
          setAudioPreview(Date.now());
          void play(index, undefined, midi);
        }} />
        </aside>
      </div>
      <section className="cheatsheet">
        <button className="cheatsheet-toggle" aria-expanded={cheatOpen} aria-controls="cheatsheet-content" onClick={() => {
          if (!cheatOpen && answer === null && !finished) usedHint.current = true;
          setCheatOpen(open => !open);
        }}><span>Шпаргалка <small>Ноты на стане и их названия</small></span><Chevron /></button>
        <div id="cheatsheet-content" hidden={!cheatOpen}>
          {mode !== 0 && <div className="guitar-cheatsheet">
            <h3>Ноты на грифе</h3>
            <p>{mode === 1 ? 'Найди ноту на стане, затем посмотри, где она находится на грифе.' : 'Выбери место на грифе — ниже появится соответствующая нота на стане.'} Нажми на подпись, чтобы посмотреть и послушать ноту.</p>
            <Fretboard labeled target={cheatNote} onChoose={note => { setCheatNote(note); void play(note); }} />
            <div className="cheat-note-preview"><Staff index={cheatNote} reveal /><div><h3>{NOTES[cheatNote].name} ({NOTES[cheatNote].letter})</h3><p>{guitarPositions(NOTES[cheatNote].midi)}</p><p>{NOTES[cheatNote].hint}</p><button className="text-button" disabled={!sound || mode === 3} onClick={() => void play(cheatNote)}>♫ Послушать ещё</button></div></div>
            <p className="knowledge-footnote">Пустые места — ноты с диезами или бемолями, их пока пропускаем. Нумерация струн идёт от тонкой к толстой.</p>
          </div>}
          <p className="cheatsheet-intro">Скрипичный ключ · Гитара · первые три лада. Линейки считаем снизу вверх. Запись на октаву выше звучания, как в гитарных партиях. Открытая струна — лад 0.</p>
          <div className="cheatsheet-notes">{GUITAR_NOTES.map(i => <article key={NOTES[i].midi}>
            <Staff index={i} reveal />
            <h3>{NOTES[i].name} <span>({NOTES[i].letter})</span></h3>
            <p>{guitarPositions(NOTES[i].midi)}</p><p>{NOTES[i].hint}</p>
          </article>)}</div>
          <p className="cheatsheet-tip">Буквы идут от ля: A — Ля, B — Си, C — До, D — Ре, E — Ми, F — Фа, G — Соль.</p>
          <p className="knowledge-footnote">Если открыть шпаргалку во время задания, ответ будет учтён с подсказкой, даже если потом её закрыть.</p>
        </div>
      </section>
      <details className="knowledge compact-knowledge">
        <summary><span>Мой прогресс · {MODES[mode].label} <small>Хорошо помню: {GUITAR_NOTES.filter(i => mastery(progress.notes[i]).level === 'good').length} из {count} нот</small></span><Chevron /></summary>
        <p className="knowledge-description">Полосы показывают точность последних 10 ответов без подсказки. Оценка появляется после 5 самостоятельных попыток: от 80% — «Помню хорошо», от 50% — «Закрепляю», ниже — «Стоит повторить». Скорость — среднее последних 10 верных ответов без подсказок и перерывов.</p>
        {progress.total > progress.notes.reduce((sum, n) => sum + n.correct + n.wrong + n.assisted, 0) && <p className="migration-note">Общая статистика сохранена. Подробный прогресс по нотам собирается с этого обновления.</p>}
        <div className="knowledge-grid">{GUITAR_NOTES.map(i => { const note = NOTES[i];
          const stats = progress.notes[i];
          const state = mastery(stats);
          return <article className={`knowledge-note ${state.level}`} key={note.midi}>
            <div className="knowledge-heading"><h3>{note.name} <span>({note.letter})</span></h3><strong>{state.level === 'new' ? '—' : `${state.recentPercent}%`}</strong></div>
            <div className="knowledge-meter" role="progressbar" aria-label={`Освоение ноты ${note.name}, ${guitarPositions(note.midi)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.level === 'new' ? 0 : state.recentPercent ?? 0} aria-valuetext={state.level === 'new' ? `${state.label}. Самостоятельных попыток: ${state.attempts} из 5 необходимых` : `${state.recentPercent}%. ${state.label}`}><div style={{ width: `${state.level === 'new' ? 0 : state.recentPercent ?? 0}%` }} /></div>
            <div className="mastery-label">{state.label}</div>
            <p><span className="note-position">{guitarPositions(note.midi)}</span>{state.level === 'new' ? `Попыток: ${state.attempts}/5 · ` : ''}Верно: {stats.correct}/{state.attempts} · Подсказок: {stats.assisted}{progress.speed.notes[i].length > 0 && <> · Скорость: {seconds(progress.speed.notes[i].reduce((sum, ms) => sum + ms, 0) / progress.speed.notes[i].length)}</>}</p>
          </article>;
        })}</div>
        <div className="speed-records"><h3>Рекорды · 10 верных ответов</h3><p><span>{MODES[mode].label}</span><strong>{progress.speed.best[range] === null ? '—' : seconds(progress.speed.best[range]!)}</strong></p><small>Без подсказок и перерывов. Время чтения разбора не учитывается.</small></div><div className="progress-reset"><button className="text-button" onClick={resetProgress}>Сбросить прогресс режима</button></div>
      </details>
      {audioError && <p role="status">Не удалось воспроизвести звук. Попробуй нажать «Послушать» ещё раз.</p>}
    </main><footer><span>с ❤️ от Yunki для Kaada</span></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
