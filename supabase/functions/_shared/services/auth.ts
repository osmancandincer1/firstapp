/**
 * Email sign-in and session registration (APP.md §6.1 steps 2–3, §6.3, §7.3, §7.5).
 *
 * No-leak rule (BAN-06): a code request answers the same way whether the
 * address is new, existing or banned. A banned address receives an
 * explanation by email instead of a code, so only its owner learns why.
 */
import {
  canonicalEmail,
  emailDomain,
  emailOtpRequestSchema,
  emailOtpVerifySchema,
  generateOtpCode,
  isDisposableDomain,
  LOGIN_ATTEMPTS_PER_HOUR,
  normalizeEmail,
  OTP_LOCK_MINUTES,
  OTP_MAX_FAILED_ATTEMPTS,
  OTP_REQUESTS_PER_HOUR,
  OTP_TTL_MINUTES,
  sessionRegisterSchema,
  type EmailOtpRequestResponse,
  type EmailOtpVerifyResponse,
} from '../../../../packages/shared/src/index.ts';
import { identifierHash, ipHash, otpCodeHash } from '../crypto.ts';
import type { ServerEnv } from '../env.ts';
import { emailBlocked, emailCode } from '../messages.ts';
import type {
  AuthAdmin,
  Db,
  EmailSender,
  IdentifierType,
  Platform,
  RequestContext,
  Result,
} from '../types.ts';
import { fail, ok } from '../types.ts';

export interface AuthDeps {
  env: Pick<ServerEnv, 'hmacSecret' | 'supportEmail'>;
  db: Db;
  auth: AuthAdmin;
  email: EmailSender | null;
  disposableDomains: ReadonlySet<string>;
  /** Random source for codes; injectable for tests. */
  code?: () => string;
}

const HOUR = 3600;

/** Applies each limit in turn; the first full bucket refuses the request. */
export async function withinLimits(db: Db, buckets: string[], max: number): Promise<boolean> {
  for (const b of buckets) {
    if (!(await db.rateLimitHit(b, HOUR, max))) return false;
  }
  return true;
}

export async function requestEmailOtp(
  deps: AuthDeps,
  raw: unknown,
  ctx: RequestContext,
): Promise<Result<EmailOtpRequestResponse>> {
  const parsed = emailOtpRequestSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');
  const { deviceId, locale } = parsed.data;

  const email = normalizeEmail(parsed.data.email);
  const canonical = canonicalEmail(parsed.data.email);
  if (!email || !canonical) return fail(400, 'invalid_email');
  if (isDisposableDomain(emailDomain(email), deps.disposableDomains))
    return fail(400, 'disposable_email');
  if (!deps.email) return fail(503, 'service_unavailable');

  const secret = deps.env.hmacSecret;
  const [emailHash, deviceHash, ipKey] = await Promise.all([
    identifierHash(secret, 'email', canonical),
    identifierHash(secret, 'device', deviceId),
    ipHash(secret, ctx.ip),
  ]);
  const allowed = await withinLimits(
    deps.db,
    [`otp:email:ip:${ipKey}`, `otp:email:device:${deviceHash}`, `otp:email:target:${emailHash}`],
    OTP_REQUESTS_PER_HOUR,
  );
  if (!allowed) return fail(429, 'rate_limited');

  const banned = await deps.db.banLookup([{ type: 'email', hash: emailHash }]);
  if (banned) {
    const m = emailBlocked(locale, deps.env.supportEmail);
    await deps.email.send(email, m.subject, m.text);
    return ok({ ok: true });
  }

  const code = (deps.code ?? generateOtpCode)();
  const codeHash = await otpCodeHash(secret, 'email', emailHash, code);
  const created = await deps.db.otpCreate('email', emailHash, codeHash, OTP_TTL_MINUTES * 60);
  if (created === 'locked') return fail(429, 'otp_locked');

  const m = emailCode(locale, code);
  await deps.email.send(email, m.subject, m.text);
  return ok({ ok: true });
}

/** Device registration and ban checks shared by every sign-in path. */
async function registerAndCheck(
  deps: Pick<AuthDeps, 'db' | 'env'>,
  userId: string,
  device: { id: string; platform: Platform; appVersion?: string | undefined },
  identifiers: { type: IdentifierType; hash: string }[],
): Promise<'ok' | 'banned'> {
  const deviceHash = await identifierHash(deps.env.hmacSecret, 'device', device.id);
  // A banned device only raises risk and queues a review (BAN-05).
  await deps.db.registerDevice(userId, device.platform, deviceHash, device.appVersion ?? null);

  const banned = await deps.db.banLookup(identifiers);
  if (banned) {
    // Signing in with a banned identifier is ban evasion: this account is banned too (BAN-10).
    await deps.db.banAccount(userId, 'ban_evasion', [
      ...identifiers,
      { type: 'device', hash: deviceHash },
    ]);
    return 'banned';
  }
  for (const id of identifiers) await deps.db.bindIdentifier(userId, id.type, id.hash);
  return 'ok';
}

export async function verifyEmailOtp(
  deps: AuthDeps,
  raw: unknown,
  ctx: RequestContext,
): Promise<Result<EmailOtpVerifyResponse>> {
  const parsed = emailOtpVerifySchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');
  const { deviceId, code, platform, appVersion } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const canonical = canonicalEmail(parsed.data.email);
  if (!email || !canonical) return fail(400, 'invalid_email');

  const secret = deps.env.hmacSecret;
  const [emailHash, deviceHash, ipKey] = await Promise.all([
    identifierHash(secret, 'email', canonical),
    identifierHash(secret, 'device', deviceId),
    ipHash(secret, ctx.ip),
  ]);
  const allowed = await withinLimits(
    deps.db,
    [`login:ip:${ipKey}`, `login:device:${deviceHash}`],
    LOGIN_ATTEMPTS_PER_HOUR,
  );
  if (!allowed) return fail(429, 'rate_limited');

  const codeHash = await otpCodeHash(secret, 'email', emailHash, code);
  const status = await deps.db.otpVerify(
    'email',
    emailHash,
    codeHash,
    OTP_MAX_FAILED_ATTEMPTS,
    OTP_LOCK_MINUTES * 60,
  );
  if (status === 'locked') return fail(429, 'otp_locked');
  if (status === 'expired') return fail(400, 'otp_expired');
  if (status !== 'ok') return fail(400, 'otp_invalid');

  // The person has proven they own the mailbox, so a generic refusal is safe to show now.
  if (await deps.db.banLookup([{ type: 'email', hash: emailHash }]))
    return fail(403, 'registration_blocked');

  // "a.b@gmail.com" and "ab@gmail.com" are one mailbox, so they are one account.
  const owner = await deps.db.identifierOwner('email', emailHash);
  const loginEmail = owner ? ((await deps.auth.emailOf(owner)) ?? email) : email;
  const { userId, session } = await deps.auth.signInByEmail(loginEmail);

  const result = await registerAndCheck(deps, userId, { id: deviceId, platform, appVersion }, [
    { type: 'email', hash: emailHash },
  ]);
  if (result === 'banned') return fail(403, 'registration_blocked');
  return ok({ ok: true, session });
}

/**
 * Called by the app right after any sign-in, including Apple/Google, so OAuth
 * accounts get the same device and ban checks (BAN-04).
 */
export async function registerSession(
  deps: Pick<AuthDeps, 'db' | 'env' | 'auth'>,
  token: string | null,
  raw: unknown,
): Promise<Result<{ ok: true }>> {
  const user = token ? await deps.auth.userFromToken(token) : null;
  if (!user) return fail(401, 'not_authenticated');
  const parsed = sessionRegisterSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');

  const secret = deps.env.hmacSecret;
  const identifiers: { type: IdentifierType; hash: string }[] = [];
  const canonical = user.email ? canonicalEmail(user.email) : null;
  if (canonical)
    identifiers.push({ type: 'email', hash: await identifierHash(secret, 'email', canonical) });
  for (const o of user.oauth) {
    identifiers.push({
      type: 'oauth_sub',
      hash: await identifierHash(secret, 'oauth_sub', `${o.provider}:${o.sub}`),
    });
  }

  const { deviceId, platform, appVersion } = parsed.data;
  const result = await registerAndCheck(
    deps,
    user.id,
    { id: deviceId, platform, appVersion },
    identifiers,
  );
  if (result === 'banned') return fail(403, 'registration_blocked');
  return ok({ ok: true });
}
