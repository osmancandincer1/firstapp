/**
 * Request/response contracts of the Phase 1 Edge Functions. The app and the
 * functions validate against the same schemas (§13.1).
 */
import { z } from 'zod';

import { CONSENT_TYPES } from './consents.ts';
import { OTP_LENGTH } from './otp.ts';
import {
  basicsSchema,
  CAPTION_MAX,
  detailsSchema,
  doorQuestionSchema,
  intentSchema,
  interestsSchema,
  locationSchema,
  PHOTOS_MAX,
  visibilitySchema,
} from './profile.ts';

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

/** profile-update: one section per request (§6.4). */
export const profileUpdateSchema = z.discriminatedUnion('section', [
  z.object({ section: z.literal('basics'), data: basicsSchema }),
  z.object({ section: z.literal('intent'), data: intentSchema }),
  z.object({ section: z.literal('door_question'), data: doorQuestionSchema }),
  z.object({ section: z.literal('interests'), data: interestsSchema }),
  z.object({
    section: z.literal('details'),
    data: detailsSchema,
    visibility: visibilitySchema.optional(),
  }),
  z.object({ section: z.literal('location'), data: locationSchema }),
]);
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type ProfileSection = ProfileUpdate['section'];

/** profile-photo actions (§6.4 photos, §7.2 pipeline). */
export const photoActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('upload_url') }),
  z.object({ action: z.literal('process'), photoId: z.uuid() }),
  z.object({ action: z.literal('reorder'), ids: z.array(z.uuid()).min(1).max(PHOTOS_MAX) }),
  z.object({
    action: z.literal('caption'),
    photoId: z.uuid(),
    caption: z.string().trim().max(CAPTION_MAX),
  }),
  z.object({ action: z.literal('delete'), photoId: z.uuid() }),
]);

/** profile-voice actions (§6.4 ses kartı). */
export const voiceActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('upload_url'), promptId: z.uuid() }),
  z.object({ action: z.literal('process'), voiceId: z.uuid() }),
  z.object({ action: z.literal('delete') }),
]);

export type UploadTarget = {
  ok: true;
  id: string;
  bucket: 'quarantine';
  path: string;
  token: string;
};
export type MediaResult = { ok: true; status: 'approved' | 'rejected' | 'review'; reason?: string };
export type ProfileUpdateResponse = { ok: true; pending?: boolean; status?: string };
export interface ProfileViewResponse {
  ok: true;
  /** Exactly what other people see (§6.4 Başkası nasıl görüyor?). */
  preview: Record<string, unknown> | null;
  /** Short-lived signed URLs of the user's own media, by id (owner only). */
  media: Record<string, string>;
}

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
  'text_blocked',
  'change_limited',
  'photo_limit',
  'not_found',
  'service_unavailable',
  'internal',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiError {
  error: ApiErrorCode;
  /** For text_blocked: which field and why (contact_info, link, profanity). */
  field?: string;
  reason?: string;
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
