import test from 'node:test';
import assert from 'node:assert/strict';
import { FieldResolver } from '../field-resolver';
import type { ResumeData } from '../../../config/resume-data';

const baseResumeData: ResumeData = {
  personalInfo: {
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    phone: '+1-555-555-5555',
    location: 'New York City, NY',
    linkedin: 'https://linkedin.com/in/test',
    github: 'https://github.com/test',
    portfolio: 'https://test.example',
    gender: 'Male',
    race: 'Asian (Not Hispanic or Latino)',
    veteranStatus: 'I am not a protected veteran',
    hispanicLatino: 'No',
    education: { degree: "Bachelor's Degree", discipline: 'Computer Science' },
    yearsOfExperienceByTech: { JavaScript: 2, React: 2, 'C#/.NET': 3 },
    yearsOfExperience: 2,
  },
  resumePath: './resumes/test.pdf',
  preferences: {
    sponsorship: 'no',
    remote: 'hybrid',
    requiresVisaSponsorship: false,
    legallyAuthorizedToWork: true,
    willingToRelocate: true,
    desiredSalary: '$150,000',
    startDate: '2 weeks',
  },
};

test('StaticFieldMap: resolves First Name', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('First Name', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'Test' });
});

test('StaticFieldMap: resolves Last Name', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Last Name', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'User' });
});

test('StaticFieldMap: resolves Email', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Email', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'test@example.com' });
});

test('StaticFieldMap: resolves Country to United States from NY location', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Country', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'United States' });
});

test('StaticFieldMap: Phone first → skip', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Phone', { isPhone: 'first' });
  assert.equal(result.kind, 'skip');
});

test('StaticFieldMap: Phone second → resolve', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Phone', { isPhone: 'second' });
  assert.deepEqual(result, { kind: 'value', value: '+1-555-555-5555' });
});

test('StaticFieldMap: Phone only → resolve', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Phone', { isPhone: 'only' });
  assert.deepEqual(result, { kind: 'value', value: '+1-555-555-5555' });
});

test('StaticFieldMap: case-insensitive label match', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('first name', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'Test' });
});

test('StaticFieldMap: strips trailing asterisk', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('First Name *', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'Test' });
});

test('StaticFieldMap: unknown label returns unresolved', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Favorite Color', { isPhone: false });
  assert.equal(result.kind, 'unresolved');
});

test('Pattern: LinkedIn Profile', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('LinkedIn Profile', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'https://linkedin.com/in/test' });
});

test('Pattern: GitHub Profile', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('GitHub Profile', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'https://github.com/test' });
});

test('Pattern: Website', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Website', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'https://test.example' });
});

test('Pattern: Preferred First Name → firstName', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Preferred First Name', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'Test' });
});

test('Pattern: sponsorship Yes (Courier Health phrasing)', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve(
    'Will you now or in the future require sponsorship for a U.S. employment visa (e.g. H-1B)?',
    { isPhone: false },
  );
  assert.deepEqual(result, { kind: 'value', value: 'No' });
});

test('Pattern: legally authorized (Chime phrasing)', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve(
    'Are you currently eligible to work legally in the United States of America?',
    { isPhone: false },
  );
  assert.deepEqual(result, { kind: 'value', value: 'Yes' });
});

test('Pattern: current location', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Where are you currently located (city, state)?', {
    isPhone: false,
  });
  assert.deepEqual(result, { kind: 'value', value: 'New York City, NY' });
});

test('Pattern: onsite/hybrid (Courier Health phrasing)', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve(
    'This role is 4x a week in our NYC office. Are you open to being onsite?',
    { isPhone: false },
  );
  assert.deepEqual(result, { kind: 'value', value: 'Yes' });
});

test('Pattern: salary', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('What is your expected annual base salary?', {
    isPhone: false,
  });
  assert.deepEqual(result, { kind: 'value', value: '$150,000' });
});

test('Pattern: how did you hear → PREFERENCES default LinkedIn', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('How did you hear about this job?', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'LinkedIn' });
});

test('Pattern: years of C#/.NET → looks up yearsOfExperienceByTech', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Years of C#/.NET Development Experience', {
    isPhone: false,
  });
  assert.deepEqual(result, { kind: 'value', value: '3' });
});

test('Pattern: years of React → looks up yearsOfExperienceByTech', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Years of React Development Experience', {
    isPhone: false,
  });
  assert.deepEqual(result, { kind: 'value', value: '2' });
});

test('Pattern: years of unknown tech → unresolved (falls through to AI)', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Years of Rust Experience', { isPhone: false });
  assert.equal(result.kind, 'unresolved');
});

test('Pattern: interviewed previously → No', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve(
    'Have you interviewed with us in the past six months to a year?',
    { isPhone: false },
  );
  assert.deepEqual(result, { kind: 'value', value: 'No' });
});

test('Pattern: restrictive covenant → No', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve(
    'Are you currently subject to any agreement with a former employer that may limit your duties?',
    { isPhone: false },
  );
  assert.deepEqual(result, { kind: 'value', value: 'No' });
});

test('Pattern: privacy policy → Yes', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Acknowledge Recruitment Privacy Policy', {
    isPhone: false,
  });
  assert.deepEqual(result, { kind: 'value', value: 'Yes' });
});

test('Pattern: GDPR demographic consent checkbox → Yes', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve(
    'By checking this box, I consent to Mixpanel collecting, storing, and processing my responses to the demographic data surveys above.',
    { isPhone: false },
  );
  assert.deepEqual(result, { kind: 'value', value: 'Yes' });
});

test('Pattern: generic "I consent to..." → Yes', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('I consent to the processing of my data', {
    isPhone: false,
  });
  assert.deepEqual(result, { kind: 'value', value: 'Yes' });
});

test('Pattern: affirmation checkbox → true', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve(
    'I affirm that all statements and information provided are accurate',
    { isPhone: false },
  );
  assert.deepEqual(result, { kind: 'value', value: 'true' });
});

test('Pattern: school', () => {
  const r = new FieldResolver({
    ...baseResumeData,
    personalInfo: {
      ...baseResumeData.personalInfo,
      education: {
        ...baseResumeData.personalInfo.education!,
        school: 'MIT',
      },
    },
  });
  const result = r.resolve('School', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'MIT' });
});

test('Pattern: degree', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Degree', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: "Bachelor's Degree" });
});

test('Pattern: discipline', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Discipline', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'Computer Science' });
});

test('Pattern: ITAR → U.S. Citizen', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('ITAR eligibility status', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'U.S. Citizen' });
});

test('Pattern: Location (City)', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Location (City)', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'New York City, NY' });
});

test('Pattern: start date', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('When can you start?', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: '2 weeks' });
});

test('Pattern: pronouns → unresolved (skipped, always optional)', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Pronouns', { isPhone: false });
  assert.equal(result.kind, 'unresolved');
});

test('Pattern: random label returns unresolved', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Favorite Pizza Topping', { isPhone: false });
  assert.equal(result.kind, 'unresolved');
});

test('EEO: Gender from resumeData', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Gender', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'Male' });
});

test('EEO: Hispanic/Latino from resumeData', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Are you Hispanic/Latino?', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'No' });
});

test('EEO: Race from resumeData', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Race & Ethnicity', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'Asian (Not Hispanic or Latino)' });
});

test('EEO: Veteran from resumeData', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Veteran Status', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'I am not a protected veteran' });
});

test('EEO: Disability defaults to "I do not want to answer" when unset', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Disability Status', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'I do not want to answer' });
});

test('EEO: Gender defaults to Decline when unset', () => {
  const noGender: ResumeData = {
    ...baseResumeData,
    personalInfo: { ...baseResumeData.personalInfo, gender: undefined },
  };
  const r = new FieldResolver(noGender);
  const result = r.resolve('Gender', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'Decline to self-identify' });
});

test('EEO: LGBTQ+ → Prefer not to answer (no resumeData source)', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('I consider myself a member of the LGBTQ+ community.', {
    isPhone: false,
  });
  assert.deepEqual(result, { kind: 'value', value: 'Prefer not to answer' });
});

test('EEO: Gender Identity (extra voluntary) → Prefer not to answer', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Gender Identity', { isPhone: false });
  assert.deepEqual(result, { kind: 'value', value: 'Prefer not to answer' });
});

test('AI fallback: called for unresolved textarea', async () => {
  let captured: string | null = null;
  const mockGen = {
    isEnabled: () => true,
    generateAnswer: async (q: string) => {
      captured = q;
      return 'A thoughtful answer.';
    },
  };
  const r = new FieldResolver(baseResumeData, mockGen as any);
  const result = await r.resolveAsync(
    'Why are you interested in our company?',
    { isPhone: false },
    { isTextarea: true },
  );
  assert.deepEqual(result, { kind: 'value', value: 'A thoughtful answer.' });
  assert.equal(captured, 'Why are you interested in our company?');
});

test('AI fallback: not called for short text inputs', async () => {
  let called = false;
  const mockGen = {
    isEnabled: () => true,
    generateAnswer: async () => {
      called = true;
      return 'should not be returned';
    },
  };
  const r = new FieldResolver(baseResumeData, mockGen as any);
  const result = await r.resolveAsync('Favorite Color', { isPhone: false }, { isTextarea: false });
  assert.equal(called, false);
  assert.equal(result.kind, 'unresolved');
});

test('AI fallback: not called when generator disabled', async () => {
  let called = false;
  const mockGen = {
    isEnabled: () => false,
    generateAnswer: async () => {
      called = true;
      return null;
    },
  };
  const r = new FieldResolver(baseResumeData, mockGen as any);
  const result = await r.resolveAsync(
    'Why are you interested?',
    { isPhone: false },
    { isTextarea: true },
  );
  assert.equal(called, false);
  assert.equal(result.kind, 'unresolved');
});

test('AI fallback: null response → unresolved', async () => {
  const mockGen = {
    isEnabled: () => true,
    generateAnswer: async () => null,
  };
  const r = new FieldResolver(baseResumeData, mockGen as any);
  const result = await r.resolveAsync(
    'Why are you interested?',
    { isPhone: false },
    { isTextarea: true },
  );
  assert.equal(result.kind, 'unresolved');
});

test('AI fallback: not called when earlier resolver returns a value', async () => {
  let called = false;
  const mockGen = {
    isEnabled: () => true,
    generateAnswer: async () => {
      called = true;
      return 'should not be returned';
    },
  };
  const r = new FieldResolver(baseResumeData, mockGen as any);
  const result = await r.resolveAsync('First Name', { isPhone: false }, { isTextarea: false });
  assert.equal(called, false);
  assert.deepEqual(result, { kind: 'value', value: 'Test' });
});
