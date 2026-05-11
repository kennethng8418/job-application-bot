# Radio-Question Handler Design

**Date:** 2026-05-11
**Status:** Approved, ready for implementation plan

## Goal

Make the AshbyHQ bot answer multi-option radio-group questions (e.g. "How would you describe your Python background?") that it currently leaves blank. Use AI to pick the best option based on the candidate's resume plus a configurable preferences file, with a sensible default for "soft" questions like "How did you hear about us?". Wire into both the pre-submit fill pass and the post-submit error-recovery loop.

## Problem

The form on Teamworks (and many other AshbyHQ jobs) uses fieldset-based radio groups, where:

- A `<fieldset>` contains a `<label class="... ashby-application-form-question-title _required_*">` carrying the question.
- Each option is a `<div class="_option_*">` containing a real `<input type="radio">` and a `<label>` with the option text.
- The "required" marker is on the question label's CSS class, NOT on the `<input>` elements.

The current `fillEmptyRequiredFields()` (`src/ashby-bot.ts:1425-1541`) looks for `input[required]` and `input[aria-required="true"]`, which misses these radios entirely. `AIAnswerGenerator` has no method that takes a list of options and returns a choice — only free-text and yes/no. As a result, the form's own validation surfaces "Missing entry for required field: <question>" after submission.

## Architecture

### New AI method: `pickFromOptions(question, options): Promise<string>`

Single new public method on `AIAnswerGenerator` (`src/ai-answer-generator.ts`).

- Takes the question text and the array of option label strings.
- Returns the exact text of one of the provided options (string-equal to one of `options`).
- Uses Claude with a system prompt that:
  - Provides resume data (same context the existing methods use).
  - Provides the optional preferences config (see below).
  - Instructs the model to pick exactly one option and return it verbatim.
- Validates the response: if the returned string does not exactly match any option, retry once with a stricter prompt; if still no match, fall back to default (see "Fallback strategy" below).

### Preferences config: `config/answer-preferences.ts`

A small TS module exporting a `PREFERENCES` object:

```ts
export interface AnswerPreferences {
  tone: 'strongest-plausible' | 'honest' | 'modest';
  defaults: {
    howDidYouHear: string;  // e.g., "LinkedIn"
    other: string;          // generic fallback when nothing matches
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

The AI prompt references these. The DOM filler also uses `defaults.howDidYouHear` directly as a fallback if AI is unavailable or its choice doesn't match any option.

### Question classifier

A small private helper inside `AIAnswerGenerator` (or in a separate utility) that detects whether a question is a "soft" question (how did you hear, do you require sponsorship, etc.) by keyword matching against a short allowlist. Soft questions get the corresponding default if AI is disabled or fails.

### DOM module: radio-group filler

Lives in `src/ashby-bot.ts` as a new private method `fillRequiredRadioGroups()`, called from two places:

1. From inside `handleAdditionalQuestions()` (pre-submit pass) after the existing handlers run.
2. From inside the post-submit error-recovery loop (`src/ashby-bot.ts:1174-1323`).

Behavior:

1. Locate all `<fieldset>` elements whose first descendant `<label class="...ashby-application-form-question-title...">` carries `_required_` in its class list (regex match on the class attribute). Skip fieldsets where any radio inside is already `:checked`.
2. For each fieldset:
   - Extract question text from the title label.
   - Extract option list as `{ inputId, optionText }[]` by querying each `<div class="_option_*"> input[type=radio] + label` pair. Skip options with empty text.
   - Call `aiGenerator.pickFromOptions(question, optionTexts)`.
   - Click the radio whose label text exactly matches the chosen string. Use Playwright's `page.locator('label[for="..."]').click()` — clicking the label is the most reliable way given the custom-styled radio (the visible `<input>` is hidden behind the `<span class="_circle_*">`).
   - Verify the radio is now checked. If not, log a warning and continue.

### Fallback strategy

When `pickFromOptions` fails to return a valid match after one retry:

1. If the question text matches the "how did you hear" pattern (case-insensitive contains "how did you hear" or "where did you hear"), select the option whose text matches `PREFERENCES.defaults.howDidYouHear` (case-insensitive); if no such option exists, fall through to step 3.
2. If any option text equals `PREFERENCES.defaults.other` (case-insensitive), pick it.
3. Otherwise, log a warning naming the question + options and skip the field. The post-submit recovery loop will surface this if the submission fails.

The fallback does NOT guess silently. It always logs what it did.

### Integration with post-submit recovery

The current recovery loop at `src/ashby-bot.ts:1174-1323` reads "Missing entry for required field: X" messages and tries to fill them. It will be updated to:

1. Run `fillRequiredRadioGroups()` once before its existing per-field logic.
2. Only fall through to its current per-field text/checkbox handling for fields that aren't radio groups.

## Testing

- **Unit test for `pickFromOptions`**: mock the Anthropic SDK and verify:
  - Returns the chosen option verbatim when the mock returns a valid match.
  - Retries once when the mock returns an unmatched string, then falls back.
  - Returns the howDidYouHear default for matching questions when AI fails entirely.
- **Unit test for the classifier**: question-text → "how-did-you-hear" / "other" / "needs-ai" classification.
- **Integration / manual test**: run the bot against a real AshbyHQ form with at least one multi-option radio group; verify the correct option is selected and the form submits without validation errors. This is the same kind of manual end-to-end as the submission-log feature's Task 5.

## Out of Scope

- Custom-styled comboboxes / autocompletes beyond what `handleAdditionalQuestions()` already handles.
- Native `<select>` dropdowns. (Worth a separate small feature; not present in the Teamworks form that triggered this work.)
- Multi-select radio / checkbox grids.
- Confidence scoring / asking the user to confirm uncertain picks.
- Caching AI responses across runs.

## Trade-offs Considered

- **`pickFromOptions` vs. prompt-engineering `generateAnswer`**: a dedicated method gives reliable verbatim-match output and is reusable for future `<select>` and combobox work. Worth the extra method.
- **Resume-only vs. resume+preferences**: preferences add a tiny config surface but unlock per-candidate tone control without changing code. The defaults are also useful as fallbacks for non-experience questions.
- **Fail loud vs. always-fill**: chose fail-loud-after-defaults. A logged warning surfaces problems; a silent guess hides them. The fallback covers the common "how did you hear" case so most forms still submit cleanly on the first try.
- **Click input vs. click label**: clicking the label is more reliable on custom-styled radios where the input is visually hidden. Some AshbyHQ forms have animation on the custom span — clicking the label triggers it correctly.
