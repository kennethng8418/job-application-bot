import { test } from 'node:test';
import * as assert from 'node:assert';
import { AIAnswerGenerator } from '../../ai-answer-generator';
import { ResumeData } from '../../../config/resume-data';
import { PREFERENCES } from '../../../config/answer-preferences';

function makeGenerator(): AIAnswerGenerator {
  const resumeData: ResumeData = {
    personalInfo: {
      firstName: 'Test',
      lastName: 'User',
      location: 'NYC',
    },
    preferences: {
      remote: 'Yes',
      requiresVisaSponsorship: false,
      usCitizen: true,
    },
    resumePath: '/nonexistent/resume.pdf',
    aiConfig: { enabled: false },
  } as unknown as ResumeData;
  return new AIAnswerGenerator(resumeData);
}

test('howDidYouHear question with AI disabled returns the configured default', async () => {
  const gen = makeGenerator();
  const result = await gen.pickFromOptions(
    'How did you hear about Teamworks?',
    ['LinkedIn', 'Referral', 'Indeed', 'Other'],
  );
  assert.strictEqual(result, PREFERENCES.defaults.howDidYouHear);
});

test('generic question with AI disabled and no "Other" option returns null', async () => {
  const gen = makeGenerator();
  const result = await gen.pickFromOptions(
    'How would you describe your Python background?',
    [
      "I can read Python but haven't written it professionally",
      "I've used Python in a professional setting for scripting or data tasks",
    ],
  );
  assert.strictEqual(result, null);
});

test('"Which best applies" question with AI disabled returns Other when present', async () => {
  const gen = makeGenerator();
  const result = await gen.pickFromOptions(
    'Which best applies to you?',
    ['Option A', 'Option B', 'Other'],
  );
  assert.strictEqual(result, 'Other');
});

test('generic question with AI disabled does not silently pick Other', async () => {
  const gen = makeGenerator();
  const result = await gen.pickFromOptions(
    'How would you describe your Python background?',
    ['Junior', 'Mid', 'Senior', 'Other'],
  );
  // Generic category should not auto-pick Other; should return null so caller can skip
  assert.strictEqual(result, null);
});

test('empty options list returns null', async () => {
  const gen = makeGenerator();
  const result = await gen.pickFromOptions('Anything', []);
  assert.strictEqual(result, null);
});

test('howDidYouHear question falls through to Other when LinkedIn not in options', async () => {
  const gen = makeGenerator();
  const result = await gen.pickFromOptions(
    'How did you hear about us?',
    ['Twitter', 'Reddit', 'Friend', 'Other'],
  );
  assert.strictEqual(result, 'Other');
});

test('howDidYouHear question returns null when neither LinkedIn nor Other present', async () => {
  const gen = makeGenerator();
  const result = await gen.pickFromOptions(
    'How did you hear about us?',
    ['Twitter', 'Reddit', 'Friend'],
  );
  assert.strictEqual(result, null);
});
