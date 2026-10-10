/**
 * Phone verification (APP.md §6.1 step 4, §6.3, §7.3, AUTH-03/04/05, BAN-02).
 *
 * The number must be a real mobile line in an allowed country. A banned
 * number, or one already used by another account, gets an explanatory SMS
 * instead of a code; the app sees the same answer either way (BAN-06).
 */
import {
  allowedCountryCode,
  generateOtpCode,
  isTurkishMobile,
  LOGIN_ATTEMPTS_PER_HOUR,
  normalizePhone,
  OTP_LOCK_MINUTES,
  OTP_MAX_FAILED_ATTEMPTS,
  OTP_REQUESTS_PER_HOUR,
  OTP_TTL_MINUTES,
  phoneLineDecision,
  phoneOtpRequestSchema,
  phoneOtpVerifySchema,
  type PhoneOtpRequestResponse,
  type PhoneOtpVerifyResponse,
} from '../../../../packages/shared/src/index.ts';
import { identifierHash, ipHash, otpCodeHash } from '../crypto.ts';
import type { ServerEnv } from '../env.ts';
import { smsCode, smsUnavailable } from '../messages.ts';
import type { AuthAdmin, Db, LineLookup, RequestContext, Result, SmsSender } from '../types.ts';
import { fail, ok } from '../types.ts';
import { withinLimits } from './auth.ts';

export interface PhoneDeps {
  env: Pick<ServerEnv, 'hmacSecret' | 'supportEmail' | 'appEnv'>;
  db: Db;
  auth: AuthAdmin;
  sms: SmsSender | null;
  lookup: LineLookup;
  code?: () => string;
}

async function currentUser(deps: PhoneDeps, token: string | null) {
  return token ? await deps.auth.userFromToken(token) : null;
}

export async function requestPhoneOtp(
  deps: PhoneDeps,
  token: string | null,
  raw: unknown,
  ctx: RequestContext,
): Promise<Result<PhoneOtpRequestResponse>> {
  const user = await currentUser(deps, token);
  if (!user) return fail(401, 'not_authenticated');
  const parsed = phoneOtpRequestSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');
  const { deviceId, locale } = parsed.data;

  const state = await deps.db.profileState(user.id);
  if (!state || state.status !== 'onboarding') return fail(409, 'wrong_step');
  if (state.phoneVerified) return fail(409, 'wrong_step');

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return fail(400, 'invalid_phone');
  const allowed = await deps.db.flag<string[]>('phone.allowed_country_codes', ['90']);
  const cc = allowedCountryCode(phone, allowed);
  if (!cc) return fail(400, 'unsupported_country');
  if (cc === '90' && !isTurkishMobile(phone)) return fail(400, 'unsupported_line');
  if (!deps.sms) return fail(503, 'service_unavailable');

  const secret = deps.env.hmacSecret;
  const [phoneHash, deviceHash, ipKey] = await Promise.all([
    identifierHash(secret, 'phone', phone),
    identifierHash(secret, 'device', deviceId),
    ipHash(secret, ctx.ip),
  ]);
  const withinLimit = await withinLimits(
    deps.db,
    [
      `otp:phone:ip:${ipKey}`,
      `otp:phone:device:${deviceHash}`,
      `otp:phone:target:${phoneHash}`,
      `otp:phone:user:${user.id}`,
    ],
    OTP_REQUESTS_PER_HOUR,
  );
  if (!withinLimit) return fail(429, 'rate_limited');

  // Virtual numbers are rejected openly: the line type is not a secret (AUTH-04).
  const decision = phoneLineDecision(await deps.lookup.lineType(phone), deps.env.appEnv);
  if (decision === 'reject_voip') return fail(400, 'voip_number');
  if (decision === 'reject_unsupported') return fail(400, 'unsupported_line');

  const banned = await deps.db.banLookup([{ type: 'phone', hash: phoneHash }]);
  const owner = await deps.db.identifierOwner('phone', phoneHash);
  if (banned || (owner && owner !== user.id)) {
    await deps.sms.send(phone, smsUnavailable(locale, deps.env.supportEmail));
    return ok({ ok: true });
  }

  const code = (deps.code ?? generateOtpCode)();
  const codeHash = await otpCodeHash(secret, 'phone', phoneHash, code);
  const created = await deps.db.otpCreate(
    'phone',
    phoneHash,
    codeHash,
    OTP_TTL_MINUTES * 60,
    user.id,
  );
  if (created === 'locked') return fail(429, 'otp_locked');
  await deps.sms.send(phone, smsCode(locale, code));
  return ok({ ok: true });
}

export async function verifyPhoneOtp(
  deps: PhoneDeps,
  token: string | null,
  raw: unknown,
  ctx: RequestContext,
): Promise<Result<PhoneOtpVerifyResponse>> {
  const user = await currentUser(deps, token);
  if (!user) return fail(401, 'not_authenticated');
  const parsed = phoneOtpVerifySchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return fail(400, 'invalid_phone');

  const secret = deps.env.hmacSecret;
  const [phoneHash, deviceHash, ipKey] = await Promise.all([
    identifierHash(secret, 'phone', phone),
    identifierHash(secret, 'device', parsed.data.deviceId),
    ipHash(secret, ctx.ip),
  ]);
  const withinLimit = await withinLimits(
    deps.db,
    [`login:ip:${ipKey}`, `login:device:${deviceHash}`],
    LOGIN_ATTEMPTS_PER_HOUR,
  );
  if (!withinLimit) return fail(429, 'rate_limited');

  const codeHash = await otpCodeHash(secret, 'phone', phoneHash, parsed.data.code);
  const status = await deps.db.otpVerify(
    'phone',
    phoneHash,
    codeHash,
    OTP_MAX_FAILED_ATTEMPTS,
    OTP_LOCK_MINUTES * 60,
    user.id,
  );
  if (status === 'locked') return fail(429, 'otp_locked');
  if (status === 'expired') return fail(400, 'otp_expired');
  if (status !== 'ok') return fail(400, 'otp_invalid');

  // Banned between request and verify: proven ownership of a banned number is ban evasion.
  if (await deps.db.banLookup([{ type: 'phone', hash: phoneHash }])) {
    await deps.db.banAccount(user.id, 'ban_evasion', [{ type: 'phone', hash: phoneHash }]);
    return fail(403, 'registration_blocked');
  }
  if ((await deps.db.markPhoneVerified(user.id, phoneHash, phone.slice(-2))) === 'taken') {
    return fail(403, 'registration_blocked');
  }
  return ok({ ok: true });
}
