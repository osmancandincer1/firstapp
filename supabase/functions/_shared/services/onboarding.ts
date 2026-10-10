/**
 * Age gate and legal consents (APP.md §6.1 steps 5–6, AUTH-01, AUTH-07).
 * Steps must be done in order; the server refuses skipped steps.
 */
import {
  AGE_GATE_LOCK_HOURS,
  birthDateSchema,
  calendarDateIn,
  checkBirthDate,
  consentsSchema,
  validateConsents,
} from '../../../../packages/shared/src/index.ts';
import { ipHash } from '../crypto.ts';
import type { ServerEnv } from '../env.ts';
import type { AuthAdmin, Db, RequestContext, Result } from '../types.ts';
import { fail, ok } from '../types.ts';

export interface OnboardingDeps {
  env: Pick<ServerEnv, 'hmacSecret'>;
  db: Db;
  auth: AuthAdmin;
}

export async function setBirthDate(
  deps: OnboardingDeps,
  token: string | null,
  raw: unknown,
  ctx: RequestContext,
): Promise<Result<{ ok: true }>> {
  const user = token ? await deps.auth.userFromToken(token) : null;
  if (!user) return fail(401, 'not_authenticated');
  const parsed = birthDateSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');

  const state = await deps.db.profileState(user.id);
  if (!state || state.status !== 'onboarding' || !state.phoneVerified)
    return fail(409, 'wrong_step');
  if (state.birthDate) return fail(409, 'birth_date_already_set');

  // Cheap pre-check; the database repeats it with its own clock (srv_set_birth_date).
  const check = checkBirthDate(parsed.data.birthDate, calendarDateIn(ctx.now));
  if (check === 'invalid' || check === 'future' || check === 'implausible')
    return fail(400, 'invalid_input');

  const result = await deps.db.setBirthDate(user.id, parsed.data.birthDate);
  const lockedUntil = new Date(ctx.now.getTime() + AGE_GATE_LOCK_HOURS * 3_600_000);
  switch (result) {
    case 'ok':
      return ok({ ok: true });
    case 'underage':
      return fail(403, 'underage', lockedUntil);
    case 'age_locked':
      return fail(429, 'age_locked');
    case 'already_set':
      return fail(409, 'birth_date_already_set');
    default:
      return fail(400, 'invalid_input');
  }
}

export async function recordConsents(
  deps: OnboardingDeps,
  token: string | null,
  raw: unknown,
  ctx: RequestContext,
): Promise<Result<{ ok: true }>> {
  const user = token ? await deps.auth.userFromToken(token) : null;
  if (!user) return fail(401, 'not_authenticated');
  const parsed = consentsSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');

  const state = await deps.db.profileState(user.id);
  if (!state || state.status !== 'onboarding' || !state.birthDate) return fail(409, 'wrong_step');

  const versions = await deps.db.currentLegalVersions();
  // No usable documents (e.g. production before the lawyer-approved texts exist): stay closed.
  if (Object.keys(versions).length === 0) return fail(503, 'service_unavailable');

  const validation = validateConsents(parsed.data.consents, versions);
  if (!validation.ok) {
    return fail(
      400,
      validation.reason === 'version_mismatch' ? 'consents_outdated' : 'consents_incomplete',
    );
  }
  await deps.db.insertConsents(
    user.id,
    parsed.data.consents,
    await ipHash(deps.env.hmacSecret, ctx.ip),
  );
  return ok({ ok: true });
}
