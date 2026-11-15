export const TUNINGS = {
  standard: { label: 'Стандартный', notes: [40, 45, 50, 55, 59, 64] },
  dropC: { label: 'Drop C', notes: [36, 43, 48, 53, 57, 62] },
};
export function targetFrequency(midi: number) { return 440 * 2 ** ((midi - 69) / 12); }
export function tuningCents(frequency: number, midi: number) {
  return 1200 * Math.log2(frequency / targetFrequency(midi));
}
