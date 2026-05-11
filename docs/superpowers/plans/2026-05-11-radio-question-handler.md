# Radio-Question Handler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AshbyHQ bot detect and answer multi-option radio-group questions by asking the AI to pick the best option, with configurable defaults for "soft" questions and post-submit recovery as a safety net.

**Architecture:** Add a new `pickFromOptions(question, options)` method to `AIAnswerGenerator` that returns a verbatim option string. Add a `config/answer-preferences.ts` module for tone + default fallbacks. Add a new private `fillRequiredRadioGroups()` method to `AshbyJobApplicationBot` that scans for `<fieldset>` elements with required title labels, extracts options, asks the AI, and clicks the matching label. Wire it into both `handleAdditionalQuestions()` (pre-submit pass) and the post-submit error-recovery loop.

**Tech Stack:** TypeScript, Playwright, Anthropic SDK (`@anthropic-ai/sdk`), Node's built-in `node:test` runner.

**Spec:** `docs/superpowers/specs/2026-05-11-radio-question-handler-design.md`

---

## File Structure

- **Create** `config/answer-preferences.ts` — exports `AnswerPreferences` interface and `PREFERENCES` constant (tone + fallback defaults).
- **Modify** `src/ai-answer-generator.ts`:
  - Add `pickFromOptions(question: string, options: string[]): Promise<string | null>`.
  - Import `PREFERENCES` for the fallback step.
- **Create** `src/utils/question-classifier.ts` — exports `classifyQuestion(question): 'howDidYouHear' | 'other' | 'generic'` (small pure helper that the AI module and fallback path both use).
- **Create** `src/utils/__tests__/question-classifier.test.ts` — unit tests for the classifier.
- **Modify** `src/ashby-bot.ts`:
  - Add private `fillRequiredRadioGroups()` method (new ~80-line block).
  - Call it from `handleAdditionalQuestions()` (`src/ashby-bot.ts:258`).
  - Call it from the post-submit recovery loop near `src/ashby-bot.ts:1163-1323`.

---

### Task 1: Create the answer-preferences config

**Files:**
- Create: `config/answer-preferences.ts`

- [ ] **Step 1: Write the module**

```typescript
export interface AnswerPreferences {
  tone: 'strongest-plausible' | 'honest' | 'modest';
  defaults: {
    howDidYouHear: string;
    other: string;
  };
}

export const PREFERENCES: AnswerPreferences = {
  tone: 'strongest-plausible',
  defaults: {
    howDidYouHear: 'LinkedIn',
    other: 'Other',
  },
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add config/answer-preferences.ts
git commit -m "Add answer preferences config"
```

---

### Task 2: Create the question classifier

**Files:**
- Create: `src/utils/question-classifier.ts`

- [ ] **Step 1: Write the module**

```typescript
export type QuestionCategory = 'howDidYouHear' | 'other' | 'generic';

const HOW_DID_YOU_HEAR_PATTERNS = [
  /how did you hear/i,
  /where did you hear/i,
  /how did you find/i,
  /how did you learn about/i,
];

const OTHER_PATTERNS = [
  /which best applies to you/i,
  /which (of these )?best describes/i,
];

export function classifyQuestion(question: string): QuestionCategory {
  if (HOW_DID_YOU_HEAR_PATTERNS.some(p => p.test(question))) {
    return 'howDidYouHear';
  }
  if (OTHER_PATTERNS.some(p => p.test(question))) {
    return 'other';
  }
  return 'generic';
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/question-classifier.ts
git commit -m "Add question classifier for radio-group fallbacks"
```

---

### Task 3: Add unit tests for the question classifier

**Files:**
- Create: `src/utils/__tests__/question-classifier.test.ts`

The project's existing `test:unit` script (added during the submission-log feature) runs `tsc` then `node --test dist/src/utils/__tests__/*.test.js`. We just add another test file to that directory.

- [ ] **Step 1: Write the tests**

```typescript
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
```

- [ ] **Step 2: Run the tests and verify they pass**

Run: `npm run test:unit`
Expected: all classifier tests pass (alongside the 5 submission-logger tests if that feature is also on this branch — on this `radio-question-handler` branch off main, only the new classifier tests run).

- [ ] **Step 3: Commit**

```bash
git add src/utils/__tests__/question-classifier.test.ts
git commit -m "Add unit tests for question classifier"
```

---

### Task 4: Add `pickFromOptions` to `AIAnswerGenerator`

**Files:**
- Modify: `src/ai-answer-generator.ts`

- [ ] **Step 1: Add the import at the top of the file**

Below the existing `import { ResumeData } from '../config/resume-data';` line, add:

```typescript
import { PREFERENCES } from '../config/answer-preferences';
import { classifyQuestion } from './utils/question-classifier';
```

- [ ] **Step 2: Add the `pickFromOptions` method**

Insert this method on the `AIAnswerGenerator` class, immediately before the existing `isEnabled()` method (at the end of the class body):

```typescript
/**
 * Ask the AI to pick exactly one option from a list, given the question text.
 * Returns the verbatim chosen option string, or null if the AI is disabled
 * and no fallback applies.
 *
 * Fallback strategy (in order):
 *   1. If AI returns a string that doesn't exactly match any option, retry once with stricter instructions.
 *   2. If still no match, classify the question; for 'howDidYouHear', return the
 *      option matching PREFERENCES.defaults.howDidYouHear (case-insensitive).
 *   3. If any option equals PREFERENCES.defaults.other (case-insensitive), return it.
 *   4. Otherwise return null (caller should log + skip).
 */
async pickFromOptions(question: string, options: string[]): Promise<string | null> {
  if (options.length === 0) {
    return null;
  }

  const fallback = (): string | null => {
    const category = classifyQuestion(question);
    if (category === 'howDidYouHear') {
      const match = options.find(o => o.toLowerCase() === PREFERENCES.defaults.howDidYouHear.toLowerCase());
      if (match) return match;
    }
    const otherMatch = options.find(o => o.toLowerCase() === PREFERENCES.defaults.other.toLowerCase());
    if (otherMatch) return otherMatch;
    return null;
  };

  if (!this.client || !this.resumeData.aiConfig?.enabled) {
    return fallback();
  }

  const askModel = async (strict: boolean): Promise<string | null> => {
    try {
      const { personalInfo, preferences, aiConfig } = this.resumeData;
      const background = aiConfig.background || 'I am a software engineer looking for new opportunities.';
      const tone = PREFERENCES.tone;

      const optionList = options.map((o, i) => `${i + 1}. ${o}`).join('\n');

      const instruction = strict
        ? 'CRITICAL: Respond with the EXACT text of one option, copy-paste from the list above. No extra words, no quotes, no numbering.'
        : 'Respond with the exact text of the option you choose. Do not add quotes, numbering, or explanation.';

      const prompt = `You are helping fill out a job application. Pick exactly ONE option from the list below.

Applicant background:
${background}

Name: ${personalInfo.firstName} ${personalInfo.lastName}
Years of Experience: ${personalInfo.yearsOfExperience || 'Not specified'}
Requires Visa Sponsorship: ${preferences.requiresVisaSponsorship ? 'Yes' : 'No'}

Tone preference: ${tone} (pick the strongest plausible option that the resume supports; do not overclaim).

Question: ${question}

Options:
${optionList}

${instruction}`;

      const messageContent: Array<any> = [];
      if (this.resumeBase64) {
        messageContent.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: this.resumeBase64 },
        });
      }
      messageContent.push({ type: 'text', text: prompt });

      const message = await this.client!.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 200,
        messages: [{ role: 'user', content: messageContent }],
      });

      const textContent = message.content.find(block => block.type === 'text');
      if (!textContent || textContent.type !== 'text') return null;

      const raw = textContent.text.trim();
      const match = options.find(o => o === raw)
        ?? options.find(o => o.toLowerCase() === raw.toLowerCase())
        ?? options.find(o => raw.toLowerCase().includes(o.toLowerCase()));
      return match ?? null;
    } catch (error) {
      console.log(`  ⚠️  Failed to pick option via AI: ${error}`);
      return null;
    }
  };

  const first = await askModel(false);
  if (first) return first;

  const second = await askModel(true);
  if (second) return second;

  return fallback();
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ai-answer-generator.ts
git commit -m "Add pickFromOptions to AIAnswerGenerator"
```

---

### Task 5: Add unit tests for `pickFromOptions` fallback paths

We can't easily unit-test the AI round-trip without mocking the Anthropic SDK. We can, however, test the deterministic fallback paths (no client, AI disabled, AI returns null). To keep this simple, we test the fallback behavior by constructing an `AIAnswerGenerator` with `aiConfig.enabled: false`.

**Files:**
- Create: `src/utils/__tests__/ai-answer-generator-fallback.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
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

test('generic question with AI disabled but "Other" present returns Other', async () => {
  const gen = makeGenerator();
  const result = await gen.pickFromOptions(
    'Which best applies to you?',
    ['Option A', 'Option B', 'Other'],
  );
  assert.strictEqual(result, 'Other');
});

test('empty options list returns null', async () => {
  const gen = makeGenerator();
  const result = await gen.pickFromOptions('Anything', []);
  assert.strictEqual(result, null);
});

test('howDidYouHear question with AI disabled returns null when the default is not in options', async () => {
  const gen = makeGenerator();
  const result = await gen.pickFromOptions(
    'How did you hear about us?',
    ['Twitter', 'Reddit', 'Friend'],
  );
  // LinkedIn not present; classifier falls through to "Other"; Other not present; returns null
  assert.strictEqual(result, null);
});
```

Note on the cast `as unknown as ResumeData`: `ResumeData` may have additional required fields. We use the cast to keep this test focused on `aiConfig.enabled: false` behavior without depending on the full schema. If your `ResumeData` doesn't have `aiConfig.enabled` as a recognized field, look at `config/resume-data.example.ts` for the canonical shape and adjust.

- [ ] **Step 2: Run the tests and verify they pass**

Run: `npm run test:unit`
Expected: all 5 fallback tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/utils/__tests__/ai-answer-generator-fallback.test.ts
git commit -m "Add unit tests for pickFromOptions fallback paths"
```

---

### Task 6: Add `fillRequiredRadioGroups()` to the bot

**Files:**
- Modify: `src/ashby-bot.ts`

- [ ] **Step 1: Add the method**

Locate `fillEmptyRequiredFields()` (around `src/ashby-bot.ts:1414`). Insert a new private method immediately before it:

```typescript
/**
 * Find all required radio-group <fieldset> elements that are not yet answered,
 * ask the AI to pick the best option, and click the matching label.
 *
 * AshbyHQ radio groups look like:
 *   <fieldset>
 *     <label class="...ashby-application-form-question-title _required_*">Question?</label>
 *     <div class="_option_*">
 *       <input type="radio" id="..." name="..." />
 *       <label for="...">Option text</label>
 *     </div>
 *     ... more options ...
 *   </fieldset>
 *
 * The `_required_` class lives on the question <label>, NOT on the <input> elements,
 * so this method scans for fieldsets directly instead of relying on aria-required.
 */
private async fillRequiredRadioGroups(): Promise<void> {
  if (!this.page) return;

  console.log('🔘 Scanning for required radio-group questions...');

  // Find fieldsets whose first descendant label carries the required class.
  // The class name uses a CSS-Modules hash (e.g. `_required_101oc_92`), so match by prefix.
  const fieldsets = await this.page.locator('fieldset').all();

  let processed = 0;
  let filled = 0;

  for (const fieldset of fieldsets) {
    try {
      const titleLabel = fieldset.locator('label.ashby-application-form-question-title').first();
      const titleCount = await titleLabel.count();
      if (titleCount === 0) continue;

      const classAttr = await titleLabel.getAttribute('class') ?? '';
      const isRequired = /_required_/.test(classAttr);
      if (!isRequired) continue;

      // Skip if already answered
      const checkedRadios = await fieldset.locator('input[type="radio"]:checked').count();
      if (checkedRadios > 0) continue;

      const questionText = (await titleLabel.textContent())?.trim() ?? '';
      if (!questionText) continue;

      // Extract options: each <input type="radio"> with its sibling <label>
      const radios = await fieldset.locator('input[type="radio"]').all();
      const options: { inputId: string; text: string }[] = [];
      for (const radio of radios) {
        const inputId = await radio.getAttribute('id');
        if (!inputId) continue;
        const labelLocator = this.page.locator(`label[for="${inputId}"]`).first();
        const labelText = (await labelLocator.textContent())?.trim() ?? '';
        if (labelText) {
          options.push({ inputId, text: labelText });
        }
      }

      if (options.length === 0) {
        console.log(`  ⚠️  Required radio group "${questionText}" has no extractable options.`);
        continue;
      }

      processed++;
      console.log(`  ❓ ${questionText}`);
      console.log(`     Options: ${options.map(o => o.text).join(' | ')}`);

      const chosen = await this.aiGenerator.pickFromOptions(questionText, options.map(o => o.text));

      if (!chosen) {
        console.log(`  ⚠️  Could not pick an option for "${questionText}". Skipping.`);
        continue;
      }

      const target = options.find(o => o.text === chosen);
      if (!target) {
        console.log(`  ⚠️  AI returned "${chosen}" which does not match any option. Skipping.`);
        continue;
      }

      // Click the label (the input is custom-styled and may be visually hidden)
      const labelToClick = this.page.locator(`label[for="${target.inputId}"]`).first();
      await labelToClick.click({ timeout: 5000 }).catch(async () => {
        // Fallback: try clicking the input directly via JS
        const input = this.page!.locator(`#${CSS.escape(target.inputId)}`).first();
        await input.check({ force: true, timeout: 5000 }).catch(() => {});
      });

      // Verify it's checked
      const verifyChecked = await this.page.locator(`#${CSS.escape(target.inputId)}:checked`).count();
      if (verifyChecked > 0) {
        console.log(`  ✅ Selected "${target.text}" for "${questionText}"`);
        filled++;
      } else {
        console.log(`  ⚠️  Clicked but radio is not checked for "${questionText}"`);
      }
    } catch (error) {
      console.log(`  ⚠️  Error processing a radio group: ${error}`);
      continue;
    }
  }

  console.log(`🔘 Radio-group pass: ${filled}/${processed} answered`);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ashby-bot.ts
git commit -m "Add fillRequiredRadioGroups to AshbyJobApplicationBot"
```

---

### Task 7: Wire `fillRequiredRadioGroups()` into the pre-submit pass

**Files:**
- Modify: `src/ashby-bot.ts` (inside `handleAdditionalQuestions()`, around line 258)

- [ ] **Step 1: Locate the end of `handleAdditionalQuestions()`**

Open `src/ashby-bot.ts` and find `handleAdditionalQuestions()`. The method spans roughly lines 258-930. Insert a call to the new method at the very end of the method body, just before the closing `}`.

Add this line as the last statement inside the `try` block (or as the last statement before the method's final `}` if the method has no surrounding try/catch):

```typescript
    // Fill any required radio groups that the per-field handlers above didn't catch
    await this.fillRequiredRadioGroups();
```

If the method ends with a `catch` block, place the call at the very end of the `try`, before the catch. If you're unsure exactly where it ends, search for the next `async ` method definition after `handleAdditionalQuestions()` — the call belongs just inside the closing brace of the previous method.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ashby-bot.ts
git commit -m "Call fillRequiredRadioGroups from handleAdditionalQuestions"
```

---

### Task 8: Wire `fillRequiredRadioGroups()` into the post-submit recovery loop

**Files:**
- Modify: `src/ashby-bot.ts` (around line 1163-1323 where "Missing entry for required field" errors are processed)

- [ ] **Step 1: Locate the recovery block**

The recovery code starts near `src/ashby-bot.ts:1163` with:

```typescript
if (errorText && errorText.includes('Missing entry for required field')) {
```

Find the function that contains this block (it's the post-submit retry path). Add a call to `fillRequiredRadioGroups()` BEFORE the existing per-field recovery logic runs, so radio groups get filled first and the remaining per-field logic only handles text/checkbox fields.

Concretely: just inside the function where the `Missing entry for required field` matching happens, before the loop that processes each missing-field message, add:

```typescript
    // Try radio groups first — many "Missing entry" errors are actually radio groups
    await this.fillRequiredRadioGroups();
```

If the recovery code is structured as `for (const errorMsg of errorMessages) { ... }`, place the call BEFORE that for-loop. If you're not sure where the "before the loop" point is, search backward from line 1163 for the nearest `async` function declaration and put the call as the first action inside that function (after any null-checks like `if (!this.page) return;`).

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ashby-bot.ts
git commit -m "Run fillRequiredRadioGroups in post-submit recovery"
```

---

### Task 9: Manual end-to-end verification

**Files:** none (manual verification)

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 2: Run the bot against the Teamworks job (or another AshbyHQ form with radio groups)**

Run: `npm start`

Watch the console for:
- `🔘 Scanning for required radio-group questions...`
- One `❓ <question>` line per detected required radio group.
- One `Options: a | b | c` line per group.
- One `✅ Selected "<option>" for "<question>"` line per filled group, OR a `⚠️` line if it skipped.
- Final `🔘 Radio-group pass: X/Y answered` summary.

- [ ] **Step 3: Verify the form submits cleanly**

Expected: no `Missing entry for required field` errors for the questions:
- "How would you describe your Python background?"
- "Do you have experience using Teamworks?"
- "How did you hear about Teamworks?" (should pick LinkedIn)
- "Which best applies to you?"

If the submission still fails on a radio question, capture the console output and the page HTML for that fieldset — the option text from the AI might not exactly match the label text (e.g., trailing whitespace, NBSP, or punctuation differences).

---

## Self-Review

- **Spec coverage:**
  - `pickFromOptions(question, options)` → Task 4.
  - `config/answer-preferences.ts` with tone + defaults → Task 1.
  - Question classifier → Tasks 2 + 3.
  - `fillRequiredRadioGroups()` private method that scans fieldsets, extracts options, asks AI, clicks the label → Task 6.
  - Wired into pre-submit pass → Task 7.
  - Wired into post-submit recovery loop → Task 8.
  - Fallback strategy (howDidYouHear → "LinkedIn"; else "Other"; else null + log) → implemented inside `pickFromOptions` in Task 4, tested in Task 5.
  - Clicks label, not hidden input → Task 6 step 1.
  - Unit tests for classifier → Task 3.
  - Unit tests for fallback paths of `pickFromOptions` → Task 5.
  - Manual end-to-end → Task 9.

- **Placeholder scan:** no TBDs. The "search backward for the nearest async function" guidance in Task 8 is intentionally explicit, not vague — the actual code lives at a known line range but the surrounding function's boundaries depend on the engineer reading the file.

- **Type consistency:**
  - `pickFromOptions` returns `Promise<string | null>` in Task 4; Task 6 handles `null` by skipping (no type drift).
  - `classifyQuestion` returns `'howDidYouHear' | 'other' | 'generic'` in Task 2; consumed by `pickFromOptions` in Task 4 with matching string literals.
  - `PREFERENCES.defaults.howDidYouHear` is a `string` in Task 1; consumed as a string in Tasks 4 and 5.
  - The bot calls `this.aiGenerator.pickFromOptions(...)` in Task 6 with `string[]` and string question — matches Task 4 signature.
