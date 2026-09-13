export type NoteProgress = { correct: number; wrong: number; assisted: number; recent: boolean[] };
export const emptyNotes = (): NoteProgress[] => Array.from({ length: 19 }, () => ({ correct: 0, wrong: 0, assisted: 0, recent: [] }));

export function readNotes(value: unknown): NoteProgress[] {
  if (!Array.isArray(value) || ![7, 14, 19].includes(value.length)) return emptyNotes();
  return emptyNotes().map((_, index) => {
    const item: unknown = value[index];
    if (typeof item !== 'object' || item === null) return emptyNotes()[0];
    const n = item as Record<string, unknown>;
    if (![n.correct, n.wrong, n.assisted].every(v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0)
      || !Array.isArray(n.recent) || !n.recent.every(v => typeof v === 'boolean')) return emptyNotes()[0];
    return { correct: n.correct as number, wrong: n.wrong as number, assisted: n.assisted as number, recent: n.recent.slice(-10) };
  });
}

export function recordNote(notes: NoteProgress[], index: number, correct: boolean, assisted: boolean): NoteProgress[] {
  return notes.map((n, i) => i !== index ? n : {
    correct: n.correct + Number(correct && !assisted),
    wrong: n.wrong + Number(!correct && !assisted),
    assisted: n.assisted + Number(assisted),
    recent: assisted ? n.recent : [...n.recent, correct].slice(-10),
  });
}

export function mastery(note: NoteProgress) {
  const attempts = note.correct + note.wrong;
  const percent = attempts ? Math.round(note.correct / attempts * 100) : null;
  const recentPercent = note.recent.length ? Math.round(note.recent.filter(Boolean).length / note.recent.length * 100) : null;
  const level = note.recent.length < 5 ? 'new' : recentPercent! >= 80 ? 'good' : recentPercent! >= 50 ? 'learning' : 'repeat';
  const label = level === 'new' ? (attempts || note.assisted ? 'Мало данных' : 'Ещё не пробовали') : level === 'good' ? 'Помню хорошо' : level === 'learning' ? 'Закрепляю' : 'Стоит повторить';
  return { attempts, percent, recentPercent, level, label };
}
