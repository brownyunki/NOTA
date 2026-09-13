export type TimedAnswer = { ms: number; correct: boolean; assisted: boolean; interrupted: boolean };
export type SpeedProgress = { best: (number | null)[]; notes: number[][] };
export const emptySpeed = (): SpeedProgress => ({ best: [null, null, null, null], notes: Array.from({ length: 19 }, () => []) });
export function readSpeed(value: unknown): SpeedProgress {
  const result = emptySpeed();
  if (!value || typeof value !== 'object') return result;
  const v = value as Record<string, unknown>;
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  if (Array.isArray(v.best) && [3, 4].includes(v.best.length)) result.best = result.best.map((_, i) => valid((v.best as unknown[])[i]) ? (v.best as number[])[i] : null);
  if (Array.isArray(v.notes) && [14, 19].includes(v.notes.length)) result.notes = result.notes.map((_, i) => { const n = (v.notes as unknown[])[i]; return Array.isArray(n) ? n.filter(valid).slice(-10) : []; });
  return result;
}
export function sessionTiming(answers: TimedAnswer[]) {
  const total = answers.reduce((sum, a) => sum + a.ms, 0);
  const eligible = answers.length === 10 && answers.every(a => a.correct && !a.assisted && !a.interrupted && a.ms > 0);
  return { total, average: answers.length ? total / answers.length : 0, eligible };
}
export function recordSpeed(speed: SpeedProgress, note: number, range: number, answers: TimedAnswer[]): SpeedProgress {
  const last = answers.at(-1);
  if (!last) return speed;
  const summary = sessionTiming(answers);
  return {
    notes: speed.notes.map((samples, i) => i === note && last.correct && !last.assisted && !last.interrupted ? [...samples, last.ms].slice(-10) : samples),
    best: speed.best.map((best, i) => i === range && summary.eligible && (best === null || summary.total < best) ? summary.total : best),
  };
}
export const seconds = (ms: number): string => `${(ms / 1000).toFixed(1).replace('.', ',')} с`;

export class RecognitionClock {
  private start: number | null = null;
  private accumulated = 0;
  interrupted = false;
  reset(now: number, running: boolean) { this.accumulated = 0; this.start = running ? now : null; this.interrupted = false; }
  resume(now: number) { if (this.start === null) this.start = now; }
  pause(now: number, interrupted = false) {
    if (this.start !== null) this.accumulated += Math.max(0, now - this.start);
    this.start = null;
    this.interrupted ||= interrupted;
  }
  elapsed(now: number) { return this.accumulated + (this.start === null ? 0 : Math.max(0, now - this.start)); }
}
