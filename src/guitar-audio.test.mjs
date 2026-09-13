import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guitarBuffer } from './guitar-audio.ts';

test('faster synthesis preserves the waveform and reuses generated buffers', () => {
  const sampleRate = 48000;
  const ctx = { sampleRate, createBuffer: (_, size) => {
    const data = new Float32Array(size);
    return { getChannelData: () => data };
  } };
  const random = Math.random;
  Math.random = () => 0.5; // Disable only the random pick noise for comparison.
  try {
    for (const midi of [40, 64, 67]) {
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      const expected = new Float32Array(sampleRate * 3);
      let peak = 0;
      for (let i = 0; i < expected.length; i++) {
        const t = i / sampleRate;
        let sample = 0;
        for (let n = 1; n <= 18; n++) {
          if (frequency * n >= sampleRate * 0.45) continue;
          sample += Math.sin(Math.PI * n * 0.21) / n ** 1.25 * Math.sin(2 * Math.PI * frequency * n * t + n * 0.17) * Math.exp(-t * (1.5 + n * 0.6 + frequency / 1500));
        }
        const body = (Math.sin(2 * Math.PI * 105 * t) + 0.5 * Math.sin(2 * Math.PI * 210 * t)) * 0.045 * Math.exp(-t * 22);
        expected[i] = (sample + body) * Math.min(1, t / 0.003) * Math.min(1, (3 - t) / 0.08);
        peak = Math.max(peak, Math.abs(expected[i]));
      }
      const buffer = guitarBuffer(ctx, midi);
      const actual = buffer.getChannelData(0);
      let difference = 0;
      for (let i = 0; i < expected.length; i++) difference = Math.max(difference, Math.abs(actual[i] - expected[i] * 0.38 / peak));
      assert.ok(difference < 0.000001, `Waveform changed for MIDI ${midi}: ${difference}`);
      assert.equal(guitarBuffer(ctx, midi), buffer);
    }
  } finally { Math.random = random; }
});
