import type { Locator } from 'playwright';
import type { Field } from './types';

const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^\s+$/,
  /^-+$/,
  /^-+\s*select\s*-+$/i,
  /^select\.{2,}$/i,
  /^select\s*$/i,
  /^choose\.{2,}$/i,
  /^choose\s*$/i,
  /^please\s+select/i,
];

export function isSelectPlaceholder(optionText: string): boolean {
  return PLACEHOLDER_PATTERNS.some(rx => rx.test(optionText));
}

/**
 * Returns true if a required field is currently empty / unanswered.
 * Per-kind semantics:
 *   - text / textarea: input value is empty/whitespace
 *   - checkbox: not checked
 *   - radio: no radio in the same `name=` group is checked
 *   - select: selectedIndex === 0 AND first option is a placeholder
 *   - combobox: react-select placeholder element still visible
 *   - file: always considered "filled" (uploadResume handles it)
 */
export async function isEmptyField(
  field: Field,
  scope: { page: import('playwright').Page },
): Promise<boolean> {
  switch (field.kind) {
    case 'text':
    case 'textarea': {
      const v = (await field.element.inputValue()).trim();
      return v === '';
    }
    case 'checkbox':
      return !(await field.element.isChecked());
    case 'radio': {
      const name = await field.element.getAttribute('name');
      if (!name) return !(await field.element.isChecked());
      const escapedName = name.replace(/(["\\])/g, '\\$1');
      const group = scope.page.locator(`input[name="${escapedName}"]`);
      const count = await group.count();
      for (let i = 0; i < count; i++) {
        if (await group.nth(i).isChecked()) return false;
      }
      return true;
    }
    case 'select': {
      const selectedIndex = await field.element.evaluate(
        (el: HTMLSelectElement) => el.selectedIndex,
      );
      if (selectedIndex > 0) return false;
      const firstText = (
        await field.element.locator('option').first().textContent()
      )?.trim() ?? '';
      return isSelectPlaceholder(firstText);
    }
    case 'combobox': {
      const inputValue = await field.element.inputValue().catch(() => '');
      if (inputValue.trim() !== '') return false;
      // react-select: the input is inside a container that also holds either
      // `.select__placeholder` (empty) or `.select__single-value` (filled).
      const container = comboboxContainer(field.element);
      const hasSingleValue = (await container.locator('.select__single-value').count()) > 0;
      if (hasSingleValue) return false;
      const hasPlaceholder = (await container.locator('.select__placeholder').count()) > 0;
      return hasPlaceholder;
    }
    case 'file':
      return false;
  }
}

function comboboxContainer(input: Locator): Locator {
  // The input lives inside `.select__control > .select__value-container`.
  // Walk up to the nearest `.select__control` ancestor; its parent contains
  // both placeholder and single-value siblings depending on state.
  return input.locator('xpath=ancestor::div[contains(@class, "select__control")][1]');
}
