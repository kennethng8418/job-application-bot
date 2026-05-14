# Greenhouse: Education Fields (School / Degree / Discipline) — Design

**Status:** Approved, ready for implementation plan
**Branch:** `greenhouse-education`
**Date:** 2026-05-14

## Problem

On Greenhouse application forms with an education section (three required react-select comboboxes: `school--0`, `degree--0`, `discipline--0`), the bot has two issues:

1. **Degree fills with the wrong value.** Config has `degree: "Bachelor's Degree"`, but the applicant has a Master's. The resolver returns Bachelor's, which is then matched into the dropdown.
2. **School stays empty.** Config is missing the `school` field entirely, so the resolver returns `unresolved`. Even if it weren't, the Greenhouse School combobox is a type-ahead — its option list does not render until the user types — and the current combobox handler only types-ahead for labels matching `/location \(city\)/i`.

Discipline already fills correctly (`'Computer Science'` matches via substring).

## Goal

Make all three education fields (School, Degree, Discipline) fill with the applicant's actual values:

- School: `Georgia Institute of Technology`
- Degree: `Master's Degree`
- Discipline: `Computer Science`

## Non-goals

- No change to the resolver patterns at `field-resolver.ts:208-222`. The three labels are already correctly routed to `personalInfo.education.{school,degree,discipline}`.
- No change to `fillPersonalInfo()`, `handleAdditionalQuestions()`, or `fillMissingRequiredFields()`. The education fields are filled by the existing required-field-only `handleAdditionalQuestions()` pass.
- No support for multiple education entries. The bot fills `--0` only and ignores any "Add another education" button. Config schema stays `education: { school, degree, discipline }`, not an array.
- No new tests. The change is verified manually against a live Greenhouse form.
- No fix to the suspicious `Bachelor's Degree` fallback at `field-resolver.ts:215-217`. With the config explicitly setting `degree: "Master's Degree"`, the fallback path is never hit. Out of scope.

## Design

### Part 1: Config edits

In `config/resume-data.ts` (gitignored — local-only change, not pushed):

- Change `degree: "Bachelor's Degree"` → `degree: "Master's Degree"`.
- Add `school: 'Georgia Institute of Technology'` to the `education` block.
- `discipline: 'Computer Science'` stays unchanged.

The resulting `education` block looks like:

```typescript
education: {
  school: 'Georgia Institute of Technology',
  degree: "Master's Degree",
  discipline: 'Computer Science',
},
```

### Part 2: Code change — School type-ahead

In `src/greenhouse-bot.ts`, `fillField()` combobox branch, the existing type-ahead handler at line 491 is currently gated on the Location (City) label:

```typescript
if (/location \(city\)/i.test(field.label)) {
  const prefix = value.split(/\s+/).slice(0, 2).join(' ');
  await field.element.fill(prefix);
  await this.page
    .locator('.select__menu [role="option"]')
    .first()
    .waitFor({ state: 'visible', timeout: 3000 })
    .catch(() => null);
  await field.element.press('Enter');
  break;
}
```

Broaden the regex to also match the School label:

```typescript
if (/^location \(city\)$|^school$/i.test(field.label)) {
  // ... same body, unchanged
}
```

Net behavior: when the field label is `"School"`, the combobox handler types the first 2 words of the configured value (`"Georgia Institute"`), waits for a suggestion to render, then presses Enter to accept the top suggestion. The Location (City) behavior is unchanged.

### Why this works

- Greenhouse's School combobox is backed by a large normalized school list. Typing `"Georgia Institute"` narrows it to `"Georgia Institute of Technology"` (and possibly a few others). The top suggestion will typically be the exact match for the canonical name.
- Degree and Discipline are short fixed-option lists (5-10 items each). The existing `matchEEOOption()` substring match against the configured strings (`"Master's Degree"`, `"Computer Science"`) handles these without type-ahead.

### Risk

- If a particular Greenhouse form's School option list doesn't include `Georgia Institute of Technology` (e.g., uses a different naming convention like `Georgia Tech`), Enter will accept whatever the top suggestion happens to be. Manual verification will catch this; if it becomes a recurring problem we can revisit with an AI-pick fallback.

## Files touched

- **Modify (local-only, gitignored):** `config/resume-data.ts` — degree + school config values.
- **Modify (committed):** `src/greenhouse-bot.ts` — one regex change in the combobox type-ahead gate.

No new files. No new dependencies.

## Verification

Run the bot with `--dry-run` against a Greenhouse application URL that has an education section. Confirm in console output:

- `School → "Georgia Institute of Technology"` (or similar — the actual selected option text).
- `Degree → "Master's Degree"` (or whatever Greenhouse's matching option text is, e.g. `Master of Science`).
- `Discipline → "Computer Science"`.
- The pre-submit sweep does not flag any of the three as unresolved.

If School does not match a real school in the dropdown after typing 2 words, log the visible options and revisit. Rollback is a single regex revert.
