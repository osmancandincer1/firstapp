import {
  birthDateSchema,
  consentsSchema,
  emailOtpRequestSchema,
  emailOtpVerifySchema,
  livenessCompleteSchema,
  phoneOtpRequestSchema,
  phoneOtpVerifySchema,
  sessionRegisterSchema,
} from './api.ts';

const deviceId = 'install-1234-abcd';

describe('function request schemas', () => {
  it('accept well-formed requests and default the locale', () => {
    expect(emailOtpRequestSchema.parse({ email: 'a@b.co', deviceId }).locale).toBe('tr');
    expect(
      phoneOtpRequestSchema.parse({ phone: '0532 123 45 67', deviceId, locale: 'en' }).locale,
    ).toBe('en');
    expect(
      emailOtpVerifySchema.safeParse({ email: 'a@b.co', code: '123456', deviceId, platform: 'ios' })
        .success,
    ).toBe(true);
    expect(
      sessionRegisterSchema.safeParse({ deviceId, platform: 'android', appVersion: '0.1.0' })
        .success,
    ).toBe(true);
    expect(
      phoneOtpVerifySchema.safeParse({ phone: '+905321234567', code: '000001', deviceId }).success,
    ).toBe(true);
    expect(birthDateSchema.safeParse({ birthDate: '2000-01-31' }).success).toBe(true);
    expect(livenessCompleteSchema.safeParse({ sessionId: 'session-123' }).success).toBe(true);
  });

  it('reject malformed codes, devices, dates and consents', () => {
    expect(
      emailOtpVerifySchema.safeParse({ email: 'a@b.co', code: '12345', deviceId }).success,
    ).toBe(false);
    expect(emailOtpRequestSchema.safeParse({ email: 'a@b.co', deviceId: 'x' }).success).toBe(false);
    expect(birthDateSchema.safeParse({ birthDate: '31.01.2000' }).success).toBe(false);
    expect(consentsSchema.safeParse({ consents: [] }).success).toBe(false);
    expect(
      consentsSchema.safeParse({ consents: [{ type: 'unknown', version: 'v1', granted: true }] })
        .success,
    ).toBe(false);
  });
});
