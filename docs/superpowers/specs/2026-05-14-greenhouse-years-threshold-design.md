# Greenhouse: Years-Threshold Resolver Pattern — Design

**Status:** Approved, ready for implementation plan
**Branch:** `greenhouse-years-threshold`
**Date:** 2026-05-14

## Problem

Greenhouse application forms commonly ask threshold-style experience questions, e.g.:

- *"Do you have at least 1 year of experience using Python?"* (combobox, Yes/No)
- *"Do you have 3 or more years of React experience?"* (combobox, Yes/No)

The current resolver's `years.*experience` pattern at `src/greenhouse/field-resolver.ts:180-192` only recognizes the "Years of X experience" → number shape. Threshold questions fall through to `unresolved`, and the AI sweep (`fillMissingRequiredFields()` → `pickFromOptions(label, ["Yes","No"])`) picks Yes/No without knowing the user's per-tech years (the pick prompt at `src/utils/ai-prompt.ts` surfaces aggregate `yearsOfExperience` only). The AI defaults to "No" — observed in the wild on Applied Intuition's form for "Do you have at least 1 year of experience using Python?" while the user's config has `Python: 2`.

## Goal

Add a deterministic resolver branch that recognizes threshold-style questions, looks up the per-tech years in config, and returns "Yes" / "No". Eliminate the AI dependency for this question shape.

## Non-goals

- No change to the existing `Years of X experience` pattern (returns the number). Threshold and number are different intents and live in sibling branches.
- No change to `buildPickPrompt()` to surface `yearsOfExperienceByTech` into the AI prompt. Out of scope here; the resolver fix handles the headline cases, and AI fallback still works for unknown-tech via the existing pattern.
- No change to `fillPersonalInfo()`, `handleAdditionalQuestions()`, `fillMissingRequiredFields()`, or any combobox UI handler.
- No support for compound clauses like "do you have at least 1 year of Python AND 2 years of Go" (rare; not worth pattern complexity).
- No support for ranges like "between 2 and 5 years of X" (different question intent).

## Design

### Resolver branch

In `src/greenhouse/field-resolver.ts`, `tryPattern()`, add a new branch **before** the existing `if (/years.*experience/.test(label))` block. The branch tests against two regexes (one per phrasing) and short-circuits on the first match:

```typescript
// One regex per "tech position" — both phrasings ("at least N" vs.
// "N or more"/"N+") collapse into a single alternation inside the quantifier.
//
// Position 1: "...years of X experience" (tech precedes "experience")
// Position 2: "...years of experience using/in/with X" (tech follows verb)
//
// The `\s+experience` literal in Position 1 anchors the tech so (.+?)
// cannot greedily absorb "experience".

const QUANTIFIER = `(?:at least\\s+(\\d+)|(\\d+)\\+?\\s*(?:or more)?)`;
// Capture group 1 = "at least N" form, group 2 = "N or more" / "N+" form.
// Tech is captured in group 3.

const techBeforeExperience = label.match(
  new RegExp(
    `^do you have ${QUANTIFIER}\\s+years?\\s+of\\s+(.+?)\\s+experience\\??$`,
  ),
);
const techAfterUsing = label.match(
  new RegExp(
    `^do you have ${QUANTIFIER}\\s+years?\\s+of\\s+experience\\s+(?:using|in|with)\\s+(.+?)\\??$`,
  ),
);
const thresholdMatch = techBeforeExperience ?? techAfterUsing;

if (thresholdMatch) {
  // Threshold is in group 1 (atLeast) or group 2 (orMore). Tech in group 3.
  const thresholdStr = thresholdMatch[1] ?? thresholdMatch[2];
  const techRaw = (thresholdMatch[3] ?? '').trim();
  const threshold = parseInt(thresholdStr, 10);
  const normalizedTech = normalizeTechKey(techRaw);
  const byTech = personalInfo.yearsOfExperienceByTech ?? {};
  for (const [k, v] of Object.entries(byTech)) {
    if (normalizeTechKey(k) === normalizedTech) {
      return { kind: 'value', value: v >= threshold ? 'Yes' : 'No' };
    }
  }
  return { kind: 'unresolved' };
}
```

The `orMoreMatch` regex has two alternatives joined by `|` to handle both "N or more years of React experience" (where "React" appears before "experience") and "N or more years of experience using React" (where the tech follows "using"). The first alternative captures into groups 1-2; the second into 3-4.

### Tech name handling

`normalizeTechKey(raw)` is the existing helper at `field-resolver.ts:7-9`. It lowercases and strips non-alphanumeric characters:

- `Python` → `python`
- `Node.js` → `nodejs`
- `C#/.NET` → `cnet`
- `Python 3` → `python3` (does NOT match config's `Python` — falls to `unresolved`)

The lookup loops over `personalInfo.yearsOfExperienceByTech`, normalizes each key, and matches against the question's normalized tech name. Behavior for unknown techs (Docker, AWS, Rust, etc.) mirrors the existing "Years of X experience" pattern: returns `{ kind: 'unresolved' }`, letting the AI sweep try to answer from the resume PDF.

### Why the new branch comes first

The label `"do you have at least 1 year of experience using python?"` would actually match the outer `/years.*experience/` test of the existing pattern. If the existing branch runs first, its inner `/^years of .../` regex fails, it returns `unresolved`, and the threshold logic never gets a chance. Putting the new branch first guarantees threshold questions are handled before the number-shape pattern.

## Tests

Add to `src/greenhouse/__tests__/field-resolver.test.ts`. First update the `baseResumeData` fixture's `yearsOfExperienceByTech` to include `Python: 2`:

```typescript
yearsOfExperienceByTech: { JavaScript: 2, React: 2, 'C#/.NET': 3, Python: 2 },
```

Then add six new tests:

```typescript
test('Pattern: at least 1 year of Python → Yes (has 2 in config)', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve(
    'Do you have at least 1 year of experience using Python?',
    { isPhone: false },
  );
  assert.deepEqual(result, { kind: 'value', value: 'Yes' });
});

test('Pattern: at least 5 years of Python → No (has 2 in config)', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve(
    'Do you have at least 5 years of experience using Python?',
    { isPhone: false },
  );
  assert.deepEqual(result, { kind: 'value', value: 'No' });
});

test('Pattern: 3 or more years of C#/.NET → Yes (has 3 in config)', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve(
    'Do you have 3 or more years of C#/.NET experience?',
    { isPhone: false },
  );
  assert.deepEqual(result, { kind: 'value', value: 'Yes' });
});

test('Pattern: 4 or more years of React → No (has 2 in config)', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve(
    'Do you have 4 or more years of React experience?',
    { isPhone: false },
  );
  assert.deepEqual(result, { kind: 'value', value: 'No' });
});

test('Pattern: at least 1 year of unknown tech → unresolved (falls to AI)', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve(
    'Do you have at least 1 year of Docker experience?',
    { isPhone: false },
  );
  assert.equal(result.kind, 'unresolved');
});

test('Pattern: existing "Years of X experience" still works after threshold added', () => {
  const r = new FieldResolver(baseResumeData);
  const result = r.resolve('Years of React Development Experience', {
    isPhone: false,
  });
  assert.deepEqual(result, { kind: 'value', value: '2' });
});
```

The last test guards against a regression in the existing pattern when the new branch is added above it.

## Files touched

- **Modify** `src/greenhouse/field-resolver.ts` — add ~15 lines in `tryPattern()` (new branch with two regex matches + tech lookup).
- **Modify** `src/greenhouse/__tests__/field-resolver.test.ts` — extend `baseResumeData` fixture (`Python: 2`), add six new tests.

No new files. No new dependencies.

## Verification

1. `npx tsc --noEmit` — clean compile.
2. `npm test` — all existing tests pass, six new tests pass.
3. Manual dry-run against `https://job-boards.greenhouse.io/appliedintuition/jobs/4674857005`. Confirm console output shows the Python field filled with "Yes" via the resolver (no AI sweep involvement) and the pre-submit summary shows it as filled.

Rollback is a revert of the resolver branch addition; tests revert with it.
