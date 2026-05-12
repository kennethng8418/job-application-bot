# Willing-to-Relocate Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `willingToRelocate?: boolean` flag to the `Preferences` interface and surface it in all three AI prompts so the bot answers relocation questions correctly.

**Architecture:** One new optional boolean field added to the `Preferences` interface (declared in both `config/resume-data.ts` and `config/resume-data.example.ts`). Three single-line additions in `src/ai-answer-generator.ts` — one each in `generateAnswer`, `answerYesNoQuestion`, and `pickFromOptions` — all using the same `${preferences.willingToRelocate ? 'Yes' : 'No'}` coercion alongside the existing flag-driven prompt lines.

**Tech Stack:** TypeScript, Anthropic SDK (`@anthropic-ai/sdk`).

**Spec:** `docs/superpowers/specs/2026-05-12-willing-to-relocate-design.md`

**Testing note:** This is a single-flag config + three prompt-string edits. No new unit tests are added — the change is too small for mocked-SDK tests to pay for their maintenance, and the existing `src/utils/__tests__/ai-answer-generator-fallback.test.ts` continues to cover the fallback paths. Verification is `npx tsc --noEmit` plus a manual end-to-end run against the form that previously answered "No" to the Foster City relocation question.

---

## File Structure

- **Modify** `config/resume-data.ts`:
  - Add `willingToRelocate?: boolean` to the `Preferences` interface (after `requiresVisaSponsorship`, before `over18`).
  - Add `willingToRelocate: true` to the `preferences` literal (in the same relative position).
- **Modify** `config/resume-data.example.ts`:
  - Same interface change.
  - Same literal change (also `true` so the example is illustrative).
- **Modify** `src/ai-answer-generator.ts`:
  - In `generateAnswer` (around line 63), add one line after `Requires Visa Sponsorship: ...`.
  - In `answerYesNoQuestion` (around line 139), add one bullet line after `- US Citizen: ...`.
  - In `pickFromOptions` (around line 230), add one line after `Requires Visa Sponsorship: ...`.

No new files. No deletions. No structural refactors.

---

### Task 1: Add `willingToRelocate` to the canonical `Preferences` interface and literal

**Files:**
- Modify: `config/resume-data.ts`

- [ ] **Step 1: Add the interface field**

Locate the `Preferences` block inside the `ResumeData` interface in `config/resume-data.ts`. It contains the line:

```typescript
    requiresVisaSponsorship?: boolean; // Do you require visa sponsorship?
```

Insert the new field immediately after that line and before `over18?: boolean;`:

```typescript
    willingToRelocate?: boolean; // Are you willing to relocate for the right role?
```

The result should look like this snippet inside the interface:

```typescript
    requiresVisaSponsorship?: boolean; // Do you require visa sponsorship?
    willingToRelocate?: boolean; // Are you willing to relocate for the right role?
    over18?: boolean; // Are you at least 18 years of age?
```

- [ ] **Step 2: Add the literal value**

In the same file, the exported `resumeData` constant has a `preferences` object containing:

```typescript
    requiresVisaSponsorship: false, // Don't require visa sponsorship
```

Insert immediately after that line, before `over18: true`:

```typescript
    willingToRelocate: true, // Open to relocating for the right role
```

The result should look like this snippet inside the literal:

```typescript
    requiresVisaSponsorship: false, // Don't require visa sponsorship
    willingToRelocate: true, // Open to relocating for the right role
    over18: true, // At least 18 years old
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Verify with grep**

Run: `grep -n "willingToRelocate" config/resume-data.ts`
Expected: exactly two matches — one in the interface declaration (with `?:`), one in the literal.

- [ ] **Step 5: Commit**

```bash
git add config/resume-data.ts
git commit -m "Add willingToRelocate to Preferences interface and resume-data"
```

---

### Task 2: Mirror the interface change in `resume-data.example.ts`

**Files:**
- Modify: `config/resume-data.example.ts`

- [ ] **Step 1: Add the interface field**

Locate the `Preferences` block inside the `ResumeData` interface in `config/resume-data.example.ts`. It contains the line:

```typescript
    requiresVisaSponsorship?: boolean; // Do you require visa sponsorship?
```

Insert immediately after that line and before `over18?: boolean;`:

```typescript
    willingToRelocate?: boolean; // Are you willing to relocate for the right role?
```

The interface snippet after the change:

```typescript
    requiresVisaSponsorship?: boolean; // Do you require visa sponsorship?
    willingToRelocate?: boolean; // Are you willing to relocate for the right role?
    over18?: boolean; // Are you at least 18 years of age?
```

- [ ] **Step 2: Add the literal value**

In the same file, the exported `resumeData` constant has a `preferences` object containing:

```typescript
    requiresVisaSponsorship: false, // Don't require visa sponsorship
```

Insert immediately after, before `over18: true`:

```typescript
    willingToRelocate: true, // Open to relocating for the right role
```

The literal snippet after the change:

```typescript
    requiresVisaSponsorship: false, // Don't require visa sponsorship
    willingToRelocate: true, // Open to relocating for the right role
    over18: true, // At least 18 years old
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Verify with grep**

Run: `grep -n "willingToRelocate" config/resume-data.example.ts`
Expected: exactly two matches.

- [ ] **Step 5: Commit**

```bash
git add config/resume-data.example.ts
git commit -m "Mirror willingToRelocate field in resume-data.example.ts"
```

---

### Task 3: Add `Willing to Relocate` line to `generateAnswer`

**Files:**
- Modify: `src/ai-answer-generator.ts` (around line 63)

- [ ] **Step 1: Add the prompt line**

In `src/ai-answer-generator.ts`, the `generateAnswer` method's prompt template (around lines 51–77) currently contains this section:

```typescript
US Citizen: ${preferences.usCitizen ? 'Yes' : 'No'}
Requires Visa Sponsorship: ${preferences.requiresVisaSponsorship ? 'Yes' : 'No'}
```

Insert a new line immediately after `Requires Visa Sponsorship: ...`:

```typescript
Willing to Relocate: ${preferences.willingToRelocate ? 'Yes' : 'No'}
```

The resulting block (still inside the template literal):

```typescript
US Citizen: ${preferences.usCitizen ? 'Yes' : 'No'}
Requires Visa Sponsorship: ${preferences.requiresVisaSponsorship ? 'Yes' : 'No'}
Willing to Relocate: ${preferences.willingToRelocate ? 'Yes' : 'No'}
```

Do NOT add a new instruction to the numbered list below — instruction #2 ("If this is a simple yes/no question, answer ONLY with Yes or No") already handles relocation questions correctly once the flag is in scope.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/ai-answer-generator.ts
git commit -m "Pass willingToRelocate to generateAnswer prompt"
```

---

### Task 4: Add `Willing to Relocate` bullet to `answerYesNoQuestion`

**Files:**
- Modify: `src/ai-answer-generator.ts` (around line 139)

- [ ] **Step 1: Add the bullet line**

In `src/ai-answer-generator.ts`, the `answerYesNoQuestion` method's prompt template currently contains this bullet block:

```typescript
- Sponsorship Required: ${preferences.requiresVisaSponsorship ? 'Yes' : 'No'}
- US Citizen: ${preferences.usCitizen ? 'Yes' : 'No'}
- Start Date: ${preferences.startDate || 'Flexible'}
```

Insert a new bullet line immediately after `- US Citizen: ...` and before `- Start Date: ...`:

```typescript
- Willing to Relocate: ${preferences.willingToRelocate ? 'Yes' : 'No'}
```

The resulting block:

```typescript
- Sponsorship Required: ${preferences.requiresVisaSponsorship ? 'Yes' : 'No'}
- US Citizen: ${preferences.usCitizen ? 'Yes' : 'No'}
- Willing to Relocate: ${preferences.willingToRelocate ? 'Yes' : 'No'}
- Start Date: ${preferences.startDate || 'Flexible'}
```

Note the leading `- ` (dash + space) — the bullet style of this block differs from `generateAnswer`'s plain lines.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/ai-answer-generator.ts
git commit -m "Pass willingToRelocate to answerYesNoQuestion prompt"
```

---

### Task 5: Add `Willing to Relocate` line to `pickFromOptions`

**Files:**
- Modify: `src/ai-answer-generator.ts` (around line 230)

- [ ] **Step 1: Add the prompt line**

In `src/ai-answer-generator.ts`, the `pickFromOptions` method's prompt template (inside the `askModel` inner function, around lines 223–239) currently contains:

```typescript
Name: ${personalInfo.firstName} ${personalInfo.lastName}
Years of Experience: ${personalInfo.yearsOfExperience || 'Not specified'}
Requires Visa Sponsorship: ${preferences.requiresVisaSponsorship ? 'Yes' : 'No'}
```

Insert a new line immediately after `Requires Visa Sponsorship: ...`, before the blank line that precedes `Tone preference:`:

```typescript
Willing to Relocate: ${preferences.willingToRelocate ? 'Yes' : 'No'}
```

The resulting block:

```typescript
Name: ${personalInfo.firstName} ${personalInfo.lastName}
Years of Experience: ${personalInfo.yearsOfExperience || 'Not specified'}
Requires Visa Sponsorship: ${preferences.requiresVisaSponsorship ? 'Yes' : 'No'}
Willing to Relocate: ${preferences.willingToRelocate ? 'Yes' : 'No'}

Tone preference: ${tone} (pick the strongest plausible option that the resume supports; do not overclaim).
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Verify all three prompt sites are wired**

Run: `grep -n "Willing to Relocate" src/ai-answer-generator.ts`

Expected output: exactly three matches — one per method (`generateAnswer`, `answerYesNoQuestion`, `pickFromOptions`).

- [ ] **Step 4: Commit**

```bash
git add src/ai-answer-generator.ts
git commit -m "Pass willingToRelocate to pickFromOptions prompt"
```

---

### Task 6: Manual end-to-end verification

**Files:**
- No code changes.

- [ ] **Step 1: Confirm a target URL is uncommented in `src/apply.ts`**

The same AshbyHQ application that previously answered "No" to the Foster City relocation question is the easiest test target. Open `src/apply.ts` and confirm the appropriate URL is uncommented in the `jobUrls` array. (`src/apply.ts` may already show as modified in `git status` — this is throwaway local state and should NOT be committed as part of this work.)

- [ ] **Step 2: Run the existing unit test suite**

Run: `npm test`
Expected: all tests pass. The relevant existing test file is `src/utils/__tests__/ai-answer-generator-fallback.test.ts`.

- [ ] **Step 3: Build and run the bot**

Run the bot using whatever entrypoint the project uses for `src/apply.ts` (typically `npm start` or `npx ts-node src/apply.ts`). Watch the browser session.

- [ ] **Step 4: Verify the relocation question is answered Yes**

In the terminal output and/or the browser DOM, confirm the previously-failing relocation question (e.g., "If not currently in the Bay Area, are you willing to relocate near our Foster City, CA Office?") is now answered "Yes".

- [ ] **Step 5: Verify regression-free**

Spot-check that the existing flag-driven behavior did not change:
- Citizenship-related questions should still be answered as before.
- Visa-sponsorship questions should still be answered as before.
- "How did you hear" should still use the legacy LinkedIn handler.
- The combobox handler should still pick the correct work-authorization option.

- [ ] **Step 6: Document the run (optional)**

If anything surprised you, add a brief `## Implementation Notes` section at the bottom of `docs/superpowers/specs/2026-05-12-willing-to-relocate-design.md` and commit:

```bash
git add docs/superpowers/specs/2026-05-12-willing-to-relocate-design.md
git commit -m "Add implementation notes from willing-to-relocate end-to-end run"
```

If nothing surprised you, skip this step.

---

## Done When

- `willingToRelocate?: boolean` exists on the `Preferences` interface in both `config/resume-data.ts` and `config/resume-data.example.ts`.
- Both files have `willingToRelocate: true` in the example `preferences` literal.
- All three prompt methods in `src/ai-answer-generator.ts` (`generateAnswer`, `answerYesNoQuestion`, `pickFromOptions`) include a `Willing to Relocate: Yes/No` line.
- `npx tsc --noEmit` passes.
- `npm test` passes.
- A manual run against the previously-failing form shows the relocation question answered "Yes".
