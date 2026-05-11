# Combobox-Question Handler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AshbyHQ bot detect and answer required combobox/autocomplete questions (e.g. "What is your current U.S. work authorization status?") by opening the listbox, scraping options, asking the existing AI helper to pick one, and committing the selection via type-to-filter + Enter.

**Architecture:** Add a new private `fillRequiredComboboxes()` method to `AshbyJobApplicationBot`, mirroring the already-shipped `fillRequiredRadioGroups()`. Reuse the existing `AIAnswerGenerator.pickFromOptions()` verbatim — no AI module changes. Wire into both `handleAdditionalQuestions()` (post-submit pass) and `handleValidationErrors()` (post-submit recovery), each time immediately after the corresponding radio-handler call. Leave the legacy "How did you hear" handler at lines 896–928 in place; the new pass skips already-filled inputs.

**Tech Stack:** TypeScript, Playwright, Anthropic SDK (`@anthropic-ai/sdk`).

**Spec:** `docs/superpowers/specs/2026-05-11-combobox-handler-design.md`

**Testing note:** This work is primarily Playwright glue around the existing `pickFromOptions` method (which already has unit-test coverage in `src/utils/__tests__/ai-answer-generator-fallback.test.ts`). Per the spec, no new unit tests are planned — verification is a manual end-to-end run against a real AshbyHQ form (see Task 6). The tasks below therefore do not follow strict red-green TDD; instead they build the method incrementally, with TypeScript compilation as the per-task safety check.

---

## File Structure

- **Modify** `src/ashby-bot.ts`:
  - Add private `fillRequiredComboboxes()` method (~110 lines, placed immediately after `fillRequiredRadioGroups()` ends around line 1546).
  - Call it from `handleAdditionalQuestions()` at the line currently reading `await this.fillRequiredRadioGroups();` (line 1150).
  - Call it from `handleValidationErrors()` at the line currently reading `await this.fillRequiredRadioGroups();` (line 1186).

No other files change. No new modules, no new config, no test files.

---

### Task 1: Add the empty `fillRequiredComboboxes` method scaffold

**Files:**
- Modify: `src/ashby-bot.ts` (insert after the closing `}` of `fillRequiredRadioGroups` near line 1546)

- [ ] **Step 1: Add the empty method**

Locate the closing `}` of `fillRequiredRadioGroups()` (around line 1546, just before `async fillEmptyRequiredFields()` at line 1548). Insert the new method directly after it:

```typescript
  private async fillRequiredComboboxes(): Promise<void> {
    if (!this.page) return;

    console.log('🔽 Scanning for required combobox questions...');

    const fieldsets = await this.page.locator('fieldset').all();

    let processed = 0;
    let filled = 0;

    for (const fieldset of fieldsets) {
      try {
        // Implementation added in subsequent tasks.
      } catch (error) {
        console.log(`  ⚠️  Error processing a combobox: ${error}`);
        continue;
      }
    }

    console.log(`🔽 Combobox pass: ${filled}/${processed} answered`);
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors. The repo's `tsconfig.json` uses `"strict": true` but does not enable `noUnusedLocals`, so the temporarily-unused `processed` and `filled` variables compile cleanly. The `catch` block's `error` binding is also fine.

- [ ] **Step 3: Commit**

```bash
git add src/ashby-bot.ts
git commit -m "Add empty fillRequiredComboboxes scaffold to AshbyJobApplicationBot"
```

---

### Task 2: Implement the required-fieldset filter and combobox detection

**Files:**
- Modify: `src/ashby-bot.ts` (inside the `for (const fieldset of fieldsets)` loop added in Task 1)

- [ ] **Step 1: Add the per-fieldset detection logic**

Replace the placeholder comment `// Implementation added in subsequent tasks.` with this code (keeping the surrounding `try`/`catch`):

```typescript
        const titleLabel = fieldset.locator(':scope > label.ashby-application-form-question-title').first();
        const titleCount = await titleLabel.count();
        if (titleCount === 0) continue;

        const classAttr = (await titleLabel.getAttribute('class')) ?? '';
        const classList = classAttr.split(/\s+/);
        const isRequired = classList.some(c => /^_required_/.test(c));
        if (!isRequired) continue;

        const combobox = fieldset.locator('input[role="combobox"]').first();
        const comboboxCount = await combobox.count();
        if (comboboxCount === 0) continue;

        // Skip if already filled (covers the legacy "How did you hear" handler
        // at lines ~896-928 plus any prefilled form state)
        const currentValue = await combobox.inputValue();
        if (currentValue.trim().length > 0) continue;

        const questionText = (await titleLabel.textContent())?.trim() ?? '';
        if (!questionText) continue;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ashby-bot.ts
git commit -m "Detect required, empty combobox fields in fillRequiredComboboxes"
```

---

### Task 3: Open the listbox and discover options

**Files:**
- Modify: `src/ashby-bot.ts` (append to the `try` block from Task 2)

- [ ] **Step 1: Add the listbox-open + option-scraping logic**

Append this block to the `try` body, immediately after the `questionText` check from Task 2:

```typescript
        // Open the listbox
        await combobox.click({ timeout: 5000 });

        // Wait for aria-expanded to flip
        const expanded = await combobox
          .evaluate(
            (el, ms) =>
              new Promise<boolean>(resolve => {
                const check = () => el.getAttribute('aria-expanded') === 'true';
                if (check()) return resolve(true);
                const observer = new MutationObserver(() => {
                  if (check()) {
                    observer.disconnect();
                    resolve(true);
                  }
                });
                observer.observe(el, { attributes: true, attributeFilter: ['aria-expanded'] });
                setTimeout(() => {
                  observer.disconnect();
                  resolve(check());
                }, ms);
              }),
            2000
          )
          .catch(() => false);

        if (!expanded) {
          console.log(`  ⚠️  Combobox for "${questionText}" did not open (aria-expanded never became true). Skipping.`);
          continue;
        }

        // Resolve the listbox element via aria-controls, falling back to page-wide visible
        const ariaControls = await combobox.getAttribute('aria-controls');
        let listbox = ariaControls
          ? this.page.locator(`#${CSS.escape(ariaControls)}`)
          : this.page.locator('[role="listbox"]:visible').first();

        if ((await listbox.count()) === 0 || !(await listbox.isVisible().catch(() => false))) {
          listbox = this.page.locator('[role="listbox"]:visible').first();
        }

        if ((await listbox.count()) === 0) {
          console.log(`  ⚠️  Could not find listbox for "${questionText}". Skipping.`);
          continue;
        }

        // Scrape options
        const optionLocators = await listbox.locator('[role="option"]').all();
        const optionTexts: string[] = [];
        for (const opt of optionLocators) {
          const text = (await opt.textContent())?.trim() ?? '';
          if (text) optionTexts.push(text);
        }

        if (optionTexts.length === 0) {
          console.log(`  ⚠️  Combobox "${questionText}" has no options. Skipping.`);
          continue;
        }

        processed++;
        console.log(`  ❓ ${questionText}`);
        console.log(`     Options: ${optionTexts.join(' | ')}`);
```

Note on `CSS.escape`: it's a browser global. In Node it's not in scope. Replace `CSS.escape(ariaControls)` with a manual escape:

```typescript
        const escapeId = (id: string) => id.replace(/(["\\\#\.:\[\]\(\)])/g, '\\$1');
```

…and use `escapeId(ariaControls)` instead. Add the `escapeId` helper as a `const` inside the method body (just before the `for (const fieldset of fieldsets)` loop) so it's available in this and later iterations.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ashby-bot.ts
git commit -m "Open combobox listbox and scrape role=option items"
```

---

### Task 4: Call `pickFromOptions` and compute the type-prefix

**Files:**
- Modify: `src/ashby-bot.ts` (append to the `try` block from Task 3)

- [ ] **Step 1: Add the AI call and prefix computation**

Append this block immediately after the `processed++` / `console.log` calls from Task 3:

```typescript
        const chosen = await this.aiGenerator.pickFromOptions(questionText, optionTexts);

        if (!chosen) {
          console.log(`  ⚠️  Could not pick an option for "${questionText}". Skipping.`);
          continue;
        }

        const chosenNorm = chosen.trim().toLowerCase();
        const matchedOption =
          optionTexts.find(o => o === chosen) ??
          optionTexts.find(o => o.trim().toLowerCase() === chosenNorm);

        if (!matchedOption) {
          console.log(`  ⚠️  AI returned "${chosen}" which does not match any option. Skipping.`);
          continue;
        }

        // Compute a unique prefix: truncate at the first " (" if present.
        const parenIdx = matchedOption.indexOf(' (');
        const candidatePrefix = (parenIdx >= 0 ? matchedOption.slice(0, parenIdx) : matchedOption).trim();
        const candidateLower = candidatePrefix.toLowerCase();

        const isUniquePrefix = optionTexts.every(
          o => o === matchedOption || !o.trim().toLowerCase().startsWith(candidateLower)
        );

        const typeText = isUniquePrefix ? candidatePrefix : matchedOption;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ashby-bot.ts
git commit -m "Pick combobox option via AI and compute unique type prefix"
```

---

### Task 5: Type the prefix, press Enter, and verify

**Files:**
- Modify: `src/ashby-bot.ts` (append to the `try` block from Task 4)

- [ ] **Step 1: Add the type/Enter/verify block**

Append this block immediately after the `const typeText = ...;` line from Task 4:

```typescript
        // Clear any partial state and type the prefix slowly enough for the
        // autocomplete filter to react.
        await combobox.fill('');
        await combobox.type(typeText, { delay: 30 });

        // Give the listbox a moment to narrow before pressing Enter.
        await this.page.waitForTimeout(200);
        await combobox.press('Enter');
        await this.page.waitForTimeout(300);

        const finalValue = (await combobox.inputValue()).trim();
        const finalLower = finalValue.toLowerCase();
        const matchedLower = matchedOption.toLowerCase();
        const verified =
          finalLower === matchedLower ||
          finalLower.startsWith(matchedLower) ||
          matchedLower.startsWith(finalLower);

        if (verified && finalValue.length > 0) {
          console.log(`  ✅ Selected "${matchedOption}" for "${questionText}"`);
          filled++;
        } else {
          console.log(
            `  ⚠️  Combobox value did not update after selecting "${matchedOption}" for "${questionText}" (current value: "${finalValue}")`
          );
        }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ashby-bot.ts
git commit -m "Type prefix, press Enter, and verify combobox selection"
```

---

### Task 6: Wire `fillRequiredComboboxes` into both call sites

**Files:**
- Modify: `src/ashby-bot.ts` at the two places that currently call `fillRequiredRadioGroups()`

- [ ] **Step 1: Wire into `handleAdditionalQuestions`**

Find the line in `handleAdditionalQuestions()` (around line 1150) that currently reads:

```typescript
      await this.fillRequiredRadioGroups();
```

Replace it with:

```typescript
      await this.fillRequiredRadioGroups();
      await this.fillRequiredComboboxes();
```

- [ ] **Step 2: Wire into `handleValidationErrors`**

Find the line in `handleValidationErrors()` (around line 1186) that currently reads:

```typescript
      await this.fillRequiredRadioGroups();
```

Replace it with:

```typescript
      await this.fillRequiredRadioGroups();
      await this.fillRequiredComboboxes();
```

(Note: there are two identical-looking `await this.fillRequiredRadioGroups();` calls in the file. The first is in `handleAdditionalQuestions` near line 1150, the second is in `handleValidationErrors` near line 1186. Make sure to update both — `grep -n "await this.fillRequiredRadioGroups()" src/ashby-bot.ts` should show exactly two matches before and two matches after, paired with the new combobox calls.)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the wiring with grep**

Run: `grep -n "fillRequiredComboboxes\|fillRequiredRadioGroups" src/ashby-bot.ts`

Expected output (line numbers may differ slightly):
- One definition line for each method (`private async fillRequiredRadioGroups` and `private async fillRequiredComboboxes`).
- Two call-pairs: each `fillRequiredRadioGroups()` call is immediately followed by a `fillRequiredComboboxes()` call.
- Total: 6 lines (2 definitions + 2 radio calls + 2 combobox calls).

- [ ] **Step 5: Commit**

```bash
git add src/ashby-bot.ts
git commit -m "Wire fillRequiredComboboxes into handleAdditionalQuestions and handleValidationErrors"
```

---

### Task 7: Manual end-to-end verification

**Files:**
- No code changes. This is the verification step that takes the place of unit tests.

- [ ] **Step 1: Confirm a target URL is uncommented in `src/apply.ts`**

Open `src/apply.ts`. The `jobUrls` array should contain at least one uncommented URL pointing to an AshbyHQ application form that includes the work-authorization combobox or a similar required combobox question. The siftstack URL currently uncommented in the file (`https://jobs.ashbyhq.com/siftstack/.../application?src=LinkedIn`) is known to contain the work-authorization combobox shown in the spec.

If for any reason that URL no longer hosts a valid application, pick another AshbyHQ URL whose form has a required combobox question and uncomment it. Do not commit `src/apply.ts` changes as part of this work — `src/apply.ts` is a runtime entry point that already shows as modified in `git status`; treat any URL toggling here as throwaway local state.

- [ ] **Step 2: Build and run the bot**

Run the bot using whatever entrypoint the project uses for `src/apply.ts` (typically `npm start` or `npx ts-node src/apply.ts`; check `package.json` `scripts` if unsure). Watch the browser session.

- [ ] **Step 3: Verify the legacy "How did you hear" handler still fires first**

In the terminal output, you should see the legacy handler's log line `  ℹ️  Found "How did you hear" combobox (autocomplete) field` before any output from `fillRequiredComboboxes`. If you don't see it, the form may not include that field — that's fine, just note it.

- [ ] **Step 4: Verify `fillRequiredComboboxes` runs and selects an option**

In the terminal output, you should see:

```
🔽 Scanning for required combobox questions...
  ❓ <some question, e.g. "What is your current U.S. work authorization status?">
     Options: <option list joined with " | ">
  ✅ Selected "<choice>" for "<that question>"
🔽 Combobox pass: <N>/<N> answered
```

If the line `❓ <question>` appears for "How did you hear about this opportunity?", that means the legacy handler did NOT fill it first (its `inputValue()` was empty when we checked). That's not necessarily a bug — depending on form layout the legacy handler may not match — but cross-check by reading `src/ashby-bot.ts:896-928` and confirming whether the question text matched its `/how did you hear|where did you hear|how.*you.*find.*opportunity/i` regex.

- [ ] **Step 5: Verify in the browser DOM**

While the browser is still open (the script keeps it open for ~20 seconds at the end), inspect the combobox input the bot selected. Its `value` attribute should match (or start with) the option text logged in Step 4.

- [ ] **Step 6: Verify form submission**

Confirm the form either submitted successfully or, if it failed validation, that the validation errors do NOT include "Missing entry for required field: <a combobox question>" for any question the bot logged as ✅ Selected.

- [ ] **Step 7: Document the run**

There's no acceptance test to update, but if anything surprised you, add a brief note (one paragraph) at the bottom of `docs/superpowers/specs/2026-05-11-combobox-handler-design.md` under a new `## Implementation Notes` section describing what happened. Commit that note:

```bash
git add docs/superpowers/specs/2026-05-11-combobox-handler-design.md
git commit -m "Add implementation notes from combobox-handler end-to-end run"
```

If nothing surprised you, skip this step.

---

## Done When

- `fillRequiredComboboxes` exists as a private method on `AshbyJobApplicationBot`.
- It is called from `handleAdditionalQuestions` and `handleValidationErrors`, immediately after the corresponding `fillRequiredRadioGroups` call.
- `npx tsc --noEmit` passes.
- A manual end-to-end run against an AshbyHQ form with a required combobox shows the method selecting an option and the form accepting it.
- The legacy "How did you hear" handler at `src/ashby-bot.ts:896-928` is unchanged.
