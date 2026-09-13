import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sensitivity } from './calibration.ts';
import { detectPitch } from './pitch.ts';
import { SilenceGate } from './silence-gate.ts';

test('quiet guitar becomes detectable after calibration without accepting background', () => {
  const config = sensitivity(0.0001, 0.002);
  assert.ok(config);
  assert.ok(config.detection < 0.002);
  const data = Float32Array.from({ length: 4096 }, (_, i) => 0.0028 * Math.sin(2 * Math.PI * 82.4069 * i / 48000));
  assert.equal(detectPitch(data, 48000), null);
  assert.equal(detectPitch(data, 48000, config.detection).midi, 40);
  assert.equal(detectPitch(new Float32Array(4096).fill(0.0001), 48000, config.detection), null);
  const gate = new SilenceGate();
  assert.equal(gate.update(0.002, 0, config.silence), false);
  assert.equal(gate.update(0.0001, 100, config.silence), false);
  assert.equal(gate.update(0.0001, 400, config.silence), true);
});
test('noise-dominated calibration is rejected and loud signals retain a margin', () => {
  assert.equal(sensitivity(0.01, 0.02), null);
  const config = sensitivity(0.0001, 0.1);
  assert.ok(config.silence < config.detection);
  assert.ok(config.detection < 0.1);
});
