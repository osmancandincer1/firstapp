/** One-time codes for email and phone (APP.md §6.1 steps 3–4, §7.3, AUTH-02/03). */

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
/** Wrong codes in a row before the address/number is locked. */
export const OTP_MAX_FAILED_ATTEMPTS = 5;
export const OTP_LOCK_MINUTES = 15;
/** Code requests per hour, counted separately per IP, per device and per target. */
export const OTP_REQUESTS_PER_HOUR = 3;
/** Login (verify) attempts per hour per IP and per device (§7.3). */
export const LOGIN_ATTEMPTS_PER_HOUR = 10;

/**
 * Uniformly random numeric code. `randomValues` is injected so tests are
 * deterministic; production passes crypto.getRandomValues. Rejection sampling
 * avoids modulo bias.
 */
export function generateOtpCode(
  randomValues: (array: Uint32Array<ArrayBuffer>) => Uint32Array = (a) => crypto.getRandomValues(a),
): string {
  const range = 10 ** OTP_LENGTH;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  const buf = new Uint32Array(new ArrayBuffer(4));
  for (;;) {
    const v = randomValues(buf)[0]!;
    if (v < limit) return String(v % range).padStart(OTP_LENGTH, '0');
  }
}

export function isOtpFormat(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

/** Result of checking a code on the server (see srv_otp_verify in SQL). */
export type OtpVerifyStatus = 'ok' | 'invalid' | 'expired' | 'locked' | 'not_found';
