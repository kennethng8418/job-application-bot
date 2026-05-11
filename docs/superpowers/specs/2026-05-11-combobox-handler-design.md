# Combobox-Question Handler Design

**Date:** 2026-05-11
**Status:** Approved, ready for implementation plan

## Goal

Make the AshbyHQ bot answer required combobox/autocomplete questions (e.g. "What is your current U.S. work authorization status?") that it currently leaves blank. Open the listbox, scrape the options, reuse the existing `pickFromOptions` AI method to choose one, then type a unique prefix and press Enter to commit the selection. Wire into both the pre-submit fill pass and the post-submit error-recovery loop, mirroring the recently merged `fillRequiredRadioGroups()` handler.

## Problem

Many AshbyHQ forms use combobox-based question fields where:

- A `<fieldset>` contains a `<label class="... ashby-application-form-question-title _required_*">` carrying the question.
- The control is an `<input role="combobox" aria-haspopup="listbox" aria-autocomplete="list">` with a sibling chevron `<button>`.
- Clicking the input flips `aria-expanded` to `true` and reveals a `role="listbox"` (typically portaled outside the fieldset) containing `role="option"` items.
- The "required" marker is on the question label's CSS class, not on the `<input>`.

Example DOM (siftstack work-authorization field):

```html
<fieldset class="_container_nh65k_29 _fieldEntry_17tft_29">
  <label class="_heading_101oc_53 _required_101oc_92 ashby-application-form-question-title"
         for="09e7a447-...">What is your current U.S. work authorization status?</label>
  <div class="_inputContainer_v5ami_28">
    <input class="_input_v5ami_28"
           placeholder="Start typing..."
           aria-autocomplete="list"
           aria-expanded="false"
           aria-haspopup="listbox"
           role="combobox"
           value="">
    <button class="_toggleButton_v5ami_32">...</button>
  </div>
</fieldset>
```

Options for that field include "U.S. Citizen", "U.S. Permanent Resident (Green Card holder)", several visa categories, and "Other (please specify in the final question's text box)" — nine total.

The current code has no general handler for these. There is an ad-hoc handler at `src/ashby-bot.ts:896-928` that targets only the "How did you hear about this opportunity?" combobox and hardcodes "LinkedIn"; everything else is left blank. The form's own validation then surfaces "Missing entry for required field: <question>" after submission, which the recovery loop also can't fix today.

## Architecture

### DOM module: combobox filler

A new private method `fillRequiredComboboxes()` on `AshbyJobApplicationBot` in `src/ashby-bot.ts`. Structured to mirror `fillRequiredRadioGroups()` (`src/ashby-bot.ts:1450`) — same shape, same logging conventions, same fail-loud posture.

Called from two places:

1. End of `handleAdditionalQuestions()` — immediately after the existing `await this.fillRequiredRadioGroups();` call at line 1150.
2. Inside `handleValidationErrors()` — immediately after the existing `await this.fillRequiredRadioGroups();` call at line 1186, before the per-field text/checkbox recovery loop.

Radios run first in both call sites: cheaper (no DOM mutation, no portal scraping) and clears radio-related validation errors before comboboxes are touched.

### Behavior

For each `<fieldset>` on the page:

1. **Required check.** First descendant `:scope > label.ashby-application-form-question-title` must carry a class matching `/^_required_/`. Same regex as the radio handler.
2. **Has combobox.** Skip if `fieldset.locator('input[role="combobox"]').first()` has zero count.
3. **Already filled.** Read `inputValue()` of that combobox. If non-empty, skip — this covers the legacy "How did you hear" handler that already filled it, plus any prefilled form state.
4. **Question text.** Pull from the title label. Skip if empty.
5. **Open the listbox.** `input.click()`. (Don't click the chevron button — `aria-haspopup="listbox"` is on the input and clicking it is the more semantic action.)
6. **Wait for expansion.** Wait until `aria-expanded="true"` with a 2s timeout. If it never flips, log a warning and skip.
7. **Resolve the listbox element.**
   - Read `input.getAttribute('aria-controls')`. If present, locate by `#<id>`.
   - If absent, or the located element isn't visible, fall back to `page.locator('[role="listbox"]:visible').first()`.
   - If neither resolves, log a warning and skip.
8. **Scrape options.** `listbox.locator('[role="option"]').all()`, take each option's `textContent()`, trim, drop empties. If the resulting list is empty, log a warning and skip.
9. **Pick.** `pickFromOptions(questionText, optionTexts)`. Match the returned string to an option by exact match first, then case-insensitive trimmed match. If no match (including a `null` return), log a warning naming the question and the option list and skip.
10. **Compute the type-prefix.**
    - Take the chosen option text.
    - Truncate at the first occurrence of ` (` (space + open-paren).
    - Trim trailing whitespace.
    - Verify the prefix is unique among the other scraped option texts (case-insensitive `startsWith`). If not unique, fall back to typing the full label verbatim.
11. **Type and confirm.**
    - `input.fill('')` to clear any partial state.
    - `input.type(prefix, { delay: 30 })` — slow enough for debounced filtering.
    - Wait ~200ms for the listbox to narrow.
    - `input.press('Enter')`.
12. **Verify.** After ~300ms, read `input.inputValue()`. Success if it equals or starts with the chosen option text (case-insensitive). Otherwise log a warning. No retry — the post-submit recovery loop is the safety net.

### Relation to the existing "How did you hear" handler

The handler at `src/ashby-bot.ts:896-928` is left in place. It runs first and fills the "How did you hear" combobox with "LinkedIn"; by the time `fillRequiredComboboxes()` runs, that field's `inputValue()` is non-empty and step 3 skips it. No code overlap, no need to coordinate beyond the skip check.

### Reusing `pickFromOptions`

The existing `AIAnswerGenerator.pickFromOptions(question, options)` (`src/ai-answer-generator.ts:184`) is reused verbatim. It already:

- Takes a question string and an option array.
- Returns the exact text of one of the options, or `null`.
- Has built-in fallbacks for `howDidYouHear` and `other` default preferences from `config/answer-preferences.ts`.

No changes to the AI module are needed. The combobox handler doesn't have to know anything about preferences — `pickFromOptions` already encapsulates that logic.

## Error Handling

- The per-fieldset loop body is wrapped in `try/catch`. One bad fieldset logs an error with the question text and continues.
- All "couldn't proceed" cases (timeout opening listbox, no listbox found, empty options, no match, `input.value` didn't update) log a `⚠️` warning and `continue` — never throw.
- The outer method is wrapped in a top-level try/catch that logs and swallows, matching `fillRequiredRadioGroups`.

## Logging

Consistent with the radio handler's voice:

- `🔽 Scanning for required combobox questions...` at start.
- `  ❓ <question>` then `     Options: A | B | C | ...` per fieldset processed.
- `  ✅ Selected "<choice>" for "<question>"` on success.
- `  ⚠️  <reason>` on any skip or failure (timeout, no options, no match, value didn't update).
- `🔽 Combobox pass: <filled>/<processed> answered` at end.

## Testing

- **Manual end-to-end.** Run the bot against a real AshbyHQ form with at least one required combobox (the siftstack URL already in `src/apply.ts` works — it has the work-authorization combobox shown above). Verify:
  - The correct option is selected.
  - The form submits without "Missing entry for required field" for the combobox.
  - The legacy "How did you hear" handler still fires first and is not double-handled.
- **No unit tests planned.** The work is primarily Playwright glue around an existing AI method that already has unit-test coverage in `src/utils/__tests__/ai-answer-generator-fallback.test.ts`. Adding tests for the DOM-walking method would require heavy Playwright mocking with low return on investment, matching the testing posture of the radio handler.

## Out of Scope

- Native `<select>` dropdowns — not the same DOM shape; separate handler if/when one appears in practice.
- Multi-select comboboxes (selecting more than one option).
- Comboboxes that require typing before any options appear (the listbox-opens-empty case).
- The legacy "How did you hear" handler at `src/ashby-bot.ts:896-928` — left untouched; the new pass skips already-filled fields.
- Adding new preference defaults (e.g., a work-authorization default). `pickFromOptions` relies on the resume PDF plus the existing `preferences.requiresVisaSponsorship` flag it already passes to the model; if work-authorization picks turn out unreliable in practice, expanding the prompt is a follow-up, not part of this work.
- Caching AI responses across runs.
- Confidence scoring or asking the user to confirm uncertain picks.

## Trade-offs Considered

- **Mirror the radio handler vs. extract a shared "required-fieldset walker".** Chose to mirror. With only two handlers (N=2), the differences (radio uses label-click and `:checked`; combobox uses portal listbox, typed filter, and `input.value`) are larger than the shared parts. Extracting now would be premature abstraction; revisit when a third similar handler appears.
- **Generalize the existing "How did you hear" handler vs. add a new method.** Chose to add a new method and leave the old one alone. The old one hardcodes "LinkedIn" and runs as a fast-path with no AI call; the new pass handles everything else. Lowest regression risk for already-shipped behavior.
- **Click input vs. click chevron button.** Chose input. `aria-haspopup="listbox"` is on the input; clicking the input is the more semantic action and matches what a keyboard user would do. The chevron is a visual affordance only.
- **`aria-controls` lookup vs. page-wide visible listbox.** Chose `aria-controls` with page-wide fallback. Spec-correct, handles portals, and tolerant of forms where `aria-controls` isn't set. Avoids matching the wrong listbox in the rare case where two are open simultaneously.
- **Type-to-filter+Enter vs. click the option element.** Chose type-to-filter. Closer to natural user input, doesn't require holding the listbox locator across a possibly-re-rendered popover, and works even when the listbox uses virtualization that may unmount options off-screen. Adds modest timing complexity (handled by `delay: 30` and the 200ms wait).
- **Short unique prefix vs. full label verbatim.** Chose prefix with verbatim fallback. Ashby option labels often have parenthetical suffixes that the autocomplete filter may not match literally; truncating at ` (` gives a cleaner search string. The uniqueness check guards against ambiguous prefixes.
- **Lenient verify (`startsWith`) vs. strict equality.** Chose lenient. Some Ashby comboboxes set `input.value` to the typed prefix; others set it to the full canonical label. Both count as a successful selection.
- **Retry vs. fail loud.** Chose fail loud. The post-submit `handleValidationErrors()` loop is the safety net; retrying inside the per-fieldset loop would hide intermittent issues without changing the eventual outcome.

## Implementation Notes

A change to the open-detection strategy was needed during the manual end-to-end run. The originally specified approach — `combobox.click()` followed by a `MutationObserver` waiting for `aria-expanded="true"` on the input — produced `Combobox for "<question>" did not open` warnings on the siftstack work-authorization combobox even though the listbox was actually opening. On at least some Ashby comboboxes, `aria-expanded` either does not flip when the listbox opens or flips at a moment that doesn't line up with the observer attachment.

The shipped implementation (commit `bb625dd`) replaces that flow with:

1. `combobox.click()` to open.
2. `combobox.press('ArrowDown')` as belt-and-suspenders for combobox libraries that listen only to keyboard events.
3. `page.locator('[role="listbox"]:visible').first().waitFor({ state: 'visible', timeout: 2000 })` as the open signal — wait for the artifact we actually care about, not a proxy attribute.

This also removed the `MutationObserver` plus the `@ts-ignore` / `eslint-disable-next-line` pair, since the new path stays on the Node side and never reaches into `page.evaluate`. Future combobox-shaped widgets in Ashby (or other ATSes) should use the same "wait for the listbox to be visible" approach by default; `aria-expanded` should be treated as advisory, not authoritative.
