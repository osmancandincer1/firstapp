import type {
  ConsentChoice,
  ConsentType,
  EmailOtpVerifyResponse,
  LivenessCompleteResponse,
  LivenessStartResponse,
} from '@nokuzo/shared';

import { callFunction, type ApiResult } from '@/lib/api';
import { appVersion, getDeviceId, platform } from '@/lib/device';
import { supabase } from '@/lib/supabase';
import i18n from '@/i18n';

const locale = () => (i18n.language === 'en' ? 'en' : 'tr');

export async function requestEmailCode(email: string) {
  return callFunction<{ ok: true }>(
    'email-otp-request',
    { email, deviceId: await getDeviceId(), locale: locale() },
    { auth: false },
  );
}

export async function verifyEmailCode(input: { email: string; code: string }) {
  return callFunction<EmailOtpVerifyResponse>(
    'email-otp-verify',
    { ...input, deviceId: await getDeviceId(), platform, appVersion },
    { auth: false },
  );
}

export async function requestPhoneCode(phone: string) {
  return callFunction<{ ok: true }>('phone-otp-request', {
    phone,
    deviceId: await getDeviceId(),
    locale: locale(),
  });
}

export async function verifyPhoneCode(input: { phone: string; code: string }) {
  return callFunction<{ ok: true }>('phone-otp-verify', {
    ...input,
    deviceId: await getDeviceId(),
  });
}

export function submitBirthDate(birthDate: string) {
  return callFunction<{ ok: true }>('onboarding-birth-date', { birthDate });
}

export function submitConsents(consents: ConsentChoice[]) {
  return callFunction<{ ok: true }>('onboarding-consents', { consents });
}

export function startLiveness() {
  return callFunction<LivenessStartResponse>('liveness-start', {});
}

export function completeLiveness(sessionId: string) {
  return callFunction<LivenessCompleteResponse>('liveness-complete', { sessionId });
}

export interface LegalDocument {
  type: ConsentType;
  version: string;
  url: string | null;
  is_draft: boolean;
}

/** Documents currently in force; drafts appear only where the server allows them (local). */
export async function fetchLegalDocuments(): Promise<ApiResult<LegalDocument[]>> {
  if (!supabase) return { ok: false, error: 'not_configured' };
  const { data, error } = await supabase.rpc('current_legal_documents');
  if (error) return { ok: false, error: 'network' };
  return { ok: true, data: (data ?? []) as LegalDocument[] };
}
