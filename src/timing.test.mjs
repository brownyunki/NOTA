import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecognitionClock, emptySpeed, readSpeed, recordSpeed, sessionTiming } from './timing.ts';

const answers = (ms = 1000) => Array.from({ length: 10 }, () => ({ ms, correct: true, assisted: false, interrupted: false }));

test('octave records stay saved but do not become guitar records', () => {
  const previous = { best: [9000, 12000, 15000], notes: Array.from({ length: 14 }, () => [500]) };
  const migrated = readSpeed(previous);
  assert.deepEqual(migrated.best, [9000, 12000, 15000, null]);
  assert.equal(migrated.notes.length, 19);
  assert.deepEqual(migrated.notes[0], [500]);
  assert.deepEqual(migrated.notes[14], []);
  assert.equal(recordSpeed(migrated, 14, 3, answers()).best[3], 10000);
});

test('clock counts recognition time, excludes pauses and resets for each note', () => {
  const clock = new RecognitionClock();
  clock.reset(100, false);
  assert.equal(clock.elapsed(1000), 0);
  clock.resume(1000);
  clock.pause(2500, true);
  assert.equal(clock.elapsed(9000), 1500);
  clock.resume(9000);
  clock.pause(9500);
  assert.equal(clock.elapsed(10000), 2000);
  assert.equal(clock.interrupted, true);
  clock.reset(10000, true);
  assert.equal(clock.elapsed(10500), 500);
  assert.equal(clock.interrupted, false);
});

test('records require ten correct unassisted uninterrupted answers', () => {
  assert.equal(sessionTiming(answers().slice(0, 9)).eligible, false);
  for (const change of [{ correct: false }, { assisted: true }, { interrupted: true }]) {
    const attempts = answers();
    Object.assign(attempts[0], change);
    assert.equal(sessionTiming(attempts).eligible, false);
    assert.equal(recordSpeed(emptySpeed(), 0, 0, attempts).best[0], null);
  }
  assert.deepEqual(sessionTiming(answers()), { total: 10000, average: 1000, eligible: true });
});

test('records stay separate by range and improve only for faster sessions', () => {
  let speed = recordSpeed(emptySpeed(), 0, 0, answers());
  assert.deepEqual(speed.best, [10000, null, null, null]);
  speed = recordSpeed(speed, 7, 1, answers(2000));
  assert.deepEqual(speed.best, [10000, 20000, null, null]);
  speed = recordSpeed(speed, 0, 0, answers(3000));
  assert.equal(speed.best[0], 10000);
  speed = recordSpeed(speed, 0, 0, answers(500));
  assert.equal(speed.best[0], 5000);
  assert.deepEqual(readSpeed(JSON.parse(JSON.stringify(speed))), speed);
  assert.deepEqual(readSpeed(undefined), emptySpeed());
});

test('note speed keeps ten recent valid samples and excludes assisted answers', () => {
  let speed = emptySpeed();
  for (let i = 1; i <= 12; i++) speed = recordSpeed(speed, 7, 1, answers(i * 100).slice(0, 1));
  assert.equal(speed.notes[7].length, 10);
  assert.equal(speed.notes[7][0], 300);
  const assisted = [{ ...answers()[0], assisted: true }];
  assert.deepEqual(recordSpeed(speed, 7, 1, assisted).notes, speed.notes);
  assert.deepEqual(speed.notes[0], []);
});
