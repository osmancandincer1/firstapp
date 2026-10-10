/**
 * Request/response contracts of the Phase 1 Edge Functions. The app and the
 * functions validate against the same schemas (§13.1).
 */
import { z } from 'zod';

import { CONSENT_TYPES } from './consents.ts';
import { OTP_LENGTH } from './otp.ts';

/** Install-scoped device identifier sent by the app; the server stores only its HMAC. */
const deviceId = z.string().trim().min(8).max(200);
const platform = z.enum(['ios', 'android', 'web']);
const appVersion = z.string().max(40).optional();

export const emailOtpRequestSchema = z.object({
  email: z.string().trim().min(3).max(254),
  deviceId,
  locale: z.enum(['tr', 'en']).default('tr'),
});

export const emailOtpVerifySchema = z.object({
  email: z.string().trim().min(3).max(254),
  code: z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`)),
  deviceId,
  platform,
  appVersion,
});

/** Called after any sign-in (incl. Apple/Google) to register the device and run ban checks. */
export const sessionRegisterSchema = z.object({ deviceId, platform, appVersion });

export const phoneOtpRequestSchema = z.object({
  phone: z.string().trim().min(6).max(32),
  deviceId,
  locale: z.enum(['tr', 'en']).default('tr'),
});

export const phoneOtpVerifySchema = z.object({
  phone: z.string().trim().min(6).max(32),
  code: z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`)),
  deviceId,
});

export const birthDateSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const consentsSchema = z.object({
  consents: z
    .array(
      z.object({
        type: z.enum(CONSENT_TYPES),
        version: z.string().min(1).max(40),
        granted: z.boolean(),
      }),
    )
    .min(1)
    .max(CONSENT_TYPES.length),
});

export const livenessCompleteSchema = z.object({
  sessionId: z.string().min(8).max(200),
});

/**
 * Error codes returned by the functions. Messages are localized in the app.
 * `registration_blocked` is deliberately generic: it never says whether an
 * address or number is banned (§7.5, BAN-06).
 */
export const API_ERROR_CODES = [
  'invalid_input',
  'not_authenticated',
  'rate_limited',
  'invalid_email',
  'disposable_email',
  'invalid_phone',
  'unsupported_country',
  'voip_number',
  'unsupported_line',
  'otp_invalid',
  'otp_expired',
  'otp_locked',
  'underage',
  'age_locked',
  'birth_date_already_set',
  'consents_incomplete',
  'consents_outdated',
  'wrong_step',
  'liveness_cooldown',
  'liveness_failed',
  'registration_blocked',
  'service_unavailable',
  'internal',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiError {
  error: ApiErrorCode;
  /** ISO time when the client may retry (rate limits, locks, cooldowns). */
  retryAt?: string;
}

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

export type EmailOtpRequestResponse = { ok: true };
export type EmailOtpVerifyResponse = { ok: true; session: SessionTokens };
export type PhoneOtpRequestResponse = { ok: true };
export type PhoneOtpVerifyResponse = { ok: true };
export type LivenessStartResponse = { ok: true; sessionId: string; provider: 'aws' | 'mock' };
export type LivenessCompleteResponse = {
  ok: true;
  outcome: 'passed' | 'needs_id' | 'failed' | 'blocked';
  retryAt?: string;
};
