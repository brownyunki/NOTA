import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch } from './pitch.ts';
import { TUNINGS, targetFrequency, tuningCents } from './tuner-math.ts';

test('tuner measures sharp and flat strings including low Drop C at mobile sample rates', () => {
  for (const rate of [44100, 48000]) for (const midi of new Set(Object.values(TUNINGS).flatMap(tuning => tuning.notes))) for (const cents of [-90, -20, 0, 20, 90]) {
    const frequency = targetFrequency(midi) * 2 ** (cents / 1200);
    const data = Float32Array.from({ length: 8192 }, (_, i) => {
      const phase = 2 * Math.PI * frequency * i / rate;
      return 0.08 * Math.sin(phase) + 0.12 * Math.sin(phase * 2) + 0.04 * Math.sin(phase * 3);
    });
    const pitch = detectPitch(data, rate, 0.002, 45);
    assert.ok(pitch, `missing ${midi}, ${cents}, ${rate}`);
    assert.ok(Math.abs(tuningCents(pitch.frequency, midi) - cents) < 5, `inaccurate ${midi}, ${cents}, ${rate}`);
  }
});
test('tuner never folds another octave into an in-tune reading', () => {
  assert.equal(tuningCents(targetFrequency(48), 36), 1200);
  assert.equal(tuningCents(targetFrequency(36), 48), -1200);
});
