import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUITAR_NOTES, guitarPositions, pickNote, isCorrectAnswer, fretMidi, staffChoices } from './training.ts';

test('guitar range covers natural notes on open strings through fret three', () => {
  const written = [52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79];
  const pitches = new Set();
  for (const open of [40, 45, 50, 55, 59, 64]) {
    for (let fret = 0; fret <= 3; fret++) {
      if ([0, 2, 4, 5, 7, 9, 11].includes((open + fret) % 12)) pitches.add(open + fret + 12);
    }
  }
  assert.deepEqual([...pitches].sort((a, b) => a - b), written);
  assert.equal(GUITAR_NOTES.length, written.length);
  for (const midi of written) assert.ok(guitarPositions(midi));
  assert.equal(guitarPositions(52), '6-я струна · открытая');
  assert.equal(guitarPositions(79), '1-я струна · 3-й лад');
  assert.equal(guitarPositions(76), '1-я струна · открытая');
});

test('each range samples only its notes and avoids immediate repeats', () => {
  const originalRandom = Math.random;
  try {
    for (const range of [{ count: 17 }]) {
      const seen = new Set();
      for (let step = 0; step < 100; step++) {
        Math.random = () => step / 100;
        const result = pickNote(Array(19).fill(0), range.count);
        assert.ok(GUITAR_NOTES.includes(result));
        seen.add(result);
        assert.notEqual(pickNote(Array(19).fill(4), range.count, result), result);
      }
      assert.equal(seen.size, range.count);
    }
  } finally { Math.random = originalRandom; }
});

test('answers identify all guitar pitches without duplicate buttons', () => {
  const expected = [2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4];
  for (const [i, note] of GUITAR_NOTES.entries()) {
    for (let answer = 0; answer < 7; answer++) {
      assert.equal(isCorrectAnswer(answer, note), answer === expected[i]);
    }
  }
});

test('fretboard maps every string and fret to the written guitar pitch', () => {
  const opens = [64, 59, 55, 50, 45, 40];
  for (let string = 1; string <= 6; string++) {
    for (let fret = 0; fret <= 3; fret++) assert.equal(fretMidi(string, fret), opens[string - 1] + fret + 12);
  }
  assert.equal(fretMidi(6, 0), 52);
  assert.equal(fretMidi(1, 3), 79);
});

test('reverse mode offers exactly one correct pitch among four distinct valid choices', () => {
  for (const target of GUITAR_NOTES) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const choices = staffChoices(target);
      assert.equal(choices.length, 4);
      assert.equal(new Set(choices).size, 4);
      assert.equal(choices.filter(i => i === target).length, 1);
      assert.ok(choices.every(i => GUITAR_NOTES.includes(i)));
    }
  }
});
