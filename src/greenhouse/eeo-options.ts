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

/**
 * Race tokens extracted from coarse EEOC strings. Order matters — we scan
 * `desired` for the first one that matches at a word boundary. "Native" and
 * "Hawaiian" are tried before broader tokens so "Native Hawaiian or Other
 * Pacific Islander..." routes to the right narrow option.
 */
const RACE_TOKENS = [
  'asian',
  'black',
  'african',
  'hispanic',
  'latino',
  'latine',
  'white',
  'caucasian',
  'european',
  'hawaiian',
  'pacific',
  'native',
  'indigenous',
];

function wordBoundaryRegex(token: string): RegExp {
  return new RegExp(`\\b${token}\\b`, 'i');
}

export interface MatchOptions {
  asianSubcategory?: string;
}

export function matchEEOOption(
  options: string[],
  desired: string,
  matchOpts?: MatchOptions,
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

  // Race-aware tier: when desired contains a race keyword at word boundary
  // (e.g. "Asian (Not Hispanic or Latino)" → asian, "Black or African American
  // ..." → black), find options containing that token. Word-boundary match
  // prevents "Caucasian" from absorbing the "asian" substring.
  const raceToken = RACE_TOKENS.find(t => wordBoundaryRegex(t).test(desiredLower));
  if (raceToken) {
    const optionsWithToken = options.filter(o => wordBoundaryRegex(raceToken).test(o));
    if (optionsWithToken.length === 1) return optionsWithToken[0];
    if (optionsWithToken.length > 1) {
      // Prefer configured Asian sub-category when present and applicable.
      if (raceToken === 'asian' && matchOpts?.asianSubcategory) {
        const sub = matchOpts.asianSubcategory;
        const subMatch = optionsWithToken.find(
          o => o.toLowerCase() === sub.toLowerCase(),
        );
        if (subMatch) return subMatch;
      }
      // Deterministic fallback: first alphabetically.
      return [...optionsWithToken].sort((a, b) => a.localeCompare(b))[0];
    }
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
