export type Pitch = { midi: number; cents: number; frequency: number; level: number };
export function detectPitch(input: Float32Array, sampleRate: number): Pitch | null {
  const step = Math.max(1, Math.floor(sampleRate / 12000));
  const samples = new Float32Array(Math.floor(input.length / step));
  let energy = 0;
  for (let i = 0; i < samples.length; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += input[i * step + j];
    samples[i] = sum / step;
    energy += samples[i] ** 2;
  }
  const level = Math.sqrt(energy / samples.length);
  if (level < 0.006) return null;
  const rate = sampleRate / step;
  const maxLag = Math.min(Math.floor(rate / 65), Math.floor(samples.length / 2));
  const minLag = Math.floor(rate / 420);
  const size = samples.length - maxLag;
  const difference = new Float32Array(maxLag + 1);
  let cumulative = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += (samples[i] - samples[i + lag]) ** 2;
    cumulative += sum;
    difference[lag] = cumulative ? sum * lag / cumulative : 1;
  }
  for (let lag = minLag; lag < maxLag - 1; lag++) {
    if (difference[lag] > 0.14) continue;
    while (lag + 1 < maxLag && difference[lag + 1] < difference[lag]) lag++;
    const a = difference[lag - 1], b = difference[lag], c = difference[lag + 1];
    if (c === undefined) return null;
    const offset = (a - c) / (2 * (a - 2 * b + c) || 1);
    const frequency = rate / (lag + Math.max(-1, Math.min(1, offset)));
    const rawMidi = 69 + 12 * Math.log2(frequency / 440);
    const midi = Math.round(rawMidi);
    return { midi, cents: Math.round((rawMidi - midi) * 100), frequency, level };
  }
  return null;
}
export function heardName(midi: number): string {
  const names = ['До (C)', 'До♯ (C♯)', 'Ре (D)', 'Ре♯ (D♯)', 'Ми (E)', 'Фа (F)', 'Фа♯ (F♯)', 'Соль (G)', 'Соль♯ (G♯)', 'Ля (A)', 'Ля♯ (A♯)', 'Си (B)'];
  return names[((midi % 12) + 12) % 12];
}
