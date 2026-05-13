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

test('Yes maps to single "I acknowledge" option', () => {
  const result = matchEEOOption(['I acknowledge'], 'Yes');
  assert.equal(result, 'I acknowledge');
});

test('Yes maps to "I agree" option', () => {
  const result = matchEEOOption(['I agree', 'I do not agree'], 'Yes');
  assert.equal(result, 'I agree');
});

test('Yes maps to "I confirm" option', () => {
  const result = matchEEOOption(['I confirm'], 'Yes');
  assert.equal(result, 'I confirm');
});

test('Yes maps to "I certify" option', () => {
  const result = matchEEOOption(['I certify the above is true'], 'Yes');
  assert.equal(result, 'I certify the above is true');
});

test('Yes maps to "I have read and understand" option', () => {
  const result = matchEEOOption(
    ['I have read and understand the policy'],
    'Yes',
  );
  assert.equal(result, 'I have read and understand the policy');
});

test('Yes maps to slash-joined acknowledge/confirm option', () => {
  const result = matchEEOOption(['acknowledge/confirm'], 'Yes');
  assert.equal(result, 'acknowledge/confirm');
});

test('Yes does NOT match unrelated single option', () => {
  const result = matchEEOOption(['Banana'], 'Yes');
  assert.equal(result, null);
});

test('Yes still prefers literal "Yes" option when present', () => {
  const result = matchEEOOption(['Yes', 'I acknowledge', 'No'], 'Yes');
  assert.equal(result, 'Yes');
});

test('No matches Mixpanel-style "No, I have not..." option', () => {
  const options = [
    'No, I have not interviewed with Mixpanel.',
    'Yes, I interview with mixpanel in the last 6 months',
    'Yes, I interview with mixpanel within the last year',
  ];
  const result = matchEEOOption(options, 'No');
  assert.equal(result, 'No, I have not interviewed with Mixpanel.');
});

test('No does not match option containing "no" mid-word ("know")', () => {
  // Substring matcher would pick "I don't know" because "know" contains "no".
  // A short token like "No" should match start-of-option only.
  const options = ['I don\'t know', 'No, I have not done this'];
  const result = matchEEOOption(options, 'No');
  assert.equal(result, 'No, I have not done this');
});

test('Yes matches "Yes, I have done this" option (prefix)', () => {
  const options = [
    'No, I have not done this',
    'Yes, I have done this',
  ];
  const result = matchEEOOption(options, 'Yes');
  assert.equal(result, 'Yes, I have done this');
});
