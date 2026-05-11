import { Locator } from 'playwright';

/**
 * Retry a click operation with exponential backoff
 * @param button - The Playwright locator to click
 * @param description - Description of what's being clicked (for logging)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise<boolean> - true if successful, false if all retries failed
 */
export async function clickWithRetry(
  button: Locator,
  description: string,
  maxRetries: number = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await button.click({ timeout: 5000 });
      console.log(`  ✓ Clicked: ${description}`);
      return true;
    } catch (error) {
      if (attempt < maxRetries) {
        const waitTime = 500 * attempt; // Exponential backoff: 500ms, 1000ms, 1500ms
        console.log(`  ⚠️  Click attempt ${attempt}/${maxRetries} failed for "${description}". Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        console.log(`  ✗ Failed to click "${description}" after ${maxRetries} attempts: ${error}`);
        return false;
      }
    }
  }
  return false;
}

/**
 * Retry a fill operation with validation
 * @param input - The Playwright locator to fill
 * @param value - The value to fill
 * @param fieldName - Name of the field (for logging)
 * @param maxRetries - Maximum number of retry attempts (default: 2)
 * @returns Promise<boolean> - true if successful, false if all retries failed
 */
export async function fillWithRetry(
  input: Locator,
  value: string,
  fieldName: string,
  maxRetries: number = 2
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await input.fill(value, { timeout: 5000 });

      // Validate that the value was actually filled
      const actualValue = await input.inputValue();

      if (actualValue === value) {
        console.log(`  ✓ Filled & validated: ${fieldName}`);
        return true;
      } else {
        if (attempt < maxRetries) {
          console.log(`  ⚠️  Fill validation failed for "${fieldName}": expected "${value}", got "${actualValue}". Retrying...`);
          await input.clear();
        } else {
          console.log(`  ✗ Fill validation failed for "${fieldName}" after ${maxRetries} attempts`);
          return false;
        }
      }
    } catch (error) {
      if (attempt < maxRetries) {
        console.log(`  ⚠️  Fill attempt ${attempt}/${maxRetries} failed for "${fieldName}". Retrying...`);
        await new Promise(resolve => setTimeout(resolve, 300));
      } else {
        console.log(`  ✗ Failed to fill "${fieldName}" after ${maxRetries} attempts: ${error}`);
        return false;
      }
    }
  }
  return false;
}

/**
 * Retry a check/uncheck operation
 * @param checkbox - The Playwright locator for checkbox
 * @param shouldCheck - true to check, false to uncheck
 * @param description - Description of the checkbox (for logging)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise<boolean> - true if successful, false if all retries failed
 */
export async function checkWithRetry(
  checkbox: Locator,
  shouldCheck: boolean,
  description: string,
  maxRetries: number = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const isChecked = await checkbox.isChecked();

      // Only perform action if needed
      if (isChecked !== shouldCheck) {
        if (shouldCheck) {
          await checkbox.check({ timeout: 5000 });
        } else {
          await checkbox.uncheck({ timeout: 5000 });
        }

        // Validate the action
        const newState = await checkbox.isChecked();
        if (newState === shouldCheck) {
          console.log(`  ✓ ${shouldCheck ? 'Checked' : 'Unchecked'}: ${description}`);
          return true;
        } else {
          throw new Error(`Checkbox state validation failed`);
        }
      } else {
        console.log(`  ⊙ Already ${shouldCheck ? 'checked' : 'unchecked'}: ${description}`);
        return true;
      }
    } catch (error) {
      if (attempt < maxRetries) {
        const waitTime = 500 * attempt;
        console.log(`  ⚠️  Check attempt ${attempt}/${maxRetries} failed for "${description}". Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        console.log(`  ✗ Failed to ${shouldCheck ? 'check' : 'uncheck'} "${description}" after ${maxRetries} attempts: ${error}`);
        return false;
      }
    }
  }
  return false;
}
