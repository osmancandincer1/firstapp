/** Liveness and face checks (APP.md §6.2, VER-01/03/04, BAN-03). */

/** Failed attempts allowed before a cooldown (§6.2: "3 başarısız denemeden sonra 24 saat"). */
export const LIVENESS_MAX_FAILURES = 3;
export const LIVENESS_COOLDOWN_HOURS = 24;
/** Below this estimated age (lower bound) an ID document is required (§6.2). */
export const LIVENESS_ID_REQUIRED_BELOW_AGE = 21;

/** Who an existing face in the collection belongs to, as resolved from our database. */
export type FaceOwner = 'self' | 'active_other' | 'banned';

export interface LivenessEvidence {
  /** Provider liveness confidence, 0–100. */
  confidence: number;
  /** Lower bound of the provider's age estimate, if available. */
  ageLow: number | null;
  /** Matches above the similarity threshold, already resolved to owners. */
  matches: readonly FaceOwner[];
}

export interface LivenessThresholds {
  /** Minimum liveness confidence (feature flag liveness.min_confidence). */
  minConfidence: number;
}

export type LivenessOutcome =
  'failed_low_confidence' | 'banned_face' | 'duplicate_face' | 'needs_id' | 'passed';

/**
 * Order matters: a non-live session proves nothing, so it is rejected before
 * any face lookup result is trusted; a banned match outranks a duplicate.
 */
export function decideLiveness(e: LivenessEvidence, t: LivenessThresholds): LivenessOutcome {
  if (!(e.confidence >= t.minConfidence)) return 'failed_low_confidence';
  if (e.matches.includes('banned')) return 'banned_face';
  if (e.matches.includes('active_other')) return 'duplicate_face';
  if (e.ageLow === null || e.ageLow < LIVENESS_ID_REQUIRED_BELOW_AGE) return 'needs_id';
  return 'passed';
}

/** Outcomes that count toward the 3-strikes cooldown. */
export function countsAsFailure(outcome: LivenessOutcome): boolean {
  return outcome === 'failed_low_confidence';
}

/**
 * Whether a new attempt may start, given the times of recent failures.
 * Returns the moment the user may retry when blocked.
 */
export function livenessRetry(
  failureTimes: readonly Date[],
  now: Date,
): { allowed: true } | { allowed: false; retryAt: Date } {
  const windowStart = now.getTime() - LIVENESS_COOLDOWN_HOURS * 3_600_000;
  const recent = failureTimes
    .map((d) => d.getTime())
    .filter((t) => t > windowStart)
    .sort((a, b) => a - b);
  if (recent.length < LIVENESS_MAX_FAILURES) return { allowed: true };
  const blocking = recent[recent.length - LIVENESS_MAX_FAILURES]!;
  return { allowed: false, retryAt: new Date(blocking + LIVENESS_COOLDOWN_HOURS * 3_600_000) };
}
