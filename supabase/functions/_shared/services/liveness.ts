/**
 * Liveness and face checks (APP.md §6.2, VER-01/03/04, BAN-03/10).
 *
 * The video and reference frame are never stored: the frame is used in
 * memory for the face search and age estimate, then dropped. Only the
 * provider's face id (as an HMAC) and the outcome are kept.
 */
import {
  decideLiveness,
  LIVENESS_COOLDOWN_HOURS,
  livenessCompleteSchema,
  livenessRetry,
  type FaceOwner,
  type LivenessCompleteResponse,
  type LivenessOutcome,
  type LivenessStartResponse,
} from '../../../../packages/shared/src/index.ts';
import { identifierHash } from '../crypto.ts';
import type { ServerEnv } from '../env.ts';
import type {
  AuthAdmin,
  Db,
  FaceIndex,
  LivenessService,
  RequestContext,
  Result,
} from '../types.ts';
import { fail, ok } from '../types.ts';

export interface LivenessDeps {
  env: Pick<ServerEnv, 'hmacSecret'>;
  db: Db;
  auth: AuthAdmin;
  liveness: LivenessService | null;
  faces: FaceIndex | null;
}

type Eligible = { kind: 'error'; error: Result<never> } | { kind: 'ok'; user: { id: string } };

async function eligibleUser(deps: LivenessDeps, token: string | null): Promise<Eligible> {
  const user = token ? await deps.auth.userFromToken(token) : null;
  if (!user) return { kind: 'error', error: fail(401, 'not_authenticated') };
  const state = await deps.db.profileState(user.id);
  // First check: after consents (biometric consent, §17) and basics (§6.1 step 7 → 8).
  const firstCheck =
    state?.status === 'onboarding' &&
    state.consentsComplete &&
    state.basicsComplete &&
    !state.livenessVerified &&
    !state.idRequired;
  // Repeat check after the main photo changed (VER-07).
  const recheck =
    Boolean(state?.reverifyRequired) && ['onboarding', 'active', 'paused'].includes(state!.status);
  if (!firstCheck && !recheck) {
    return { kind: 'error', error: fail(409, 'wrong_step') };
  }
  return { kind: 'ok', user };
}

export async function startLiveness(
  deps: LivenessDeps,
  token: string | null,
  ctx: RequestContext,
): Promise<Result<LivenessStartResponse>> {
  const e = await eligibleUser(deps, token);
  if (e.kind === 'error') return e.error;
  if (!deps.liveness || !deps.faces) return fail(503, 'service_unavailable');

  const since = new Date(ctx.now.getTime() - LIVENESS_COOLDOWN_HOURS * 3_600_000);
  const retry = livenessRetry(await deps.db.livenessFailuresSince(e.user.id, since), ctx.now);
  if (!retry.allowed) return fail(429, 'liveness_cooldown', retry.retryAt);

  const sessionId = await deps.liveness.createSession();
  await deps.db.livenessCreate(e.user.id, deps.liveness.name, sessionId);
  return ok({ ok: true, sessionId, provider: deps.liveness.name });
}

export async function completeLiveness(
  deps: LivenessDeps,
  token: string | null,
  raw: unknown,
  ctx: RequestContext,
): Promise<Result<LivenessCompleteResponse>> {
  const e = await eligibleUser(deps, token);
  if (e.kind === 'error') return e.error;
  const parsed = livenessCompleteSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');
  if (!deps.liveness || !deps.faces) return fail(503, 'service_unavailable');
  const { sessionId } = parsed.data;
  const userId = e.user.id;
  const secret = deps.env.hmacSecret;

  const threshold = await deps.db.flag<number>('liveness.min_confidence', 90);
  const matchThreshold = await deps.db.flag<number>('liveness.face_match_threshold', 90);
  const result = await deps.liveness.getResult(sessionId);

  let matches: FaceOwner[] = [];
  let matchedHashes: string[] = [];
  let age: { low: number; high: number } | null = null;
  const image = result.referenceImage;
  if (image && result.confidence >= threshold) {
    const faceIds = await deps.faces.search(image, matchThreshold);
    matchedHashes = await Promise.all(faceIds.map((id) => identifierHash(secret, 'face', id)));
    matches = matchedHashes.length ? await deps.db.faceOwners(userId, matchedHashes) : [];
    age = await deps.faces.ageLow(image);
  }

  let outcome: LivenessOutcome = image
    ? decideLiveness(
        { confidence: result.confidence, ageLow: age?.low ?? null, matches },
        { minConfidence: threshold },
      )
    : 'failed_low_confidence';

  let faceHash: string | null = null;
  if (image && (outcome === 'passed' || outcome === 'needs_id')) {
    const faceId = await deps.faces.index(image, `u_${userId}`);
    faceHash = faceId ? await identifierHash(secret, 'face', faceId) : null;
  }

  const stored = await deps.db.livenessFinish({
    userId,
    provider: deps.liveness.name,
    sessionId,
    outcome,
    confidence: result.confidence,
    ageLow: age?.low ?? null,
    ageHigh: age?.high ?? null,
    faceHash,
    // All matches go along: on ban evasion every matched face joins the ban record.
    matchedHashes,
  });
  if (stored === 'unknown_session') return fail(400, 'invalid_input');
  if (stored === 'duplicate_face') outcome = 'duplicate_face';

  switch (outcome) {
    case 'passed':
      return ok({ ok: true, outcome: 'passed' });
    case 'needs_id':
      return ok({ ok: true, outcome: 'needs_id' });
    case 'duplicate_face':
    case 'banned_face':
      // Same generic answer for both (§7.5): never confirm who the face belongs to.
      return ok({ ok: true, outcome: 'blocked' });
    default: {
      const since = new Date(ctx.now.getTime() - LIVENESS_COOLDOWN_HOURS * 3_600_000);
      const retry = livenessRetry(await deps.db.livenessFailuresSince(userId, since), ctx.now);
      return ok({
        ok: true,
        outcome: 'failed',
        ...(retry.allowed ? {} : { retryAt: retry.retryAt.toISOString() }),
      });
    }
  }
}
