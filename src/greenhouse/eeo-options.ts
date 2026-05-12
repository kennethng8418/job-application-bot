const DECLINE_KEYWORDS = ['decline', 'do not want', 'prefer not', "don't wish"];

export function matchEEOOption(
  options: string[],
  desired: string,
): string | null {
  const exact = options.find(o => o === desired);
  if (exact) return exact;

  const ciExact = options.find(o => o.toLowerCase() === desired.toLowerCase());
  if (ciExact) return ciExact;

  const desiredLower = desired.toLowerCase();
  const substring = options.find(
    o => o.toLowerCase().includes(desiredLower) ||
         desiredLower.includes(o.toLowerCase()),
  );
  if (substring) return substring;

  const desiredIsDecline = DECLINE_KEYWORDS.some(kw => desiredLower.includes(kw));
  if (desiredIsDecline) {
    const declineMatch = options.find(o =>
      DECLINE_KEYWORDS.some(kw => o.toLowerCase().includes(kw)),
    );
    if (declineMatch) return declineMatch;
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
