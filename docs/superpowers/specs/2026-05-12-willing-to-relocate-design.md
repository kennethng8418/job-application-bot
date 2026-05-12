# Willing-to-Relocate Preference Design

**Date:** 2026-05-12
**Status:** Approved, ready for implementation plan

## Goal

Make the bot reliably answer "Yes" to relocation questions (e.g., "If not currently in the Bay Area, are you willing to relocate near our Foster City, CA Office?") by passing a new `willingToRelocate` preference flag to all three AI prompts that consume the `preferences` block.

## Problem

The Foster City relocation question is currently answered "No" by `answerYesNoQuestion`. The AI has no signal that the applicant is open to relocating — the prompt only includes name, location, remote preference, work location, sponsorship status, citizenship, and start date. With nothing else to go on, the model infers from `personalInfo.location` (which is not the Bay Area in the offending run) that the applicant should answer "No." This is a missing-context bug, not a model failure.

Other prompts (`generateAnswer`, `pickFromOptions`) have the same gap. A combobox or radio question phrased as "Are you open to relocating for this role?" would behave the same way.

## Architecture

### New `Preferences` field

Add to the `Preferences` interface in `config/resume-data.example.ts` (the tracked file — `config/resume-data.ts` is in `.gitignore` and must never be committed):

```typescript
willingToRelocate?: boolean; // Are you willing to relocate for the right role?
```

Place the new field after `requiresVisaSponsorship` and before `over18`, matching the existing flag-grouping order in the interface body.

Add to the example `preferences` literal:

```typescript
willingToRelocate: true, // Open to relocating for the right role
```

The user separately updates their local `config/resume-data.ts` (gitignored, holds personal data) to mirror the interface change, so the runtime can read `preferences.willingToRelocate`. That local change is not committed.

The field is optional (`?:`) so the prompt-string coercion `preferences.willingToRelocate ? 'Yes' : 'No'` safely treats `undefined` as `'No'` for anyone whose local resume-data hasn't been updated.

### Prompt-string additions

Three one-line additions in `src/ai-answer-generator.ts`, all using the same `${preferences.willingToRelocate ? 'Yes' : 'No'}` form:

1. **`generateAnswer`** (around line 63), after `Requires Visa Sponsorship: ...`:
   ```
   Willing to Relocate: ${preferences.willingToRelocate ? 'Yes' : 'No'}
   ```

2. **`answerYesNoQuestion`** (around line 139), as a bullet item after `- US Citizen: ...`, matching the bullet style of that block:
   ```
   - Willing to Relocate: ${preferences.willingToRelocate ? 'Yes' : 'No'}
   ```

3. **`pickFromOptions`** (around line 230), after `Requires Visa Sponsorship: ...`:
   ```
   Willing to Relocate: ${preferences.willingToRelocate ? 'Yes' : 'No'}
   ```

No new instructions are added to any prompt. `generateAnswer`'s existing instruction #2 ("If this is a simple yes/no question, answer ONLY with Yes or No") already handles the Foster City case correctly once the relocation context is in scope; the same is true of the bare yes/no shape of `answerYesNoQuestion` and the verbatim-pick shape of `pickFromOptions`.

## Testing

- **Manual end-to-end.** Re-run the bot against the AshbyHQ form that previously answered "No" to the Foster City question. Verify:
  - The terminal output / form shows "Yes" for that question.
  - The visa, citizenship, and other existing flag-driven answers are unchanged.
- **No new unit tests.** A single-line prompt addition mirroring two existing flags is below the threshold where mocked-SDK tests are worth the maintenance burden. Existing tests at `src/utils/__tests__/ai-answer-generator-fallback.test.ts` continue to cover the fallback paths.

## Out of Scope

- Per-city or per-region relocation preferences.
- Distance-based reasoning (e.g., "willing to relocate within 100 miles").
- Tristate `'yes' | 'no' | 'depends'` for cases where willingness depends on the destination.
- Changes to any handler logic (radio, combobox, dynamic-question observer, validation recovery).
- New configuration in `config/answer-preferences.ts` — that file is for fallback defaults when AI is unavailable; relocation has no sensible static default beyond the per-user flag.
- Backfilling `willingToRelocate` into existing `resume-data.ts` copies belonging to other branches or users. Optional field with a safe coercion makes this unnecessary.

## Trade-offs Considered

- **Single boolean vs. richer policy (regions list or tristate).** Chose the single boolean for symmetry with `usCitizen` and `requiresVisaSponsorship`. A richer policy is YAGNI until a real form surfaces a question the boolean can't answer correctly.
- **Add to all three prompts vs. just `answerYesNoQuestion`.** Chose all three to cover the three answer shapes (free text, yes/no, dropdown pick). Cost is two extra lines for hypothetical future safety.
- **Plain line vs. dedicated instruction in `generateAnswer`'s numbered list.** Chose plain line. The numbered list is already 10 items; the existing instruction #2 covers the yes/no shape. Adding more instructions raises model cognitive load without changing observed behavior on the question that motivated this work.
- **Header grouping ("Applicant's stated answers") vs. inline with demographics.** Chose inline. Restructuring the prompt header is a larger change with a wider blast radius than the bug warrants. The model has been correctly using `usCitizen` and `requiresVisaSponsorship` in the same shape; the new flag inherits that path.
