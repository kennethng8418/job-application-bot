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
