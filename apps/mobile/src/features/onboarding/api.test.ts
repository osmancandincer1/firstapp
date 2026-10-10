import {
  birthDateSchema,
  consentsSchema,
  emailOtpRequestSchema,
  emailOtpVerifySchema,
  livenessCompleteSchema,
  phoneOtpRequestSchema,
  phoneOtpVerifySchema,
} from '@nokuzo/shared';

import * as api from './api';

const mockCall = jest.fn((..._args: unknown[]) => Promise.resolve({ ok: true, data: {} }));
jest.mock('@/lib/api', () => ({ callFunction: (...args: unknown[]) => mockCall(...args) }));
const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

const lastCall = () =>
  mockCall.mock.calls.at(-1) as unknown as [string, unknown, { auth?: boolean }?];

beforeEach(() => mockCall.mockClear());

/** Every request body must pass the same schema the Edge Function uses (§13.1). */
describe('client ↔ server contract', () => {
  it('email requests are unauthenticated and match the server schemas', async () => {
    await api.requestEmailCode('a@b.co');
    let [name, body, opts] = lastCall();
    expect([name, opts]).toEqual(['email-otp-request', { auth: false }]);
    expect(emailOtpRequestSchema.parse(body)).toEqual({
      email: 'a@b.co',
      deviceId: 'ios:ios-test-id',
      locale: 'tr',
    });

    await api.verifyEmailCode({ email: 'a@b.co', code: '123456' });
    [name, body, opts] = lastCall();
    expect([name, opts]).toEqual(['email-otp-verify', { auth: false }]);
    expect(emailOtpVerifySchema.parse(body)).toMatchObject({
      platform: 'ios',
      appVersion: '0.1.0',
    });
  });

  it('phone, birth date, consents and liveness requests match the server schemas', async () => {
    await api.requestPhoneCode('+905321234567');
    expect(lastCall()[0]).toBe('phone-otp-request');
    expect(phoneOtpRequestSchema.safeParse(lastCall()[1]).success).toBe(true);

    await api.verifyPhoneCode({ phone: '+905321234567', code: '000000' });
    expect(phoneOtpVerifySchema.safeParse(lastCall()[1]).success).toBe(true);

    await api.submitBirthDate('1990-05-07');
    expect(birthDateSchema.parse(lastCall()[1])).toEqual({ birthDate: '1990-05-07' });

    await api.submitConsents([{ type: 'terms', version: 'v1', granted: true }]);
    expect(consentsSchema.safeParse(lastCall()[1]).success).toBe(true);

    await api.startLiveness();
    expect(lastCall()[0]).toBe('liveness-start');
    await api.completeLiveness('session-12345');
    expect(livenessCompleteSchema.safeParse(lastCall()[1]).success).toBe(true);
  });

  it('loads legal documents through the public function', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ type: 'terms', version: 'v1', url: null, is_draft: false }],
      error: null,
    });
    expect(await api.fetchLegalDocuments()).toEqual({
      ok: true,
      data: [{ type: 'terms', version: 'v1', url: null, is_draft: false }],
    });
    expect(mockRpc).toHaveBeenCalledWith('current_legal_documents');
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    expect(await api.fetchLegalDocuments()).toEqual({ ok: false, error: 'network' });
  });
});
