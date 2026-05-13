const DECLINE_KEYWORDS = ['decline', 'do not want', 'prefer not', "don't wish"];
const AFFIRM_KEYWORDS = [
  'acknowledge',
  'agree',
  'confirm',
  'certify',
  'accept',
  'i have read',
  'i understand',
];

export function matchEEOOption(
  options: string[],
  desired: string,
): string | null {
  const exact = options.find(o => o === desired);
  if (exact) return exact;

  const ciExact = options.find(o => o.toLowerCase() === desired.toLowerCase());
  if (ciExact) return ciExact;

  const desiredLower = desired.toLowerCase();

  // For short tokens like "Yes"/"No", match at word boundary only — otherwise
  // "No" can match "I don't know" via the "no" inside "know".
  if (desiredLower.length <= 3) {
    const boundaryRegex = new RegExp(
      `(^|[^a-z])${desiredLower}([^a-z]|$)`,
      'i',
    );
    const boundaryMatch = options.find(o => boundaryRegex.test(o));
    if (boundaryMatch) return boundaryMatch;
  } else {
    const substring = options.find(
      o => o.toLowerCase().includes(desiredLower) ||
           desiredLower.includes(o.toLowerCase()),
    );
    if (substring) return substring;
  }

  const desiredIsDecline = DECLINE_KEYWORDS.some(kw => desiredLower.includes(kw));
  if (desiredIsDecline) {
    const declineMatch = options.find(o =>
      DECLINE_KEYWORDS.some(kw => o.toLowerCase().includes(kw)),
    );
    if (declineMatch) return declineMatch;
  }

  // "Yes" against acknowledgement-style options. Greenhouse's privacy-policy
  // comboboxes often have a single option like "I acknowledge" or
  // "acknowledge/confirm" with no literal "Yes" choice.
  if (desiredLower === 'yes') {
    const affirmMatch = options.find(o =>
      AFFIRM_KEYWORDS.some(kw => o.toLowerCase().includes(kw)),
    );
    if (affirmMatch) return affirmMatch;
  }

  return null;
}

export const EEO_DEFAULTS = {
  gender: 'Decline to self-identify',
  hispanicLatino: 'Decline to self-identify',
  race: 'Decline to self-identify',
  veteranStatus: 'I decline to self-identify for protected veteran status',
  disabilityStatus: 'I do not want to answer',
} as const;
