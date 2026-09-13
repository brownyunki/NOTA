import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyNotes, readNotes, recordNote, mastery } from './progress.ts';

test('legacy and invalid saved data start with empty note statistics', () => {
  assert.deepEqual(readNotes(undefined), emptyNotes());
  assert.deepEqual(readNotes(Array(7).fill({ correct: -1 })), emptyNotes());
  const notes = recordNote(emptyNotes(), 2, true, false);
  assert.deepEqual(readNotes(JSON.parse(JSON.stringify(notes))), notes);
});

test('assisted answers are separate and do not change mastery', () => {
  const notes = recordNote(emptyNotes(), 0, true, true);
  assert.deepEqual(notes[0], { correct: 0, wrong: 0, assisted: 1, recent: [] });
  assert.equal(mastery(notes[0]).percent, null);
  assert.equal(mastery(notes[0]).level, 'new');
  assert.deepEqual(notes[1], emptyNotes()[1]);
});

test('seven-note saves migrate without losing first octave progress', () => {
  const legacy = recordNote(emptyNotes(), 0, true, false).slice(0, 7);
  const migrated = readNotes(legacy);
  assert.equal(migrated.length, 19);
  assert.deepEqual(migrated.slice(0, 7), legacy);
  assert.deepEqual(migrated.slice(7), emptyNotes().slice(7));
  const updated = recordNote(migrated, 7, false, false);
  assert.equal(updated[0].correct, 1);
  assert.equal(updated[0].wrong, 0);
  assert.equal(updated[7].wrong, 1);
});

test('mastery requires five independent attempts and reflects recent learning', () => {
  let notes = emptyNotes();
  for (let i = 0; i < 4; i++) notes = recordNote(notes, 0, true, false);
  assert.equal(mastery(notes[0]).level, 'new');
  notes = recordNote(notes, 0, false, false);
  assert.equal(mastery(notes[0]).level, 'good');
  notes = recordNote(notes, 0, false, false);
  assert.equal(mastery(notes[0]).level, 'learning');
  for (let i = 0; i < 10; i++) notes = recordNote(notes, 0, false, false);
  assert.equal(mastery(notes[0]).level, 'repeat');
  for (let i = 0; i < 10; i++) notes = recordNote(notes, 0, true, false);
  assert.equal(notes[0].recent.length, 10);
  assert.equal(mastery(notes[0]).level, 'good');
  assert.equal(mastery(notes[0]).recentPercent, 100);
  assert.equal(notes[0].correct, 14);
  assert.equal(notes[0].wrong, 12);
});
