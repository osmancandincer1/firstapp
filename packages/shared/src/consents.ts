/**
 * Legal consents collected at sign-up (APP.md §6.1 step 6, §17, AUTH-07).
 * Each consent is stored with the version of the document it refers to.
 */

export const CONSENT_TYPES = [
  'terms',
  'community_guidelines',
  'kvkk_notice',
  'biometric',
  'special_category',
  'cross_border_transfer',
  'marketing',
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

/**
 * Required to continue. The KVKK notice is "shown and acknowledged", not a
 * consent, but its acknowledgement is recorded the same way. Marketing is the
 * only optional item and is never pre-selected.
 */
export const REQUIRED_CONSENTS: readonly ConsentType[] = [
  'terms',
  'community_guidelines',
  'kvkk_notice',
  'biometric',
  'special_category',
  'cross_border_transfer',
];

export interface ConsentChoice {
  type: ConsentType;
  version: string;
  granted: boolean;
}

/** Initial UI state: nothing is pre-checked (§6.1 "Önceden işaretli kutu olmaz"). */
export function initialConsentState(): Record<ConsentType, boolean> {
  return Object.fromEntries(CONSENT_TYPES.map((t) => [t, false])) as Record<ConsentType, boolean>;
}

export type ConsentValidation =
  | { ok: true }
  | { ok: false; reason: 'missing_required'; types: ConsentType[] }
  | { ok: false; reason: 'version_mismatch'; types: ConsentType[] }
  | { ok: false; reason: 'duplicate'; types: ConsentType[] };

/**
 * Checks a submission against the currently published document versions.
 * Every type must appear exactly once with the current version; required
 * types must be granted.
 */
export function validateConsents(
  choices: readonly ConsentChoice[],
  currentVersions: Readonly<Partial<Record<ConsentType, string>>>,
): ConsentValidation {
  const seen = new Map<ConsentType, ConsentChoice>();
  const duplicates: ConsentType[] = [];
  for (const c of choices) {
    if (seen.has(c.type)) duplicates.push(c.type);
    seen.set(c.type, c);
  }
  if (duplicates.length) return { ok: false, reason: 'duplicate', types: duplicates };

  const missing = CONSENT_TYPES.filter(
    (t) => !seen.has(t) || (REQUIRED_CONSENTS.includes(t) && !seen.get(t)!.granted),
  );
  if (missing.length) return { ok: false, reason: 'missing_required', types: missing };

  const stale = CONSENT_TYPES.filter((t) => seen.get(t)!.version !== currentVersions[t]);
  if (stale.length) return { ok: false, reason: 'version_mismatch', types: stale };

  return { ok: true };
}
