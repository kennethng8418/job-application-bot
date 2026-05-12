import test from 'node:test';
import assert from 'node:assert/strict';
import { matchEEOOption } from '../eeo-options';

test('disability: matches verbose Yes option exactly', () => {
  const options = [
    'Yes, I have a disability, or have had one in the past',
    'No, I do not have a disability and have not had one in the past',
    'I do not want to answer',
  ];
  const result = matchEEOOption(
    options,
    'Yes, I have a disability, or have had one in the past',
  );
  assert.equal(result, 'Yes, I have a disability, or have had one in the past');
});

test('disability: falls back via substring when wording drifts', () => {
  const options = [
    'Yes, I have a disability',
    'No, I do not have a disability',
    'I prefer not to answer',
  ];
  const result = matchEEOOption(options, 'I do not want to answer');
  assert.equal(result, 'I prefer not to answer');
});

test('gender: exact match wins', () => {
  const options = ['Male', 'Female', 'Non-binary', 'Decline to self-identify'];
  const result = matchEEOOption(options, 'Male');
  assert.equal(result, 'Male');
});

test('decline: matches via "decline" substring when option uses different wording', () => {
  const options = ['Yes', 'No', 'Prefer not to answer'];
  const result = matchEEOOption(options, 'Decline to self-identify');
  assert.equal(result, 'Prefer not to answer');
});

test('returns null when no exact or substring match', () => {
  const options = ['Apple', 'Banana'];
  const result = matchEEOOption(options, 'Cherry');
  assert.equal(result, null);
});
