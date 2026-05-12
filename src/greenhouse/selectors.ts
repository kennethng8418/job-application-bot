export const SELECTORS = {
  formRoot: 'form#application-form, form[action*="greenhouse"]',
  submitButton: 'button[type="submit"], input[type="submit"]',
  recaptchaIframe: 'iframe[src*="recaptcha"]',
  requiredIndicator: '[aria-required="true"], [required]',
  phoneInput: 'input[type="tel"], input[name*="phone" i], input[id*="phone" i]',
  countrySelect: 'select[name*="country" i], select[id*="country" i]',
  countryCodePrefix: '[data-country-code], .iti__selected-flag',
  resumeFileInput:
    'input[type="file"][name*="resume" i], input[type="file"][id*="resume" i]',
  coverLetterFileInput:
    'input[type="file"][name*="cover" i], input[type="file"][id*="cover" i]',
  uploadConfirmation:
    '.file__name, [data-source="file"]',
} as const;

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const POST_COUNTRY_WAIT_MS = 3000;
export const UPLOAD_CONFIRMATION_TIMEOUT_MS = 5000;
export const POST_SUBMIT_VERIFICATION_MS = 10_000;
