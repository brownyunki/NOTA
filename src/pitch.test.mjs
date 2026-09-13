import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch } from './pitch.ts';

function signal(midi, rate, detune = 0) {
  const frequency = 440 * 2 ** ((midi - 69 + detune / 100) / 12);
  return Float32Array.from({ length: 4096 }, (_, i) => {
    const t = i / rate;
    return (0.15 * Math.sin(2 * Math.PI * frequency * t) + 0.2 * Math.sin(4 * Math.PI * frequency * t) + 0.08 * Math.sin(6 * Math.PI * frequency * t)) * Math.exp(-t * 3);
  });
}
test('recognizes every guitar pitch at mobile audio sample rates despite strong harmonics', () => {
  for (const rate of [44100, 48000]) for (const midi of [40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67]) {
    const pitch = detectPitch(signal(midi, rate), rate);
    assert.ok(pitch, `No pitch for ${midi} at ${rate}`);
    assert.equal(pitch.midi, midi);
    assert.ok(Math.abs(pitch.cents) < 10, `Tuning error ${pitch.cents}`);
  }
});
test('silence and quiet background do not count as notes', () => {
  assert.equal(detectPitch(new Float32Array(4096), 48000), null);
  assert.equal(detectPitch(Float32Array.from({ length: 4096 }, (_, i) => 0.001 * Math.sin(i)), 48000), null);
});
test('reports detuning and distinguishes octaves', () => {
  const low = detectPitch(signal(40, 48000, 25), 48000);
  assert.equal(low.midi, 40);
  assert.ok(Math.abs(low.cents - 25) < 5);
  assert.equal(detectPitch(signal(52, 48000), 48000).midi, 52);
});

test('broadband noise is not promoted to a confident pitch', () => {
  let seed = 42;
  const data = Float32Array.from({ length: 4096 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 4294967296 - 0.5) * 0.1;
  });
  assert.equal(detectPitch(data, 48000), null);
});
