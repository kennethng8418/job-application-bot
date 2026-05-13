import test from 'node:test';
import assert from 'node:assert/strict';
import { isSelectPlaceholder } from '../field-emptiness';

test('isSelectPlaceholder: "Select..." is a placeholder', () => {
  assert.equal(isSelectPlaceholder('Select...'), true);
});

test('isSelectPlaceholder: empty string is a placeholder', () => {
  assert.equal(isSelectPlaceholder(''), true);
});

test('isSelectPlaceholder: whitespace-only is a placeholder', () => {
  assert.equal(isSelectPlaceholder('   '), true);
});

test('isSelectPlaceholder: "--" is a placeholder', () => {
  assert.equal(isSelectPlaceholder('--'), true);
});

test('isSelectPlaceholder: "-- Select --" is a placeholder', () => {
  assert.equal(isSelectPlaceholder('-- Select --'), true);
});

test('isSelectPlaceholder: "Choose..." is a placeholder', () => {
  assert.equal(isSelectPlaceholder('Choose...'), true);
});

test('isSelectPlaceholder: "Please select" is a placeholder', () => {
  assert.equal(isSelectPlaceholder('Please select'), true);
});

test('isSelectPlaceholder: case-insensitive', () => {
  assert.equal(isSelectPlaceholder('SELECT...'), true);
  assert.equal(isSelectPlaceholder('select...'), true);
});

test('isSelectPlaceholder: real option text is NOT a placeholder', () => {
  assert.equal(isSelectPlaceholder('United States'), false);
  assert.equal(isSelectPlaceholder('Yes'), false);
  assert.equal(isSelectPlaceholder('Male'), false);
});

test('isSelectPlaceholder: option containing "select" mid-word is NOT a placeholder', () => {
  // "Selected applicants only" should not be flagged
  assert.equal(isSelectPlaceholder('Selected applicants only'), false);
});
