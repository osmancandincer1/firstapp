/**
 * Email and phone normalization (APP.md §6.3). Pure functions shared by the
 * app (input feedback) and Edge Functions (the authority). Imports use explicit
 * .ts extensions so Deno can load this file unchanged.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/** Address used for delivery and login: trimmed and lower-cased. Null when malformed. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

/**
 * Canonical mailbox used for identity and ban checks: for Gmail, dots and
 * "+tag" in the local part are removed and googlemail.com becomes gmail.com,
 * because they all reach the same inbox (BAN-01).
 */
export function canonicalEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (!email) return null;
  const at = email.lastIndexOf('@');
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.split('+')[0]!.replaceAll('.', '');
    domain = 'gmail.com';
    if (!local) return null;
  }
  return `${local}@${domain}`;
}

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

/**
 * True when the domain or any parent domain is on the disposable list
 * (e.g. "x.mailinator.com" matches "mailinator.com").
 */
export function isDisposableDomain(domain: string, disposable: ReadonlySet<string>): boolean {
  const parts = domain.toLowerCase().split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (disposable.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

/**
 * Converts user input to E.164 ("+905321234567"). Accepts spaces, dashes,
 * parentheses, a leading "00" or a national trunk "0". Numbers without a
 * country code are read as `defaultCountryCode`. Returns null when the result
 * is not a plausible E.164 number.
 */
export function normalizePhone(raw: string, defaultCountryCode = '90'): string | null {
  const trimmed = raw.trim();
  if (!/^[+\d\s().-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.indexOf('+') > 0 || (digits.match(/\+/g) ?? []).length > 1) return null;

  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = defaultCountryCode + digits.slice(1);
  else if (!digits.startsWith(defaultCountryCode) || digits.length <= 10) {
    digits = defaultCountryCode + digits;
  }

  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  const e164 = `+${digits}`;
  // Turkish numbers have exactly 10 national digits.
  if (e164.startsWith('+90') && digits.length !== 12) return null;
  return e164;
}

/** Country calling code of an E.164 number, if it is one of `allowed` (e.g. ["90"]). */
export function allowedCountryCode(e164: string, allowed: readonly string[]): string | null {
  const digits = e164.slice(1);
  return (
    [...allowed].sort((a, b) => b.length - a.length).find((cc) => digits.startsWith(cc)) ?? null
  );
}

/** Turkish mobile numbers start with 5 after the country code. */
export function isTurkishMobile(e164: string): boolean {
  return /^\+905\d{9}$/.test(e164);
}

/** Line types reported by a number-lookup provider, reduced to what policy needs. */
export type LineType = 'mobile' | 'landline' | 'voip' | 'other' | 'unknown';

/**
 * Phone acceptance policy (§6.1 step 4, §7.3): only real mobile lines.
 * When the lookup could not classify the number, only the local environment
 * lets it through; staging and production fail closed (§0.9).
 */
export function phoneLineDecision(
  lineType: LineType,
  appEnv: 'local' | 'staging' | 'production',
): 'accept' | 'reject_voip' | 'reject_unsupported' {
  if (lineType === 'mobile') return 'accept';
  if (lineType === 'voip') return 'reject_voip';
  if (lineType === 'unknown' && appEnv === 'local') return 'accept';
  return 'reject_unsupported';
}
