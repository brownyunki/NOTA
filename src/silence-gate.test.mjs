import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SilenceGate } from './silence-gate.ts';
import { RecognitionClock } from './timing.ts';

test('ringing string remains blocked regardless of how long it lasts', () => {
  const gate = new SilenceGate();
  for (let t = 0; t <= 10000; t += 80) assert.equal(gate.update(0.02, t), false);
  assert.equal(gate.update(0.002, 10100), false);
  assert.equal(gate.update(0.002, 10399), false);
  assert.equal(gate.update(0.002, 10400), true);
  assert.equal(gate.update(0.2, 10500), true);
});
test('brief quiet gaps do not count as damping and reset closes the gate', () => {
  const gate = new SilenceGate();
  gate.update(0, 0);
  assert.equal(gate.update(0.02, 250), false);
  assert.equal(gate.update(0, 300), false);
  assert.equal(gate.update(0, 550), false);
  assert.equal(gate.update(0, 600), true);
  gate.reset();
  assert.equal(gate.ready, false);
  assert.equal(gate.update(0.05, 700), false);
});
test('recognition timing starts after quiet, excluding previous string decay', () => {
  const gate = new SilenceGate();
  const clock = new RecognitionClock();
  clock.reset(0, false);
  gate.update(0.1, 3000);
  gate.update(0, 4000);
  if (gate.update(0, 4300)) clock.resume(4300);
  clock.pause(5300);
  assert.equal(clock.elapsed(5300), 1000);
  assert.equal(clock.interrupted, false);
});
