# Greenhouse Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing AshbyHQ job-application bot to also handle Greenhouse-hosted application forms, with rule-based field resolution backed by an AI fallback, auto-submit with `--dry-run` opt-out, and fail-and-log on reCAPTCHA.

**Architecture:** A new `GreenhouseJobApplicationBot` sibling to `AshbyJobApplicationBot`, both extending the shared `BaseApplicationBot`. A 4-stage resolver pipeline (`StaticFieldMap` → `PatternMatcher` → `EEOMapper` → `AIAnswerGenerator`) decides how each form field is filled. URL router in `apply.ts` dispatches to the right bot based on hostname. DOM-scraping only; no Greenhouse JSON API.

**Tech Stack:** TypeScript (strict), Playwright 1.41, Node test runner (built-in `node:test`), Anthropic SDK (existing). No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-05-12-greenhouse-bot-design.md`

**One divergence from the spec the engineer should know about:** The spec proposes adding `personalInfo.referralSource: 'LinkedIn'`. After scanning the codebase, we discovered `config/answer-preferences.ts` already defines `PREFERENCES.defaults.howDidYouHear = 'LinkedIn'`. This plan reuses the existing field. PatternMatcher Rule 12 reads `PREFERENCES.defaults.howDidYouHear` instead of a new `personalInfo.referralSource`.

---

## File Structure

### Files to create

| Path | Purpose |
|---|---|
| `src/greenhouse-bot.ts` | `GreenhouseJobApplicationBot` extending `BaseApplicationBot`. Owns one application's lifecycle. |
| `src/greenhouse/field-resolver.ts` | 4-stage `FieldResolver` class with `StaticFieldMap`, `PatternMatcher`, `EEOMapper`, AI fallback. |
| `src/greenhouse/selectors.ts` | Single source of truth for Greenhouse DOM selectors. |
| `src/greenhouse/eeo-options.ts` | EEO `resumeData` value → Greenhouse dropdown label maps. |
| `src/greenhouse/types.ts` | `Field` discriminated union (`text` / `textarea` / `select` / `combobox` / `radio` / `checkbox` / `file`). |
| `src/greenhouse/__tests__/field-resolver.test.ts` | Unit tests for the resolver pipeline. |
| `src/greenhouse/__tests__/eeo-options.test.ts` | Unit tests for EEO mapping. |

### Files to modify

| Path | Reason |
|---|---|
| `config/resume-data.ts` | Add 4 fields (`hispanicLatino`, `disabilityStatus`, `education`, `yearsOfExperienceByTech`); remove `university`. |
| `src/apply.ts` | URL router (Ashby vs Greenhouse), `--dry-run` flag parsing. |
| `src/ashby-bot.ts` | Migrate `personalInfo.university` → `personalInfo.education?.school` (5 reads at lines 150-152, 1096-1099). |
| `src/ai-answer-generator.ts` | Migrate `personalInfo.university` reads (lines 60, 74). |

### Files explicitly unchanged

`src/base-application-bot.ts`, `src/utils/submission-logger.ts`, `src/utils/retry-helper.ts`, `src/utils/question-classifier.ts`, `src/form-analyzer.ts`, `config/answer-preferences.ts`.

---

## Conventions used throughout this plan

- **Commit cadence:** every task ends with a commit. Small, reviewable units.
- **Branch:** all work happens on the `greenhouse` branch (already created and checked out).
- **TDD:** for resolver logic, the failing test comes first.
- **Build before test:** the project compiles to `dist/`. Tests run against compiled output via `npm run test:unit`. Always run `npm run build` before `npm run test:unit`.
- **No new dependencies:** Node's built-in test runner (`node --test`) and `node:assert/strict` are sufficient.
- **Type strictness:** every file uses strict TypeScript. No `any` without an explicit comment justifying it.

---

## Task 1: Add new `ResumeData` fields (no removals yet)

**Files:**
- Modify: `config/resume-data.ts`

This task adds the new fields **alongside** `university`. Removing `university` is Task 2, after the new fields are populated and consumers are migrated. Splitting this way keeps each step compilable and avoids a half-done migration state.

- [ ] **Step 1: Add new optional fields to the `ResumeData` interface**

In `config/resume-data.ts`, locate the `personalInfo` block of the `ResumeData` interface (currently ends around line 17 before the closing `};`). Add these fields after `veteranStatus?:`:

```ts
hispanicLatino?: 'Yes' | 'No' | 'Decline to self-identify';
disabilityStatus?:
  | 'Yes, I have a disability, or have had one in the past'
  | 'No, I do not have a disability and have not had one in the past'
  | 'I do not want to answer';
education?: {
  degree: string;
  discipline?: string;
  school?: string;
};
yearsOfExperienceByTech?: Record<string, number>;
```

Leave the existing `university?: string` in place for this task. Do not modify it.

- [ ] **Step 2: Populate the new fields in the `resumeData` constant**

In the same file, find the exported `resumeData` constant. Inside `personalInfo`, after `yearsOfExperience: 2,`, add:

```ts
hispanicLatino: 'No',
education: {
  degree: "Bachelor's Degree",
  discipline: 'Computer Science',
},
yearsOfExperienceByTech: {
  JavaScript: 2,
  TypeScript: 2,
  React: 2,
  'Node.js': 2,
  Python: 2,
},
```

Do not populate `disabilityStatus` — leave it unset. The resolver will fall back to `"I do not want to answer"`.

- [ ] **Step 3: Compile to confirm no type errors**

Run: `npm run build`
Expected: clean compile, no errors. `dist/` directory updates.

- [ ] **Step 4: Commit**

```bash
git add config/resume-data.ts
git commit -m "Add hispanicLatino, disabilityStatus, education, yearsOfExperienceByTech to ResumeData"
```

---

## Task 2: Migrate `university` reads to `education.school`, then remove `university`

**Files:**
- Modify: `config/resume-data.ts`
- Modify: `src/ashby-bot.ts` (lines 150-152, 1096-1099)
- Modify: `src/ai-answer-generator.ts` (lines 60, 74)

Migration is done in a single task because the type system enforces atomicity: once `university` is removed from the interface, every read must be updated in the same commit or compilation fails.

- [ ] **Step 1: Update `src/ai-answer-generator.ts` line 60**

Find:
```ts
University: ${personalInfo.university || 'Not specified'}
```

Replace with:
```ts
University: ${personalInfo.education?.school || 'Not specified'}
```

- [ ] **Step 2: Update `src/ai-answer-generator.ts` line 74**

Find:
```ts
6. If the question asks about university, college, or school, answer ONLY with: "${personalInfo.university || 'Not specified'}" (do NOT add any explanation).
```

Replace with:
```ts
6. If the question asks about university, college, or school, answer ONLY with: "${personalInfo.education?.school || 'Not specified'}" (do NOT add any explanation).
```

- [ ] **Step 3: Update `src/ashby-bot.ts` lines 150-152**

Find:
```ts
if (personalInfo.university) {
  await fillByLabel('University', personalInfo.university);
  await fillByLabel('School', personalInfo.university);
  await fillByLabel('College', personalInfo.university);
}
```

Replace with:
```ts
const school = personalInfo.education?.school;
if (school) {
  await fillByLabel('University', school);
  await fillByLabel('School', school);
  await fillByLabel('College', school);
}
```

- [ ] **Step 4: Update `src/ashby-bot.ts` lines 1096-1099**

Find:
```ts
if (this.resumeData.personalInfo.university) {
  await input.fill(this.resumeData.personalInfo.university);
  console.log(`  ✓ Filled university: ${this.resumeData.personalInfo.university}`);
```

Replace with:
```ts
const school = this.resumeData.personalInfo.education?.school;
if (school) {
  await input.fill(school);
  console.log(`  ✓ Filled university: ${school}`);
```

Be careful: this block has more lines after; preserve the rest of the function untouched. The exact start- and end-of-block boundary is the variable assignment + the existing `console.log`. Anything inside the `if` after the `console.log` line stays as-is.

- [ ] **Step 5: Remove `university` from the `ResumeData` interface and `resumeData` constant**

In `config/resume-data.ts`:

Find in the interface (around line 12):
```ts
university?: string; // e.g., "Georgia Institute of Technology"
```
Delete this line.

In the `resumeData` constant, find any line that sets `university:` and delete it. (If `university` isn't currently set in the constant — the file shown in spec exploration didn't have one — there's nothing to delete in the constant.)

- [ ] **Step 6: Compile to confirm migration is clean**

Run: `npm run build`
Expected: clean compile. If any `personalInfo.university` reference was missed, the compiler will fail with `Property 'university' does not exist on type ...`. Fix the missed reference, re-run.

- [ ] **Step 7: Run existing Ashby unit tests**

Run: `npm run test:unit`
Expected: all existing tests pass (no Ashby tests should break from this migration).

- [ ] **Step 8: Commit**

```bash
git add config/resume-data.ts src/ashby-bot.ts src/ai-answer-generator.ts
git commit -m "Migrate personalInfo.university to personalInfo.education.school"
```

---

## Task 3: Create the `Field` type module

**Files:**
- Create: `src/greenhouse/types.ts`

Defining the `Field` discriminated union as the first Greenhouse file establishes the contract every other Greenhouse file will use.

- [ ] **Step 1: Create the directory**

Run: `mkdir -p src/greenhouse/__tests__`

- [ ] **Step 2: Write `src/greenhouse/types.ts`**

```ts
import type { Locator } from 'playwright';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'combobox'
  | 'radio'
  | 'checkbox'
  | 'file';

interface FieldBase {
  label: string;
  element: Locator;
  required: boolean;
}

export type Field =
  | (FieldBase & { kind: 'text' })
  | (FieldBase & { kind: 'textarea' })
  | (FieldBase & { kind: 'select'; options: string[] })
  | (FieldBase & { kind: 'combobox' })
  | (FieldBase & { kind: 'radio'; options: string[] })
  | (FieldBase & { kind: 'checkbox' })
  | (FieldBase & { kind: 'file' });

export interface ResolverContext {
  isPhone: 'first' | 'second' | 'only' | false;
}

export type ResolverResult =
  | { kind: 'value'; value: string }
  | { kind: 'skip'; reason: string }
  | { kind: 'unresolved' };
```

- [ ] **Step 3: Compile to confirm types are valid**

Run: `npm run build`
Expected: clean compile.

- [ ] **Step 4: Commit**

```bash
git add src/greenhouse/types.ts
git commit -m "Add Field discriminated union for Greenhouse bot"
```

---

## Task 4: Add Greenhouse selector constants

**Files:**
- Create: `src/greenhouse/selectors.ts`

Centralizing selectors so DOM-drift fixes happen in one place. These are constants only; no logic.

- [ ] **Step 1: Write `src/greenhouse/selectors.ts`**

```ts
export const SELECTORS = {
  formRoot: 'form#application-form, form[action*="greenhouse"]',
  submitButton: 'button[type="submit"], input[type="submit"]',
  recaptchaIframe: 'iframe[src*="recaptcha"]',
  requiredIndicator: '[aria-required="true"], [required]',
  phoneInput: 'input[type="tel"], input[name*="phone" i], input[id*="phone" i]',
  countrySelect: 'select[name*="country" i], select[id*="country" i]',
  countryCodePrefix: '[data-country-code], .iti__selected-flag',
  resumeFileInput:
    'input[type="file"][name*="resume" i], input[type="file"][id*="resume" i]',
  coverLetterFileInput:
    'input[type="file"][name*="cover" i], input[type="file"][id*="cover" i]',
  uploadConfirmation:
    '.file__name, [data-source="file"]',
} as const;

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const POST_COUNTRY_WAIT_MS = 3000;
export const UPLOAD_CONFIRMATION_TIMEOUT_MS = 5000;
export const POST_SUBMIT_VERIFICATION_MS = 10_000;
```

- [ ] **Step 2: Compile**

Run: `npm run build`
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add src/greenhouse/selectors.ts
git commit -m "Add Greenhouse DOM selector constants"
```

---

## Task 5: Add EEO option mappings

**Files:**
- Create: `src/greenhouse/eeo-options.ts`
- Create: `src/greenhouse/__tests__/eeo-options.test.ts`

Each EEO question maps the user's `resumeData` value to the literal dropdown label Greenhouse renders. We test by example — exact-match wins, substring is fallback.

- [ ] **Step 1: Write the failing test `src/greenhouse/__tests__/eeo-options.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npm run build && npm run test:unit -- --test-name-pattern="eeo-options"`
Expected: FAIL with "Cannot find module '../eeo-options'" or equivalent.

- [ ] **Step 3: Implement `src/greenhouse/eeo-options.ts`**

```ts
const DECLINE_KEYWORDS = ['decline', 'do not want', 'prefer not', "don't wish"];

export function matchEEOOption(
  options: string[],
  desired: string,
): string | null {
  const exact = options.find(o => o === desired);
  if (exact) return exact;

  const ciExact = options.find(o => o.toLowerCase() === desired.toLowerCase());
  if (ciExact) return ciExact;

  const desiredLower = desired.toLowerCase();
  const substring = options.find(
    o => o.toLowerCase().includes(desiredLower) ||
         desiredLower.includes(o.toLowerCase()),
  );
  if (substring) return substring;

  const desiredIsDecline = DECLINE_KEYWORDS.some(kw => desiredLower.includes(kw));
  if (desiredIsDecline) {
    const declineMatch = options.find(o =>
      DECLINE_KEYWORDS.some(kw => o.toLowerCase().includes(kw)),
    );
    if (declineMatch) return declineMatch;
  }

  return null;
}

export const EEO_DEFAULTS = {
  gender: 'Decline to self-identify',
  hispanicLatino: 'Decline to self-identify',
  race: 'Decline to self-identify',
  veteranStatus: 'I decline to self-identify for protected veteran status',
  disabilityStatus: 'I do not want to answer',
} as const;
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `npm run build && npm run test:unit -- --test-name-pattern="eeo-options"`
Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/greenhouse/eeo-options.ts src/greenhouse/__tests__/eeo-options.test.ts
git commit -m "Add EEO option matching with substring fallback"
```

---

## Task 6: Implement `StaticFieldMap` resolver

**Files:**
- Create: `src/greenhouse/field-resolver.ts` (first version, just `StaticFieldMap`)
- Create: `src/greenhouse/__tests__/field-resolver.test.ts`

The full resolver class is built up across Tasks 6–9, one resolver per task. Each task adds tests and code; the file grows incrementally.

- [ ] **Step 1: Write failing tests for `StaticFieldMap`**

Create `src/greenhouse/__tests__/field-resolver.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npm run build && npm run test:unit -- --test-name-pattern="StaticFieldMap"`
Expected: FAIL with "Cannot find module '../field-resolver'".

- [ ] **Step 3: Implement `StaticFieldMap` in `src/greenhouse/field-resolver.ts`**

```ts
import type { ResumeData } from '../../config/resume-data';
import type { ResolverContext, ResolverResult } from './types';

function normalizeLabel(raw: string): string {
  return raw
    .replace(/\s*\*\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const CITY_TO_COUNTRY: Record<string, string> = {
  'new york': 'United States',
  'san francisco': 'United States',
  'los angeles': 'United States',
  'london': 'United Kingdom',
  'berlin': 'Germany',
  'paris': 'France',
  'tokyo': 'Japan',
  'toronto': 'Canada',
};

function inferCountry(location: string): string {
  const lower = location.toLowerCase();
  for (const [city, country] of Object.entries(CITY_TO_COUNTRY)) {
    if (lower.includes(city)) return country;
  }
  return 'United States';
}

export class FieldResolver {
  constructor(private readonly resumeData: ResumeData) {}

  resolve(rawLabel: string, ctx: ResolverContext): ResolverResult {
    const label = normalizeLabel(rawLabel);
    const staticResult = this.tryStatic(label, ctx);
    if (staticResult.kind !== 'unresolved') return staticResult;
    return { kind: 'unresolved' };
  }

  private tryStatic(label: string, ctx: ResolverContext): ResolverResult {
    const { personalInfo, resumePath } = this.resumeData;

    if (label === 'first name') {
      return { kind: 'value', value: personalInfo.firstName };
    }
    if (label === 'last name') {
      return { kind: 'value', value: personalInfo.lastName };
    }
    if (label === 'email') {
      return { kind: 'value', value: personalInfo.email };
    }
    if (label === 'country') {
      return { kind: 'value', value: inferCountry(personalInfo.location) };
    }
    if (label === 'resume/cv' || label === 'resume') {
      return { kind: 'value', value: resumePath };
    }
    if (label === 'phone') {
      if (ctx.isPhone === 'first') {
        return { kind: 'skip', reason: 'duplicate-phone-quirk' };
      }
      if (ctx.isPhone === 'second' || ctx.isPhone === 'only') {
        return { kind: 'value', value: personalInfo.phone };
      }
      return { kind: 'unresolved' };
    }

    return { kind: 'unresolved' };
  }
}
```

- [ ] **Step 4: Run tests, confirm all 10 pass**

Run: `npm run build && npm run test:unit -- --test-name-pattern="StaticFieldMap"`
Expected: 10 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/greenhouse/field-resolver.ts src/greenhouse/__tests__/field-resolver.test.ts
git commit -m "Add FieldResolver with StaticFieldMap (Tier 1 universal fields)"
```

---

## Task 7: Implement `PatternMatcher` resolver

**Files:**
- Modify: `src/greenhouse/field-resolver.ts`
- Modify: `src/greenhouse/__tests__/field-resolver.test.ts`

Adds 23 ordered regex rules. Each rule gets at least one positive test drawn from the real 9-URL sample.

- [ ] **Step 1: Append failing PatternMatcher tests to `field-resolver.test.ts`**

Add to the bottom of the existing test file:

```ts
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
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npm run build && npm run test:unit -- --test-name-pattern="Pattern"`
Expected: most fail (only label-cased universal labels like "first name" don't trigger Pattern rules and pass via fallback to unresolved).

- [ ] **Step 3: Add `PatternMatcher` to `field-resolver.ts`**

At the top of `field-resolver.ts`, add this import:

```ts
import { PREFERENCES } from '../../config/answer-preferences';
```

Then add this helper near `normalizeLabel`:

```ts
function normalizeTechKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}
```

Then inside the `FieldResolver` class, **after** the `tryStatic` method, add:

```ts
private tryPattern(label: string): ResolverResult {
  const { personalInfo, preferences } = this.resumeData;

  if (/linkedin/.test(label)) {
    return personalInfo.linkedin
      ? { kind: 'value', value: personalInfo.linkedin }
      : { kind: 'unresolved' };
  }
  if (/github/.test(label)) {
    return personalInfo.github
      ? { kind: 'value', value: personalInfo.github }
      : { kind: 'unresolved' };
  }
  if (/website|portfolio/.test(label)) {
    return personalInfo.portfolio
      ? { kind: 'value', value: personalInfo.portfolio }
      : { kind: 'unresolved' };
  }
  if (/cover letter/.test(label)) {
    return this.resumeData.coverLetterPath
      ? { kind: 'value', value: this.resumeData.coverLetterPath }
      : { kind: 'skip', reason: 'no-cover-letter-configured' };
  }
  if (/preferred (first )?name|name.*you go by/.test(label)) {
    return { kind: 'value', value: personalInfo.firstName };
  }
  if (/pronoun/.test(label)) {
    return { kind: 'unresolved' };
  }
  if (/sponsor|visa|immigration support/.test(label)) {
    return { kind: 'value', value: preferences.requiresVisaSponsorship ? 'Yes' : 'No' };
  }
  if (/legally authorized|authorized to work|work authorization|currently eligible to work|eligible to work legally/.test(label)) {
    return { kind: 'value', value: preferences.legallyAuthorizedToWork ? 'Yes' : 'No' };
  }
  if (/(currently )?located in|current location|where are you (currently )?(located|based)/.test(label)) {
    return { kind: 'value', value: personalInfo.location };
  }
  if (/onsite|in.office|hybrid|relocate|relocation|willing to (work )?(from|in)|open to being onsite/.test(label)) {
    const ok = preferences.willingToRelocate || preferences.remote !== 'no';
    return { kind: 'value', value: ok ? 'Yes' : 'No' };
  }
  if (/salary|compensation|target.*base|expected.*base|desired.*pay|annual base/.test(label)) {
    return preferences.desiredSalary
      ? { kind: 'value', value: preferences.desiredSalary }
      : { kind: 'unresolved' };
  }
  if (/how did you hear|referral source|hear about (this )?(job|role|position|us)/.test(label)) {
    return { kind: 'value', value: PREFERENCES.defaults.howDidYouHear };
  }
  if (/start date|when can you start|available to start/.test(label)) {
    return preferences.startDate
      ? { kind: 'value', value: preferences.startDate }
      : { kind: 'unresolved' };
  }
  if (/years.*?(?:of)?.*?experience.*?(?:in|with|of)?\s*(.+)/.test(label)) {
    const match = label.match(/years.*?(?:of)?.*?experience.*?(?:in|with|of)?\s*(.+)/);
    if (match && match[1]) {
      const techRaw = match[1].replace(/\bdevelopment\b|\bexperience\b/g, '').trim();
      const key = normalizeTechKey(techRaw);
      const byTech = personalInfo.yearsOfExperienceByTech ?? {};
      for (const [k, v] of Object.entries(byTech)) {
        if (normalizeTechKey(k) === key) {
          return { kind: 'value', value: String(v) };
        }
      }
    }
    return { kind: 'unresolved' };
  }
  if (/interviewed.*(in the past|previously|with us)/.test(label)) {
    return { kind: 'value', value: 'No' };
  }
  if (/restrictive covenant|agreement.*former employer|non-compete/.test(label)) {
    return { kind: 'value', value: 'No' };
  }
  if (/privacy policy|terms.*conditions|acknowledge/.test(label)) {
    return { kind: 'value', value: 'Yes' };
  }
  if (/affirm.*statements.*accurate|certify.*information|all statements and information/.test(label)) {
    return { kind: 'value', value: 'true' };
  }
  if (/itar/.test(label)) {
    return { kind: 'value', value: 'U.S. Citizen' };
  }
  if (/^school$|university|college|institution/.test(label)) {
    return personalInfo.education?.school
      ? { kind: 'value', value: personalInfo.education.school }
      : { kind: 'unresolved' };
  }
  if (/^degree$/.test(label)) {
    return personalInfo.education?.degree
      ? { kind: 'value', value: personalInfo.education.degree }
      : { kind: 'value', value: "Bachelor's Degree" };
  }
  if (/discipline|major|field of study/.test(label)) {
    return personalInfo.education?.discipline
      ? { kind: 'value', value: personalInfo.education.discipline }
      : { kind: 'value', value: 'Computer Science' };
  }
  if (/location \(city\)/.test(label)) {
    return { kind: 'value', value: personalInfo.location };
  }

  return { kind: 'unresolved' };
}
```

Then update the `resolve` method to chain through `tryPattern`:

```ts
resolve(rawLabel: string, ctx: ResolverContext): ResolverResult {
  const label = normalizeLabel(rawLabel);
  const staticResult = this.tryStatic(label, ctx);
  if (staticResult.kind !== 'unresolved') return staticResult;
  const patternResult = this.tryPattern(label);
  if (patternResult.kind !== 'unresolved') return patternResult;
  return { kind: 'unresolved' };
}
```

- [ ] **Step 4: Run tests, confirm all Pattern tests pass**

Run: `npm run build && npm run test:unit -- --test-name-pattern="Pattern"`
Expected: 25 passing tests (the new ones plus any pre-existing pattern-adjacent ones).

Also re-run the StaticFieldMap tests to confirm nothing regressed:

Run: `npm run build && npm run test:unit -- --test-name-pattern="StaticFieldMap"`
Expected: 10 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/greenhouse/field-resolver.ts src/greenhouse/__tests__/field-resolver.test.ts
git commit -m "Add PatternMatcher with 23 regex rules covering Tier 2/3 fields"
```

---

## Task 8: Implement `EEOMapper` resolver

**Files:**
- Modify: `src/greenhouse/field-resolver.ts`
- Modify: `src/greenhouse/__tests__/field-resolver.test.ts`

- [ ] **Step 1: Append failing EEO tests**

Add to the bottom of `field-resolver.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests, confirm EEO tests fail**

Run: `npm run build && npm run test:unit -- --test-name-pattern="EEO:"`
Expected: most fail.

- [ ] **Step 3: Add `EEOMapper` to `field-resolver.ts`**

Add at the top of the file:

```ts
import { EEO_DEFAULTS } from './eeo-options';
```

Inside the `FieldResolver` class, after `tryPattern`, add:

```ts
private tryEEO(label: string): ResolverResult {
  const { personalInfo } = this.resumeData;

  if (label === 'gender') {
    return { kind: 'value', value: personalInfo.gender ?? EEO_DEFAULTS.gender };
  }
  if (/hispanic|latino/.test(label)) {
    return { kind: 'value', value: personalInfo.hispanicLatino ?? EEO_DEFAULTS.hispanicLatino };
  }
  if (/^race|race.*ethnicity|race and ethnicity|i identify my race|race & ethnicity/.test(label)) {
    return { kind: 'value', value: personalInfo.race ?? EEO_DEFAULTS.race };
  }
  if (/veteran/.test(label)) {
    return { kind: 'value', value: personalInfo.veteranStatus ?? EEO_DEFAULTS.veteranStatus };
  }
  if (/disability|i have a disability/.test(label)) {
    return { kind: 'value', value: personalInfo.disabilityStatus ?? EEO_DEFAULTS.disabilityStatus };
  }
  if (/gender identity|lgbtq|sexual orientation|transgender/.test(label)) {
    return { kind: 'value', value: 'Prefer not to answer' };
  }
  return { kind: 'unresolved' };
}
```

Update `resolve` to chain through `tryEEO`:

```ts
resolve(rawLabel: string, ctx: ResolverContext): ResolverResult {
  const label = normalizeLabel(rawLabel);
  const staticResult = this.tryStatic(label, ctx);
  if (staticResult.kind !== 'unresolved') return staticResult;
  const eeoResult = this.tryEEO(label);
  if (eeoResult.kind !== 'unresolved') return eeoResult;
  const patternResult = this.tryPattern(label);
  if (patternResult.kind !== 'unresolved') return patternResult;
  return { kind: 'unresolved' };
}
```

**Order matters:** EEO comes before Pattern so that "Veteran Status" doesn't accidentally match a Pattern rule. The order is: Static → EEO → Pattern → (AI in Task 9).

- [ ] **Step 4: Run all resolver tests, confirm pass**

Run: `npm run build && npm run test:unit -- --test-name-pattern="EEO:|Pattern|StaticFieldMap"`
Expected: 43 passing tests (10 static + 25 pattern + 8 EEO).

- [ ] **Step 5: Commit**

```bash
git add src/greenhouse/field-resolver.ts src/greenhouse/__tests__/field-resolver.test.ts
git commit -m "Add EEOMapper resolver layer"
```

---

## Task 9: Add AI fallback to the resolver

**Files:**
- Modify: `src/greenhouse/field-resolver.ts`
- Modify: `src/greenhouse/__tests__/field-resolver.test.ts`

The resolver becomes async at this stage because the AI call is async. Static/EEO/Pattern stay sync internally, but the public `resolve` method becomes async to await the optional AI step.

- [ ] **Step 1: Append failing AI fallback tests**

Add to the bottom of `field-resolver.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests, confirm AI tests fail**

Run: `npm run build && npm run test:unit -- --test-name-pattern="AI fallback"`
Expected: FAIL ("resolveAsync is not a function").

- [ ] **Step 3: Add AI fallback to `FieldResolver`**

Update the constructor and add `resolveAsync` in `field-resolver.ts`:

```ts
// Add to imports at top of file:
import type { AIAnswerGenerator } from '../ai-answer-generator';

// Replace the existing constructor & add the new method:
export class FieldResolver {
  constructor(
    private readonly resumeData: ResumeData,
    private readonly aiGenerator?: AIAnswerGenerator,
  ) {}

  resolve(rawLabel: string, ctx: ResolverContext): ResolverResult {
    const label = normalizeLabel(rawLabel);
    const staticResult = this.tryStatic(label, ctx);
    if (staticResult.kind !== 'unresolved') return staticResult;
    const eeoResult = this.tryEEO(label);
    if (eeoResult.kind !== 'unresolved') return eeoResult;
    const patternResult = this.tryPattern(label);
    if (patternResult.kind !== 'unresolved') return patternResult;
    return { kind: 'unresolved' };
  }

  async resolveAsync(
    rawLabel: string,
    ctx: ResolverContext,
    opts: { isTextarea: boolean },
  ): Promise<ResolverResult> {
    const syncResult = this.resolve(rawLabel, ctx);
    if (syncResult.kind !== 'unresolved') return syncResult;

    if (!opts.isTextarea) return { kind: 'unresolved' };
    if (!this.aiGenerator || !this.aiGenerator.isEnabled()) {
      return { kind: 'unresolved' };
    }

    const answer = await this.aiGenerator.generateAnswer(rawLabel);
    if (!answer) return { kind: 'unresolved' };
    return { kind: 'value', value: answer };
  }
}
```

- [ ] **Step 4: Run AI fallback tests, confirm pass**

Run: `npm run build && npm run test:unit -- --test-name-pattern="AI fallback"`
Expected: 5 passing tests.

Re-run the full resolver test suite to confirm no regressions:

Run: `npm run build && npm run test:unit -- --test-name-pattern="StaticFieldMap|Pattern|EEO:|AI fallback"`
Expected: 48 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/greenhouse/field-resolver.ts src/greenhouse/__tests__/field-resolver.test.ts
git commit -m "Add AI fallback for Tier 4 textarea questions"
```

---

## Task 10: Scaffold `GreenhouseJobApplicationBot` with stub methods

**Files:**
- Create: `src/greenhouse-bot.ts`

This task creates the class skeleton extending `BaseApplicationBot`, with all required abstract methods implemented as stubs that throw. Subsequent tasks fill in the methods one by one.

- [ ] **Step 1: Write `src/greenhouse-bot.ts`**

```ts
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { BaseApplicationBot } from './base-application-bot';
import type { ResumeData } from '../config/resume-data';
import { AIAnswerGenerator } from './ai-answer-generator';
import { FieldResolver } from './greenhouse/field-resolver';
import type { Field } from './greenhouse/types';
import {
  SELECTORS,
  MAX_RESUME_BYTES,
  UPLOAD_CONFIRMATION_TIMEOUT_MS,
  POST_SUBMIT_VERIFICATION_MS,
} from './greenhouse/selectors';

export interface GreenhouseBotOptions {
  dryRun?: boolean;
}

export class GreenhouseJobApplicationBot extends BaseApplicationBot {
  private aiGenerator: AIAnswerGenerator;
  private resolver: FieldResolver;
  private dryRun: boolean;
  private currentUrl: string | null = null;

  constructor(resumeData: ResumeData, options: GreenhouseBotOptions = {}) {
    super(resumeData);
    this.aiGenerator = new AIAnswerGenerator(resumeData);
    this.resolver = new FieldResolver(resumeData, this.aiGenerator);
    this.dryRun = options.dryRun ?? false;
  }

  async init(headless?: boolean): Promise<void> {
    this.browser = await chromium.launch({ headless: headless ?? false });
    this.page = await this.browser.newPage();
  }

  async applyToJob(jobUrl: string): Promise<void> {
    this.currentUrl = jobUrl;
    if (!this.page) throw new Error('Bot not initialized — call init() first');

    console.log(`\n🌿 Greenhouse: ${jobUrl}`);
    await this.page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
    await this.fillPersonalInfo();
    await this.uploadResume();
    await this.handleAdditionalQuestions();

    if (this.dryRun) {
      console.log('🧪 Dry run — skipping submit');
      return;
    }
    await this.submit();
  }

  async fillPersonalInfo(): Promise<void> {
    throw new Error('not implemented yet (Task 11)');
  }

  async uploadResume(): Promise<void> {
    throw new Error('not implemented yet (Task 12)');
  }

  async handleAdditionalQuestions(): Promise<void> {
    throw new Error('not implemented yet (Task 11)');
  }

  private async submit(): Promise<void> {
    throw new Error('not implemented yet (Task 13)');
  }

  protected async enumerateFields(): Promise<Field[]> {
    throw new Error('not implemented yet (Task 11)');
  }
}
```

- [ ] **Step 2: Compile**

Run: `npm run build`
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add src/greenhouse-bot.ts
git commit -m "Scaffold GreenhouseJobApplicationBot with stub methods"
```

---

## Task 11: Implement field enumeration and filling

**Files:**
- Modify: `src/greenhouse-bot.ts`

The biggest implementation task. Walks every input on the page, builds a `Field[]`, dispatches to the resolver, fills each field.

- [ ] **Step 1: Replace the stub `enumerateFields`, `fillPersonalInfo`, and `handleAdditionalQuestions` methods**

In `src/greenhouse-bot.ts`, replace the three stub methods with this implementation:

```ts
protected async enumerateFields(): Promise<Field[]> {
  if (!this.page) throw new Error('page not ready');
  const fields: Field[] = [];

  const labelHandles = await this.page.locator('label').all();
  for (const labelHandle of labelHandles) {
    const labelText = (await labelHandle.textContent())?.trim() ?? '';
    if (!labelText) continue;

    const forAttr = await labelHandle.getAttribute('for');
    if (!forAttr) continue;

    const escapedForAttr = forAttr.replace(/(["\\#.\[\]:])/g, '\\$1');
    const input = this.page.locator(`#${escapedForAttr}`).first();
    if ((await input.count()) === 0) continue;

    const tagName = (await input.evaluate(el => el.tagName)).toLowerCase();
    const typeAttr = (await input.getAttribute('type')) ?? '';
    const ariaRequired = (await input.getAttribute('aria-required')) === 'true';
    const required = ariaRequired || (await input.getAttribute('required')) !== null
      || /\*\s*$/.test(labelText);
    const role = await input.getAttribute('role');

    let kind: Field['kind'];
    if (tagName === 'textarea') kind = 'textarea';
    else if (tagName === 'select') kind = 'select';
    else if (typeAttr === 'file') kind = 'file';
    else if (typeAttr === 'checkbox') kind = 'checkbox';
    else if (typeAttr === 'radio') kind = 'radio';
    else if (role === 'combobox') kind = 'combobox';
    else kind = 'text';

    const labelClean = labelText.replace(/\*$/, '').trim();

    if (kind === 'select') {
      const options = await input.locator('option').allTextContents();
      fields.push({ kind, label: labelClean, element: input, required, options: options.map(o => o.trim()) });
    } else if (kind === 'radio') {
      const groupName = (await input.getAttribute('name')) ?? '';
      const groupInputs = this.page.locator(`input[name="${groupName}"]`);
      const optionLabels: string[] = [];
      const count = await groupInputs.count();
      for (let i = 0; i < count; i++) {
        const id = await groupInputs.nth(i).getAttribute('id');
        if (id) {
          const optLabel = this.page.locator(`label[for="${id}"]`).first();
          if ((await optLabel.count()) > 0) {
            optionLabels.push(((await optLabel.textContent()) ?? '').trim());
          }
        }
      }
      fields.push({ kind, label: labelClean, element: input, required, options: optionLabels });
    } else {
      fields.push({ kind, label: labelClean, element: input, required } as Field);
    }
  }

  return fields;
}

async fillPersonalInfo(): Promise<void> {
  if (!this.page) throw new Error('page not ready');
  let fields = await this.enumerateFields();

  const phoneFields = fields.filter(f => /^phone$/i.test(f.label));
  const isPhoneFor = (label: string, idx: number): 'first' | 'second' | 'only' | false => {
    if (!/^phone$/i.test(label)) return false;
    if (phoneFields.length === 1) return 'only';
    return idx === 0 ? 'first' : 'second';
  };

  let phoneIdx = -1;
  const countryField = fields.find(f => /^country$/i.test(f.label));
  const universalLabels = /^(first name|last name|email)$/i;

  for (const field of fields) {
    if (!universalLabels.test(field.label)) continue;
    const result = this.resolver.resolve(field.label, { isPhone: false });
    if (result.kind === 'value') await this.fillField(field, result.value);
  }

  if (countryField) {
    const result = this.resolver.resolve('Country', { isPhone: false });
    if (result.kind === 'value') await this.fillField(countryField, result.value);
    await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    fields = await this.enumerateFields();
  }

  const refreshedPhones = fields.filter(f => /^phone$/i.test(f.label));
  for (let i = 0; i < refreshedPhones.length; i++) {
    phoneIdx = i;
    const ctx = isPhoneFor('Phone', phoneIdx);
    const result = this.resolver.resolve('Phone', { isPhone: ctx });
    if (result.kind === 'value') await this.fillField(refreshedPhones[i], result.value);
  }
}

async handleAdditionalQuestions(): Promise<void> {
  if (!this.page) throw new Error('page not ready');
  const fields = await this.enumerateFields();
  const universalLabels = /^(first name|last name|email|phone|country|resume\/cv|resume)$/i;

  for (const field of fields) {
    if (universalLabels.test(field.label)) continue;
    if (field.kind === 'file') continue;

    const isTextarea = field.kind === 'textarea';
    const result = await this.resolver.resolveAsync(
      field.label,
      { isPhone: false },
      { isTextarea },
    );

    if (result.kind === 'value') {
      await this.fillField(field, result.value);
    } else if (result.kind === 'unresolved' && field.required) {
      console.log(`  ⚠️  Unresolved required field: ${field.label}`);
    }
  }
}

private async fillField(field: Field, value: string): Promise<void> {
  switch (field.kind) {
    case 'text':
    case 'textarea':
      await field.element.fill(value);
      break;
    case 'select':
      await field.element.selectOption({ label: value }).catch(async () => {
        await field.element.selectOption({ value }).catch(() => {});
      });
      break;
    case 'combobox':
      await field.element.click();
      if (this.page) {
        const option = this.page.locator('[role="option"]').filter({ hasText: value }).first();
        if ((await option.count()) > 0) await option.click();
      }
      break;
    case 'radio':
      if (this.page) {
        const groupName = await field.element.getAttribute('name');
        if (groupName) {
          const groupInputs = this.page.locator(`input[name="${groupName}"]`);
          const count = await groupInputs.count();
          for (let i = 0; i < count; i++) {
            const radio = groupInputs.nth(i);
            const id = await radio.getAttribute('id');
            if (!id) continue;
            const labelEl = this.page.locator(`label[for="${id}"]`).first();
            const labelText = ((await labelEl.textContent()) ?? '').trim();
            if (labelText.toLowerCase() === value.toLowerCase()) {
              await radio.check();
              break;
            }
          }
        }
      }
      break;
    case 'checkbox':
      if (value === 'true' || value === 'Yes') await field.element.check();
      else await field.element.uncheck();
      break;
    case 'file':
      throw new Error('fillField should not be called for files — use uploadResume()');
  }
}
```

- [ ] **Step 2: Compile to confirm**

Run: `npm run build`
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add src/greenhouse-bot.ts
git commit -m "Implement field enumeration and dispatch-based filling"
```

---

## Task 12: Implement file upload

**Files:**
- Modify: `src/greenhouse-bot.ts`

- [ ] **Step 1: Replace the stub `uploadResume` method**

In `src/greenhouse-bot.ts`, replace the `uploadResume` stub with:

```ts
async uploadResume(): Promise<void> {
  if (!this.page) throw new Error('page not ready');
  const resumeAbsPath = path.resolve(this.resumeData.resumePath);
  if (!fs.existsSync(resumeAbsPath)) {
    console.log(`  ❌ Resume file not found: ${resumeAbsPath}`);
    return;
  }
  const size = fs.statSync(resumeAbsPath).size;
  if (size > MAX_RESUME_BYTES) {
    console.log(`  ❌ Resume exceeds 10MB cap (${size} bytes)`);
    return;
  }

  const resumeInput = this.page.locator(SELECTORS.resumeFileInput).first();
  if ((await resumeInput.count()) === 0) {
    console.log('  ⚠️  No resume file input found');
    return;
  }
  await resumeInput.setInputFiles(resumeAbsPath);
  console.log(`  ✓ Uploaded resume: ${path.basename(resumeAbsPath)}`);

  await this.page
    .locator(SELECTORS.uploadConfirmation)
    .first()
    .waitFor({ timeout: UPLOAD_CONFIRMATION_TIMEOUT_MS })
    .catch(() => console.log('  ⚠️  Upload confirmation not detected (continuing)'));

  if (this.resumeData.coverLetterPath) {
    const clAbsPath = path.resolve(this.resumeData.coverLetterPath);
    if (fs.existsSync(clAbsPath)) {
      const clInput = this.page.locator(SELECTORS.coverLetterFileInput).first();
      if ((await clInput.count()) > 0) {
        await clInput.setInputFiles(clAbsPath);
        console.log(`  ✓ Uploaded cover letter: ${path.basename(clAbsPath)}`);
      }
    }
  }
}
```

- [ ] **Step 2: Compile**

Run: `npm run build`
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add src/greenhouse-bot.ts
git commit -m "Implement Greenhouse file upload for resume and cover letter"
```

---

## Task 13: Implement submit + post-submit verification

**Files:**
- Modify: `src/greenhouse-bot.ts`

- [ ] **Step 1: Replace the stub `submit` method**

In `src/greenhouse-bot.ts`, replace the private `submit` stub with:

```ts
private async submit(): Promise<void> {
  if (!this.page) throw new Error('page not ready');
  const captcha = this.page.locator(SELECTORS.recaptchaIframe);
  if ((await captcha.count()) > 0) {
    console.log('  ❌ reCAPTCHA detected — submission aborted, moving on');
    return;
  }

  const submitBtn = this.page.locator(SELECTORS.submitButton).first();
  if ((await submitBtn.count()) === 0) {
    console.log('  ❌ Submit button not found');
    return;
  }

  const beforeUrl = this.page.url();
  await submitBtn.click();

  try {
    await this.page.waitForFunction(
      (prevUrl) =>
        window.location.href !== prevUrl ||
        document.body.innerText.match(/application submitted|thank you for applying|your application/i),
      beforeUrl,
      { timeout: POST_SUBMIT_VERIFICATION_MS },
    );
    console.log('  ✓ Submission confirmed');
  } catch {
    console.log('  ⚠️  Submission status uncertain — manual review required');
  }
}
```

- [ ] **Step 2: Compile**

Run: `npm run build`
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add src/greenhouse-bot.ts
git commit -m "Implement Greenhouse submit with reCAPTCHA detection and verification"
```

---

## Task 14: Wire URL router + `--dry-run` into `apply.ts`

**Files:**
- Modify: `src/apply.ts`

This task replaces the Ashby-only validation with a hostname-based router that dispatches to either bot.

- [ ] **Step 1: Read current `src/apply.ts` to know exact contents**

Run: `cat src/apply.ts`

- [ ] **Step 2: Rewrite `src/apply.ts`**

Replace the entire file with:

```ts
import dotenv from 'dotenv';
dotenv.config();

import { resumeData } from '../config/resume-data';
import { AshbyJobApplicationBot } from './ashby-bot';
import { GreenhouseJobApplicationBot } from './greenhouse-bot';

type Platform = 'ashby' | 'greenhouse' | 'unknown';

function detectPlatform(url: string): Platform {
  if (url.includes('ashbyhq.com')) return 'ashby';
  if (url.includes('greenhouse.io')) return 'greenhouse';
  return 'unknown';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const jobUrls: string[] = [
    // Add job URLs here (Ashby or Greenhouse). Examples:
    // 'https://jobs.ashbyhq.com/replit/...',
    // 'https://job-boards.greenhouse.io/discord/jobs/...',
  ];

  if (jobUrls.length === 0) {
    console.log('⚠️  No job URLs configured!');
    console.log('Edit src/apply.ts and add URLs to the jobUrls array.');
    return;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Processing ${jobUrls.length} job application(s)${dryRun ? ' [DRY RUN]' : ''}`);
  console.log(`${'='.repeat(70)}\n`);

  const ashbyBot = new AshbyJobApplicationBot(resumeData);
  const greenhouseBot = new GreenhouseJobApplicationBot(resumeData, { dryRun });

  let initializedAshby = false;
  let initializedGreenhouse = false;

  try {
    for (const jobUrl of jobUrls) {
      const platform = detectPlatform(jobUrl);
      console.log(`\n${'-'.repeat(70)}`);

      if (platform === 'ashby') {
        if (!initializedAshby) {
          await ashbyBot.init(false);
          initializedAshby = true;
        }
        await ashbyBot.applyToJob(jobUrl);
      } else if (platform === 'greenhouse') {
        if (!initializedGreenhouse) {
          await greenhouseBot.init(false);
          initializedGreenhouse = true;
        }
        await greenhouseBot.applyToJob(jobUrl);
      } else {
        console.log(`⏭️  Skipping unsupported URL: ${jobUrl}`);
      }

      console.log(`${'-'.repeat(70)}\n`);

      if (jobUrls.length > 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    console.log('✨ All applications processed!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    console.log('\n⏳ Browser will stay open for 20 seconds for review...');
    await new Promise(r => setTimeout(r, 20000));
    if (initializedAshby) await ashbyBot.close();
    if (initializedGreenhouse) await greenhouseBot.close();
  }
}

main();
```

- [ ] **Step 3: Compile**

Run: `npm run build`
Expected: clean compile.

- [ ] **Step 4: Commit**

```bash
git add src/apply.ts
git commit -m "Add URL router and --dry-run flag to apply.ts"
```

---

## Task 15: Final validation — full build + test pass

**Files:** none modified

- [ ] **Step 1: Full clean build**

Run: `npm run build`
Expected: clean compile, no errors.

- [ ] **Step 2: Full unit test run**

Run: `npm run test:unit`
Expected: all tests pass (existing Ashby tests + 48 new Greenhouse resolver tests + 5 EEO tests = 53 new tests at minimum).

- [ ] **Step 3: Smoke test with a real Greenhouse URL in dry-run mode (MANUAL)**

This step requires human verification — the engineer adds one Greenhouse URL to `src/apply.ts` and runs:

```bash
npm run start -- --dry-run
```

Expected:
- Browser opens, navigates to the Greenhouse form
- Universal fields (name, email, country) fill correctly
- Second phone field fills, first is skipped
- EEO dropdowns populate with the expected values
- Submit button is NOT clicked (dry-run)
- No crashes

If smoke test fails, debug the specific failure before committing further. The engineer should not commit a fix without a test for it.

- [ ] **Step 4: Commit (only if everything passes)**

If the smoke test surfaced no fixes:

```bash
git commit --allow-empty -m "Validate Greenhouse bot end-to-end (smoke passed)"
```

If fixes were needed during smoke testing, they should be committed as part of the task that introduced the bug (likely Task 11), not as a separate commit here.

---

## Summary

15 tasks. ~50 commits expected. Estimated effort: 4-6 hours for a developer familiar with TypeScript and Playwright, plus the manual smoke-test time in Task 15.

The first 9 tasks build out a fully-tested, pure-logic resolver. Tasks 10-14 build the browser-driving layer on top. Task 15 is the live validation gate.

Anywhere a step says "expected: X passing tests," the count is a guide — additions in earlier tasks may have increased the count. Trust the actual numbers from the test runner, not the plan.
