import {
  allowedCountryCode,
  canonicalEmail,
  emailDomain,
  isDisposableDomain,
  isTurkishMobile,
  normalizeEmail,
  normalizePhone,
  phoneLineDecision,
} from './identity.ts';

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Ece.Yilmaz@Example.COM ')).toBe('ece.yilmaz@example.com');
  });

  it.each(['', 'ece', 'ece@', '@x.com', 'ece@x', 'a b@x.com', `${'a'.repeat(250)}@x.com`])(
    'rejects malformed %p',
    (raw) => expect(normalizeEmail(raw)).toBeNull(),
  );
});

describe('canonicalEmail (BAN-01)', () => {
  it.each([
    'ece.yilmaz@gmail.com',
    'EceYilmaz@gmail.com',
    ' e.c.e.yilmaz@gmail.com ',
    'eceyilmaz+dating@gmail.com',
    'Ece.Yilmaz+x+y@googlemail.com',
  ])('maps the Gmail variant %p to one mailbox', (raw) => {
    expect(canonicalEmail(raw)).toBe('eceyilmaz@gmail.com');
  });

  it('keeps dots and plus tags for other providers', () => {
    expect(canonicalEmail('Ece.Yilmaz+x@Outlook.com')).toBe('ece.yilmaz+x@outlook.com');
  });

  it('rejects malformed input and empty Gmail local parts', () => {
    expect(canonicalEmail('nope')).toBeNull();
    expect(canonicalEmail('+tag@gmail.com')).toBeNull();
  });
});

describe('isDisposableDomain (AUTH-04)', () => {
  const list = new Set(['mailinator.com', 'tempmail.dev']);

  it('matches listed domains and their subdomains', () => {
    expect(isDisposableDomain(emailDomain('x@mailinator.com'), list)).toBe(true);
    expect(isDisposableDomain('inbox.Mailinator.com', list)).toBe(true);
  });

  it('does not match other domains or bare TLDs', () => {
    expect(isDisposableDomain('gmail.com', list)).toBe(false);
    expect(isDisposableDomain('notmailinator.com', list)).toBe(false);
    expect(isDisposableDomain('com', new Set(['com']))).toBe(false);
  });
});

describe('normalizePhone (BAN-02)', () => {
  it.each([
    '+90 532 123 45 67',
    '0532 123 45 67',
    '(0532) 123-45-67',
    '5321234567',
    '905321234567',
    '0090 532 123 4567',
    '+905321234567',
  ])('writes %p as E.164', (raw) => {
    expect(normalizePhone(raw)).toBe('+905321234567');
  });

  it('keeps other country codes given with + or 00', () => {
    expect(normalizePhone('+44 7911 123456')).toBe('+447911123456');
    expect(normalizePhone('0044 7911 123456')).toBe('+447911123456');
  });

  it.each(['', 'abc', '+90 532', '+90 532 123 45 678', '12+34', '++905321234567', '+0123456789'])(
    'rejects %p',
    (raw) => expect(normalizePhone(raw)).toBeNull(),
  );
});

describe('country and line policy', () => {
  it('finds allowed country codes, longest first', () => {
    expect(allowedCountryCode('+905321234567', ['90'])).toBe('90');
    expect(allowedCountryCode('+447911123456', ['90'])).toBeNull();
    expect(allowedCountryCode('+35312345678', ['3', '353'])).toBe('353');
  });

  it('recognizes Turkish mobile numbers', () => {
    expect(isTurkishMobile('+905321234567')).toBe(true);
    expect(isTurkishMobile('+902121234567')).toBe(false);
  });

  it('accepts only mobile lines; unknown passes only locally (AUTH-04)', () => {
    expect(phoneLineDecision('mobile', 'production')).toBe('accept');
    expect(phoneLineDecision('voip', 'local')).toBe('reject_voip');
    expect(phoneLineDecision('landline', 'local')).toBe('reject_unsupported');
    expect(phoneLineDecision('other', 'staging')).toBe('reject_unsupported');
    expect(phoneLineDecision('unknown', 'local')).toBe('accept');
    expect(phoneLineDecision('unknown', 'staging')).toBe('reject_unsupported');
    expect(phoneLineDecision('unknown', 'production')).toBe('reject_unsupported');
  });
});
