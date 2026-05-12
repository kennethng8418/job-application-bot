# Greenhouse ATS support — design

**Status:** approved, pending implementation plan
**Author:** Kenneth Ng
**Date:** 2026-05-12
**Related:** Existing AshbyHQ bot (`src/ashby-bot.ts`, `src/base-application-bot.ts`)

## Context

The bot currently supports AshbyHQ applications only. This adds support for Greenhouse-hosted application forms, which represent a large share of company career pages. Frequency analysis of 9 representative Greenhouse forms (Courier Health, Mixpanel, True Anomaly, Discord, Workato, Grow Therapy, Chime, IncidentIQ, StubHub) showed that ~80% of every Greenhouse form is identical boilerplate — six fields are universal, eight more are near-universal — making rule-based resolution practical for the vast majority of fields.

## Scope

### In scope

- New `GreenhouseJobApplicationBot` extending `BaseJobApplicationBot`, sibling to `AshbyJobApplicationBot`.
- Supports `job-boards.greenhouse.io`, `job-boards.eu.greenhouse.io`, and the `embed/job_app` URL form.
- Auto-submit by default. `--dry-run` flag fills the form but does not click submit.
- DOM-scraping only (no Greenhouse JSON API).
- Fail-and-log on reCAPTCHA detection or any submit failure — bot moves to the next URL with no retry.
- Five new `ResumeData['personalInfo']` additions: `hispanicLatino`, `disabilityStatus`, `referralSource`, `education` (object with `degree`/`discipline`/`school`), and `yearsOfExperienceByTech` (map). EEO defaults to `"Decline to self-identify"`. `referralSource` defaults to `"LinkedIn"`. The pre-existing top-level `university` field is removed (replaced by `education.school`).
- URL router in `apply.ts` dispatches to AshbyBot or GreenhouseBot based on hostname.
- Unit tests covering all resolver rules. No fixture-based integration tests.
- Manual `--dry-run` validation gate before any new company gets a real submission.

### Out of scope

- Cover letter generation — uploaded only if `coverLetterPath` is configured.
- Multi-step or Workday-style applications.
- CAPTCHA-solving services (e.g., 2captcha, Anti-Captcha).
- Resume parsing / autofill from uploaded PDF (Greenhouse offers this; the bot ignores it).
- Salary negotiation logic — submits `preferences.desiredSalary` as-is.
- Iframe-context handling (none of the 9 sample URLs require it).
- AI answer caching across applications — each application generates fresh answers per the user's decision.

## Architecture

### File layout

```
src/
  apply.ts                          # Modified: URL router + --dry-run flag
  base-application-bot.ts           # Unchanged
  ashby-bot.ts                      # Modified: migrate university reads
  greenhouse-bot.ts                 # NEW: GreenhouseJobApplicationBot
  greenhouse/
    field-resolver.ts               # NEW: 4-stage resolver pipeline
    selectors.ts                    # NEW: Greenhouse DOM selectors
    eeo-options.ts                  # NEW: EEO value → dropdown label maps
    __tests__/
      field-resolver.test.ts        # NEW: unit tests
  ai-answer-generator.ts            # Modified: migrate university reads (if any)
  form-analyzer.ts                  # Modified: migrate university reads (if any)
  utils/
    submission-logger.ts            # Unchanged
    retry-helper.ts                 # Unchanged
    question-classifier.ts          # Modified: migrate university reads (if any)
config/
  resume-data.ts                    # Modified: add 5 fields, remove university
```

### Component responsibilities

**`apply.ts`** — URL router. Inspects each URL's hostname and instantiates the right bot. Parses `--dry-run` from `process.argv` and threads it through. Both bots share the same `resumeData`.

**`GreenhouseJobApplicationBot`** — owns one Greenhouse application's lifecycle: navigate, enumerate fields, fill, submit (or skip submit if dry-run), log result. Single attempt; no retry on failure.

**`FieldResolver`** — 4-stage pipeline that returns a string value (or `null`) for each field:

1. `StaticFieldMap` — Tier 1 universal fields (first name, last name, email, phone, country, resume).
2. `PatternMatcher` — Tier 2/3 regex-on-label rules (LinkedIn, visa, location, salary, etc.).
3. `EEOMapper` — Tier 2 standardized EEO dropdowns.
4. `AIAnswerGenerator` — Tier 4 fallback for textareas with no rule match.

First resolver to return a value wins. If all return `null` and the field is required, the bot logs a warning and continues (submit will fail validation — that is the intentional fail-and-log behavior).

**`selectors.ts`** — single source of truth for Greenhouse DOM selectors (form root, required indicators, phone/country, submit, reCAPTCHA). Centralized so DOM changes touch one file.

**`eeo-options.ts`** — exact-string mappings from `resumeData` values to Greenhouse's standardized dropdown labels (e.g., `"I do not want to answer"` for disability).

### Data flow

```
apply.ts URL router
   ↓
GreenhouseBot.apply(url)
   ↓
  page.goto(url)
   ↓
  enumerateFields() → Field[]
   ↓
  for each field:
    value = FieldResolver.resolve(field)
    fillField(field, value)
   ↓
  uploadResume(resumePath)
   ↓
  if not dryRun:
    click submit
    if reCAPTCHA or failure → log + return
    else → submissionLogger.record(...)
```

## Resolver rules

Label matching is **case-insensitive**, normalized to lowercase, with required-asterisks and helper-text spans stripped.

### Resolver 1: StaticFieldMap

| Greenhouse label | Source | Notes |
|---|---|---|
| `First Name` | `personalInfo.firstName` | |
| `Last Name` | `personalInfo.lastName` | |
| `Email` | `personalInfo.email` | |
| `Country` | derived from `personalInfo.location` | City→country lookup table; defaults to "United States" |
| `Resume/CV` | `resumePath` | File upload via `setInputFiles()` |
| `Phone` (the required one *after* Country) | `personalInfo.phone` | The optional first `Phone` field is explicitly skipped |

### Resolver 2: PatternMatcher

Ordered list of `(regex, source, transform?)` tuples. First match wins.

| # | Label regex | Source | Transform |
|---|---|---|---|
| 1 | `/linkedin/i` | `personalInfo.linkedin` | as-is |
| 2 | `/github/i` | `personalInfo.github` | as-is |
| 3 | `/website\|portfolio/i` | `personalInfo.portfolio` | as-is |
| 4 | `/cover letter/i` | `coverLetterPath` | upload if present, else skip |
| 5 | `/preferred (first )?name\|name.*you go by/i` | `personalInfo.firstName` | default to firstName |
| 6 | `/pronoun/i` | — | skip (always optional in dataset) |
| 7 | `/sponsor\|visa\|immigration support/i` | `preferences.requiresVisaSponsorship` | bool → "Yes"/"No" |
| 8 | `/legally authorized\|authorized to work\|work authorization\|currently eligible to work/i` | `preferences.legallyAuthorizedToWork` | bool → "Yes"/"No" |
| 9 | `/(currently )?located in\|current location\|where are you (currently )?(located\|based)/i` | `personalInfo.location` | as-is |
| 10 | `/onsite\|in.office\|hybrid\|relocate\|relocation\|willing to (work )?(from\|in)/i` | `preferences.willingToRelocate` + `preferences.remote` | bool → "Yes"/"No" |
| 11 | `/salary\|compensation\|target.*base\|expected.*base\|desired.*pay/i` | `preferences.desiredSalary` | strip `$`/`,` if numeric input |
| 12 | `/how did you hear\|referral source\|hear about (this )?(job\|role\|position\|us)/i` | `personalInfo.referralSource` | match dropdown options, fallback "Other" |
| 13 | `/start date\|when can you start\|available to start/i` | `preferences.startDate` | as-is |
| 14 | `/years.*?(?:of)?.*?experience.*?(?:in\|with\|of)?\s*(.+)/i` | `personalInfo.yearsOfExperienceByTech` | capture tech name (everything after "experience"), normalize, look up |
| 15 | `/interviewed.*(in the past\|previously)/i` | — | hardcoded "No" |
| 16 | `/restrictive covenant\|agreement.*former employer\|non-compete/i` | — | hardcoded "No" |
| 17 | `/privacy policy\|terms.*conditions\|acknowledge/i` | — | hardcoded "Yes" / check |
| 18 | `/affirm.*statements.*accurate\|certify.*information/i` | — | hardcoded true (checkbox) |
| 19 | `/school\|university\|college\|institution/i` | `personalInfo.education?.school` | skip if empty |
| 20 | `/degree/i` | `personalInfo.education?.degree` | default "Bachelor's Degree" |
| 21 | `/discipline\|major\|field of study/i` | `personalInfo.education?.discipline` | default "Computer Science" |
| 22 | `/itar/i` | — | hardcoded "U.S. Citizen" (since `usCitizen: true`) |
| 23 | `/location \(city\)/i` | `personalInfo.location` | as-is |

**`yearsOfExperienceByTech` lookup normalization:** both the captured tech name and the user's keys are normalized via `.toLowerCase().replace(/[^a-z0-9]/g, '')`. So `"C#/.NET"` → `"cnet"`, `"Front-End"` → `"frontend"`. If no key matches, the rule falls through and AIAnswerGenerator handles it.

### Resolver 3: EEOMapper

Exact-question-label match → exact-option match. Substring fallback if Greenhouse tweaks wording.

| Greenhouse question | Source | Default if undefined |
|---|---|---|
| `Gender` | `personalInfo.gender` | "Decline to self-identify" |
| `Are you Hispanic/Latino?` | `personalInfo.hispanicLatino` | "Decline to self-identify" |
| `Race & Ethnicity` | `personalInfo.race` | "Decline to self-identify" |
| `Veteran Status` | `personalInfo.veteranStatus` | "I decline to self-identify for protected veteran status" |
| `Disability Status` | `personalInfo.disabilityStatus` | "I do not want to answer" |
| `Gender Identity` (extra voluntary) | — | "Prefer not to answer" / skip if optional |
| `LGBTQ+`, `sexual orientation`, `transgender` | — | "Prefer not to answer" / skip if optional |

Greenhouse's standardized disability option text is verbose: `"Yes, I have a disability, or have had one in the past"`, `"No, I do not have a disability and have not had one in the past"`, `"I do not want to answer"`. Stored verbatim; substring-match fallback for wording drift.

### Resolver 4: AIAnswerGenerator

Reuses existing `src/ai-answer-generator.ts` unchanged. Invoked only when:
- Field is a `<textarea>` OR a text input with `maxlength > 200`, AND
- No prior resolver returned a value.

Regenerates every call (no cache). Empty/errored AI responses → log + skip; submit will fail validation.

### Miss behavior

- Required field with no match → log warning with label text, leave blank.
- Optional field with no match → silently skip.

## Greenhouse-specific quirks

### Quirk 1: Duplicate Phone field

Greenhouse renders two phone inputs: optional plain text near the top, and a required country-bound one immediately after Country. Bot logic:

1. Find all phone inputs in DOM order.
2. If two exist, fill only the second; tag the first as skipped.
3. Country MUST be filled before the second Phone — the country-code prefix doesn't render until Country is selected.
4. Wait up to 2s after Country selection for the country-code prefix indicator (`[data-country-code], .iti__selected-flag`).
5. Normalize phone: if `.iti__selected-flag` is present, send national digits (`6463384133`); else send E.164 (`+16463384133`).

### Quirk 2: Country-bound rendering

Selecting Country re-renders the phone widget and can add/remove regional fields. Bot logic:

1. Fill Country after universal text fields (name, email).
2. After Country fills, wait for `networkidle` (3s timeout) or country-code prefix indicator.
3. **Re-run `enumerateFields()`** to pick up newly-rendered fields. Discard the pre-Country field list.
4. Skip any fields that disappeared (no error).

### Quirk 3: File upload

Greenhouse's "Attach" button hides a real `<input type="file">`. Bot logic:

1. Locate the hidden input directly: `input[type="file"][name*="resume" i], input[type="file"][id*="resume" i]`.
2. Use `setInputFiles(absolutePath)` — bypass the visual button.
3. Resolve `resumePath` to absolute path via `path.resolve()`.
4. Wait up to 5s for filename confirmation indicator. If absent, log a warning and continue. Do not retry — duplicate attachments can occur.
5. Cover letter handled identically; skip silently if `coverLetterPath` not set.
6. Check file size before upload; log + error if >10MB (Greenhouse's cap).

### Quirk 4: Embed iframe (scope cut)

The `/embed/job_app` URL form (e.g., Mixpanel) loads the form as the top-level document when accessed directly, not as an iframe. No iframe-context switch needed for any of the 9 sample URLs. Iframe handling is **deferred** — if a future URL turns out to be iframe-embedded, add it then.

### Quirk 5: Custom comboboxes vs native `<select>`

Newer Greenhouse boards use React `<div role="combobox">` widgets that look identical to native selects. The `Field` type carries a `kind` discriminator; filler dispatches on `kind`:

```ts
type Field =
  | { kind: 'text';     label: string; element: Locator; required: boolean }
  | { kind: 'textarea'; label: string; element: Locator; required: boolean }
  | { kind: 'select';   label: string; element: Locator; required: boolean; options: string[] }
  | { kind: 'combobox'; label: string; element: Locator; required: boolean }
  | { kind: 'radio';    label: string; element: Locator; required: boolean; options: string[] }
  | { kind: 'checkbox'; label: string; element: Locator; required: boolean }
  | { kind: 'file';     label: string; element: Locator; required: boolean };
```

| `kind` | Filler |
|---|---|
| `text`, `textarea` | `element.fill(value)` |
| `select` | `selectOption({ label })`, fallback `selectOption({ value })` |
| `combobox` | click element, click `[role="option"]` matching text (exact → substring → skip) |
| `radio` | click input whose label matches |
| `checkbox` | check/uncheck per truthy value |
| `file` | `setInputFiles(absolutePath)` |

Combobox detected by `role="combobox"`, parent class `/select.*react/`, or `<button aria-haspopup="listbox">`. Most current boards still use native `<select>`.

### Quirk 6: Required-field detection

A field is required if any of: `aria-required="true"`, `required` attribute present, label contains an asterisk indicator, or label text ends with ` *`. OR logic — false positives are harmless, false negatives cause submit failures.

## Data model changes

### `config/resume-data.ts`

**Add to `ResumeData['personalInfo']`:**
- `hispanicLatino?: 'Yes' | 'No' | 'Decline to self-identify'`
- `disabilityStatus?: 'Yes, I have a disability, or have had one in the past' | 'No, I do not have a disability and have not had one in the past' | 'I do not want to answer'`
- `referralSource?: string`
- `education?: { degree: string; discipline?: string; school?: string }`
- `yearsOfExperienceByTech?: Record<string, number>`

**Remove from `ResumeData['personalInfo']`:**
- `university?: string` — replaced by `education.school`.

**User's actual values:**
- `hispanicLatino: 'No'`
- `referralSource: 'LinkedIn'`
- `education: { degree: "Bachelor's Degree", discipline: 'Computer Science' }`
- `yearsOfExperienceByTech: { JavaScript: 2, TypeScript: 2, React: 2, 'Node.js': 2, Python: 2 }`
- `disabilityStatus`: not set (resolver default `"I do not want to answer"` applies)

### Migration: `university` → `education.school`

All reads of `personalInfo.university` are replaced with `personalInfo.education?.school`. Touchpoints identified at implementation time via grep across `src/`. Likely files: `ashby-bot.ts`, `ai-answer-generator.ts`, `form-analyzer.ts`, `utils/question-classifier.ts`.

This is a breaking change to existing Ashby behavior. Verification: run existing Ashby unit tests after migration; type-check passes.

## Testing

### Unit tests (~60 tests)

`src/greenhouse/__tests__/field-resolver.test.ts`, run via existing `npm run test:unit`.

- **StaticFieldMap:** each universal label resolves; duplicate-phone scenario; single-phone scenario; unknown label returns null.
- **PatternMatcher:** every regex rule has at least one matching label from the real 9-URL sample (proves regex fires on real data, not crafted strings). Plus one negative case per rule.
- **EEOMapper:** each question + expected source; undefined defaults; verbose disability text matches via substring.
- **AIAnswerGenerator:** mocked at boundary; assert called with `(question, background)`; output propagated.

### Live `--dry-run` validation

The validation gate before any real submission. The bot writes a JSON report to `logs/dry-run-<timestamp>.json`:

```json
{
  "url": "...",
  "fieldsFound": 18,
  "fieldsFilled": 17,
  "fieldsSkippedOptional": 1,
  "fieldsUnmatchedRequired": [],
  "resolverBreakdown": { "static": 6, "pattern": 7, "eeo": 4, "ai": 1 },
  "aiCalls": [{ "question": "Why are you interested...", "tokens": 287 }]
}
```

**Policy:** any URL from a company not previously verified must pass `--dry-run` with manual browser inspection before a real submission.

### Post-submit verification

Reuses existing `src/utils/submission-logger.ts` infrastructure. After submit:
- Wait for post-submit URL change or success text.
- Screenshot to `screenshots/<company>-<jobid>-after-submit.png`.
- If neither URL change nor success text within 10s → status `"uncertain"`, manual review.

### Out of scope

- Fixture-based integration tests (skipped per user decision; favors faster delivery, accepts higher manual-verification load).
- LLM answer-quality testing.
- reCAPTCHA bypass testing.
- Network resilience testing.

## Rollout

### Branch

New branch `greenhouse-bot` off `main`. The in-progress `change-config` branch is left alone; its eventual merge may conflict with this branch's `apply.ts` changes — resolvable at merge time.

### Step order

1. **Data model migration** — add 5 fields to `resume-data.ts`, remove `university`, migrate all reads to `education.school`. Build + existing unit tests pass.
2. **Greenhouse scaffolding** — create `greenhouse-bot.ts`, `selectors.ts`, `eeo-options.ts`, `field-resolver.ts` with stubbed methods. Build passes.
3. **Resolver pipeline + unit tests** — implement all 4 resolvers TDD-style. ~60 tests pass.
4. **Field enumeration + filler dispatch** — implement `enumerateFields()` and `kind`-discriminated fillers. Manual `--dry-run` against Courier Health URL produces a clean report.
5. **URL router in `apply.ts`** — hostname-based dispatch + `--dry-run` flag parsing. Both bots run with a mixed URL list.
6. **Submit + post-submit verification** — wire submit, wire `submission-logger`, add fail-and-log on reCAPTCHA. First real submission witnessed manually.
7. **First real run** — `--dry-run` on all target URLs, manual browser review, then real submit for desired URLs.

### Files

| File | Status |
|---|---|
| `config/resume-data.ts` | Modified — 5 fields added, `university` removed |
| `src/apply.ts` | Modified — URL router, `--dry-run` |
| `src/ashby-bot.ts` | Modified — `university` migration |
| `src/ai-answer-generator.ts` | Modified — `university` migration (if applicable) |
| `src/form-analyzer.ts` | Modified — `university` migration (if applicable) |
| `src/utils/question-classifier.ts` | Modified — `university` migration (if applicable) |
| `src/greenhouse-bot.ts` | New |
| `src/greenhouse/selectors.ts` | New |
| `src/greenhouse/eeo-options.ts` | New |
| `src/greenhouse/field-resolver.ts` | New |
| `src/greenhouse/__tests__/field-resolver.test.ts` | New |

4 new files, 6 modified. No new dependencies.

### `apply.ts` URL list

Greenhouse URLs are **not** preloaded into `apply.ts`. User adds URLs as needed.
