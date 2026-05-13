import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPickPrompt } from '../ai-prompt';

const basePersonalInfo = {
  firstName: 'Test',
  lastName: 'User',
  email: 't@example.com',
  phone: '+1-555-555-5555',
  location: 'New York City, NY',
};

const basePrefs = {
  sponsorship: 'no' as const,
  remote: 'hybrid' as const,
  requiresVisaSponsorship: false,
  willingToRelocate: true,
};

test('buildPickPrompt: includes question text', () => {
  const prompt = buildPickPrompt({
    personalInfo: basePersonalInfo,
    preferences: basePrefs,
    background: 'engineer',
    tone: 'confident',
    question: 'What is your race?',
    options: ['Asian', 'White'],
    strict: false,
  });
  assert.ok(prompt.includes('What is your race?'), 'prompt should include the question');
});

test('buildPickPrompt: includes numbered options', () => {
  const prompt = buildPickPrompt({
    personalInfo: basePersonalInfo,
    preferences: basePrefs,
    background: 'engineer',
    tone: 'confident',
    question: 'q',
    options: ['East Asian', 'South Asian'],
    strict: false,
  });
  assert.ok(prompt.includes('1. East Asian'));
  assert.ok(prompt.includes('2. South Asian'));
});

test('buildPickPrompt: includes asianSubcategory when set', () => {
  const prompt = buildPickPrompt({
    personalInfo: { ...basePersonalInfo, asianSubcategory: 'East Asian' },
    preferences: basePrefs,
    background: 'engineer',
    tone: 'confident',
    question: 'q',
    options: ['East Asian', 'South Asian'],
    strict: false,
  });
  assert.ok(
    prompt.includes('East Asian'),
    'prompt should mention configured sub-category',
  );
  // Stronger: a labeled line so the model knows it as a constraint, not just chance text
  assert.ok(
    /Race sub-category:\s*East Asian/i.test(prompt),
    'prompt should label sub-category clearly',
  );
});

test('buildPickPrompt: omits asianSubcategory line when not set', () => {
  const prompt = buildPickPrompt({
    personalInfo: basePersonalInfo,
    preferences: basePrefs,
    background: 'engineer',
    tone: 'confident',
    question: 'q',
    options: ['a', 'b'],
    strict: false,
  });
  assert.ok(
    !/Race sub-category:/i.test(prompt),
    'prompt should not include sub-category label when field is unset',
  );
});

test('buildPickPrompt: strict instruction differs from non-strict', () => {
  const args = {
    personalInfo: basePersonalInfo,
    preferences: basePrefs,
    background: 'engineer',
    tone: 'confident',
    question: 'q',
    options: ['a', 'b'],
  };
  const lax = buildPickPrompt({ ...args, strict: false });
  const strict = buildPickPrompt({ ...args, strict: true });
  assert.notEqual(lax, strict);
  assert.ok(strict.includes('CRITICAL'));
});
