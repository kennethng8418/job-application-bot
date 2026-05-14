# Greenhouse: Fill Required Fields Only — Design

**Status:** Approved, ready for implementation plan
**Branch:** `greenhouse-require-field`
**Date:** 2026-05-14

## Problem

`GreenhouseJobApplicationBot.handleAdditionalQuestions()` currently iterates every non-universal, non-file field on the page and invokes the resolver (and, transitively, the AI generator) to produce a value — regardless of whether the form marks the field required.

The result is plausible-but-wrong answers in optional fields (LinkedIn URL, Website, optional demographic/EEO questions, etc.). The user would rather leave those blank than risk a bad answer.

## Goal

Narrow `handleAdditionalQuestions()` to fill only required fields. Optional fields are left untouched — no resolver call, no AI call, no DOM mutation.

## Non-goals

- No change to `fillPersonalInfo()`. Universal identity fields (First Name, Last Name, Email, Phone, Country) remain always-filled because they're pulled from static config and carry no risk of wrong answers.
- No change to `uploadResume()`. Resume + cover letter behavior unchanged.
- No change to `fillMissingRequiredFields()`. The AI safety-net sweep continues to operate on required-and-empty fields after the main pass.
- No change to required-field detection. `enumerateFields()` already correctly sets `field.required` from `aria-required="true"`, the `required` attribute, or a trailing `*` in the label text — all three signals converge on the same answer for Greenhouse forms (the `<span aria-hidden="true">*</span>` markup contributes its `*` to `label.textContent`).
- No new tests. The change is small enough to verify manually via `--dry-run` against a live form; adding a unit test would require extracting a helper that doesn't otherwise need to exist.

## Design

In `src/greenhouse-bot.ts`, `handleAdditionalQuestions()` (around line 149-167), add one filter alongside the existing skip conditions:

```typescript
for (const field of fields) {
  if (universalLabels.test(field.label)) continue;
  if (field.kind === 'file') continue;
  if (/cover letter/i.test(field.label)) continue;
  if (!field.required) continue;   // ← new
  // ... existing resolver call
}
```

That's the entire change. Net behavior:

- Required fields: resolver runs, fills static/pattern/AI answer as before.
- Optional fields: skipped silently. Never touched.
- Universals: still filled by `fillPersonalInfo()` (separate code path).
- Required-but-resolver-unresolved fields: still caught by the existing `fillMissingRequiredFields()` AI sweep.

## Why this is safe

The bot already separates concerns:

1. `fillPersonalInfo()` — universals from static config.
2. `handleAdditionalQuestions()` — everything else, using the resolver.
3. `fillMissingRequiredFields()` — AI patch for required fields still empty after step 2.

The filter narrows step 2 to required fields only. Step 3 already only touches required fields, so it's unaffected. Universals are independent of `field.required` because they go through step 1.

The pre-submit unresolved-required check (`unresolved.length > 0` → abort) remains the final guard: if a required field is somehow still empty after steps 2 and 3, submission is aborted with a log entry.

## Files touched

- **Modify** `src/greenhouse-bot.ts` — one-line addition in `handleAdditionalQuestions()`.

No other files change. No new dependencies.

## Verification

Run the bot with `--dry-run` against a real Greenhouse application URL. Confirm in console output:

- Required fields are filled (existing `✓` logs).
- Optional fields produce no resolver activity (no log lines for them).
- The pre-submit summary shows `✓ All required fields filled` or lists only legitimately-unresolvable required fields.

If a regression appears, the rollback is a single-line revert.
