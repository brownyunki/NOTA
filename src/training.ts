// Existing note IDs are retained to preserve saved recognition statistics.
export const GUITAR_NOTES = [14, 15, 16, 17, 18, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const OPEN_STRINGS = [64, 59, 55, 50, 45, 40];
export function fretMidi(string: number, fret: number): number {
  return OPEN_STRINGS[string - 1] + fret + 12;
}
export function staffChoices(target: number): number[] {
  const others = GUITAR_NOTES.filter(i => i !== target);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const choices = [target, ...others.slice(0, 3)];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}
export function guitarPositions(writtenMidi: number): string {
  return OPEN_STRINGS.flatMap((open, i) => {
    const fret = writtenMidi - 12 - open;
    return fret >= 0 && fret <= 3 ? [`${i + 1}-я струна · ${fret === 0 ? 'открытая' : `${fret}-й лад`}`] : [];
  }).join(' / ');
}

export function pickNote(mistakes: number[], count: number, previous = -1): number {
  const indices = GUITAR_NOTES.slice(0, count);
  const weights = indices.map(i => i === previous ? 0 : 1 + Math.min(mistakes[i] ?? 0, 4));
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) { roll -= weights[i]; if (roll < 0) return indices[i]; }
  return indices[0];
}

export function isCorrectAnswer(answer: number, note: number): boolean {
  return answer === (note >= 14 ? note - 12 : note) % 7;
}
