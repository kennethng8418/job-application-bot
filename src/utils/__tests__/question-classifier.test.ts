import { test } from 'node:test';
import * as assert from 'node:assert';
import { classifyQuestion } from '../question-classifier';

test('classifies "How did you hear about ..." as howDidYouHear', () => {
  assert.strictEqual(classifyQuestion('How did you hear about Teamworks?'), 'howDidYouHear');
  assert.strictEqual(classifyQuestion('How did you hear about us?'), 'howDidYouHear');
});

test('classifies "Where did you hear..." as howDidYouHear', () => {
  assert.strictEqual(classifyQuestion('Where did you hear about this role?'), 'howDidYouHear');
});

test('classifies "How did you find this job?" as howDidYouHear', () => {
  assert.strictEqual(classifyQuestion('How did you find this job?'), 'howDidYouHear');
});

test('classifies "Which best applies to you?" as other', () => {
  assert.strictEqual(classifyQuestion('Which best applies to you?'), 'other');
});

test('classifies "Which of these best describes you?" as other', () => {
  assert.strictEqual(classifyQuestion('Which of these best describes you?'), 'other');
});

test('classifies an unrelated question as generic', () => {
  assert.strictEqual(classifyQuestion('How would you describe your Python background?'), 'generic');
  assert.strictEqual(classifyQuestion('Do you have experience using Teamworks?'), 'generic');
});

test('is case-insensitive', () => {
  assert.strictEqual(classifyQuestion('HOW DID YOU HEAR ABOUT US?'), 'howDidYouHear');
  assert.strictEqual(classifyQuestion('which BEST applies to you?'), 'other');
});
