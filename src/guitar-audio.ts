// A plucked string: a brief pick transient, bright harmonics that fade quickly,
// and a longer fundamental. Buffers are reused across exercises.
const buffers = new Map<string, AudioBuffer>();

export function guitarBuffer(ctx: AudioContext, midi: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${midi}`;
  const cached = buffers.get(key);
  if (cached) return cached;

  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const duration = 3;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const harmonics = Array.from({ length: 18 }, (_, i) => {
    const n = i + 1;
    return {
      frequency: frequency * n,
      amplitude: Math.sin(Math.PI * n * 0.21) / n ** 1.25,
      decay: 1.5 + n * 0.6 + frequency / 1500,
      phase: n * 0.17,
    };
  }).filter(h => h.frequency < ctx.sampleRate * 0.45);

  // Advance each decaying oscillator by recurrence instead of evaluating
  // sin/exp millions of times on the first tap of each note.
  for (const h of harmonics) {
    const angle = 2 * Math.PI * h.frequency / ctx.sampleRate;
    const decay = Math.exp(-h.decay / ctx.sampleRate);
    const realStep = Math.cos(angle) * decay, imaginaryStep = Math.sin(angle) * decay;
    let real = h.amplitude * Math.cos(h.phase), imaginary = h.amplitude * Math.sin(h.phase);
    for (let i = 0; i < data.length; i++) {
      data[i] += imaginary;
      const nextReal = real * realStep - imaginary * imaginaryStep;
      imaginary = imaginary * realStep + real * imaginaryStep;
      real = nextReal;
    }
  }
  let noise = 0;
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / ctx.sampleRate;
    const attack = Math.min(1, t / 0.003);
    const release = Math.min(1, (duration - t) / 0.08);
    noise = noise * 0.65 + (Math.random() * 2 - 1) * 0.35;
    const pick = noise * 0.13 * Math.exp(-t * 95);
    const body = (Math.sin(2 * Math.PI * 105 * t) + 0.5 * Math.sin(2 * Math.PI * 210 * t)) * 0.045 * Math.exp(-t * 22);
    data[i] = (data[i] + pick + body) * attack * release;
    peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] *= 0.38 / peak;
  buffers.set(key, buffer);
  return buffer;
}
