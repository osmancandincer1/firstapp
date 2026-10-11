import { ageOn, calendarDateIn, checkBirthDate, parseIsoDate } from './age.ts';
import {
  CONSENT_TYPES,
  initialConsentState,
  validateConsents,
  type ConsentChoice,
  type ConsentType,
} from './consents.ts';
import {
  countsAsFailure,
  decideLiveness,
  livenessRetry,
  type LivenessEvidence,
} from './liveness.ts';
import { nextOnboardingStep, onboardingProgress, type OnboardingState } from './onboarding.ts';
import { generateOtpCode, isOtpFormat } from './otp.ts';

describe('age gate (AUTH-01)', () => {
  it('rejects impossible dates', () => {
    expect(parseIsoDate('2023-02-30')).toBeNull();
    expect(parseIsoDate('2023-13-01')).toBeNull();
    expect(parseIsoDate('23-01-01')).toBeNull();
    expect(parseIsoDate('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 });
  });

  it('counts whole years', () => {
    expect(ageOn('2008-10-11', '2026-10-11')).toBe(18);
    expect(ageOn('2008-10-12', '2026-10-11')).toBe(17);
    expect(ageOn('bad', '2026-10-11')).toBeNull();
  });

  it('ages leap-day birthdays on 1 March in non-leap years', () => {
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
  });

  it('classifies birth dates', () => {
    expect(checkBirthDate('2000-01-01', '2026-10-11')).toBe('ok');
    expect(checkBirthDate('2008-10-11', '2026-10-11')).toBe('ok');
    expect(checkBirthDate('2008-10-12', '2026-10-11')).toBe('underage');
    expect(checkBirthDate('2027-01-01', '2026-10-11')).toBe('future');
    expect(checkBirthDate('1900-01-01', '2026-10-11')).toBe('implausible');
    expect(checkBirthDate('2000-02-30', '2026-10-11')).toBe('invalid');
  });

  it('uses the Istanbul calendar day', () => {
    // 22:30 UTC on 10 Oct is already 11 Oct in Istanbul (UTC+3).
    expect(calendarDateIn(new Date('2026-10-10T22:30:00Z'))).toBe('2026-10-11');
    expect(calendarDateIn(new Date('2026-10-10T20:30:00Z'))).toBe('2026-10-10');
  });
});

describe('consents (AUTH-07)', () => {
  const versions = Object.fromEntries(CONSENT_TYPES.map((t) => [t, 'v1'])) as Record<
    ConsentType,
    string
  >;
  const all = (granted: (t: ConsentType) => boolean): ConsentChoice[] =>
    CONSENT_TYPES.map((type) => ({ type, version: 'v1', granted: granted(type) }));

  it('starts with nothing pre-selected', () => {
    expect(Object.values(initialConsentState()).every((v) => v === false)).toBe(true);
  });

  it('accepts all required consents with marketing either way', () => {
    expect(
      validateConsents(
        all(() => true),
        versions,
      ),
    ).toEqual({ ok: true });
    expect(
      validateConsents(
        all((t) => t !== 'marketing'),
        versions,
      ),
    ).toEqual({ ok: true });
  });

  it('rejects a missing or declined required consent', () => {
    expect(
      validateConsents(
        all((t) => t !== 'biometric'),
        versions,
      ),
    ).toEqual({
      ok: false,
      reason: 'missing_required',
      types: ['biometric'],
    });
    const withoutMarketing = all(() => true).filter((c) => c.type !== 'marketing');
    expect(validateConsents(withoutMarketing, versions)).toMatchObject({
      reason: 'missing_required',
      types: ['marketing'],
    });
  });

  it('rejects outdated versions and duplicates', () => {
    const stale = all(() => true).map((c) => (c.type === 'terms' ? { ...c, version: 'v0' } : c));
    expect(validateConsents(stale, versions)).toMatchObject({
      reason: 'version_mismatch',
      types: ['terms'],
    });
    const dup = [...all(() => true), { type: 'terms' as const, version: 'v1', granted: true }];
    expect(validateConsents(dup, versions)).toMatchObject({
      reason: 'duplicate',
      types: ['terms'],
    });
  });
});

describe('one-time codes (AUTH-02)', () => {
  it('produces six digits, zero-padded', () => {
    expect(generateOtpCode(() => new Uint32Array([42]))).toBe('000042');
    expect(isOtpFormat(generateOtpCode())).toBe(true);
  });

  it('rejects biased values instead of wrapping them', () => {
    const values = [0xffff_ffff, 123_456];
    const code = generateOtpCode((a) => {
      a[0] = values.shift()!;
      return a;
    });
    expect(code).toBe('123456');
  });

  it('validates the format', () => {
    expect(isOtpFormat('12345')).toBe(false);
    expect(isOtpFormat('12345a')).toBe(false);
  });
});

describe('liveness decision (VER-01/03/04, BAN-03)', () => {
  const base: LivenessEvidence = { confidence: 95, ageLow: 25, matches: [] };
  const t = { minConfidence: 90 };

  it('passes a live adult with no other face match', () => {
    expect(decideLiveness(base, t)).toBe('passed');
    expect(decideLiveness({ ...base, matches: ['self'] }, t)).toBe('passed');
  });

  it('fails below the confidence threshold before trusting face matches', () => {
    expect(decideLiveness({ ...base, confidence: 89.9, matches: ['banned'] }, t)).toBe(
      'failed_low_confidence',
    );
    expect(decideLiveness({ ...base, confidence: Number.NaN }, t)).toBe('failed_low_confidence');
  });

  it('rejects banned faces ahead of duplicates', () => {
    expect(decideLiveness({ ...base, matches: ['active_other', 'banned'] }, t)).toBe('banned_face');
    expect(decideLiveness({ ...base, matches: ['active_other'] }, t)).toBe('duplicate_face');
  });

  it('asks for an ID when the age estimate is under 21 or missing', () => {
    expect(decideLiveness({ ...base, ageLow: 20 }, t)).toBe('needs_id');
    expect(decideLiveness({ ...base, ageLow: null }, t)).toBe('needs_id');
    expect(decideLiveness({ ...base, ageLow: 21 }, t)).toBe('passed');
  });

  it('counts only low-confidence results as strikes', () => {
    expect(countsAsFailure('failed_low_confidence')).toBe(true);
    expect(countsAsFailure('duplicate_face')).toBe(false);
  });

  it('blocks for 24 hours after three failures', () => {
    const now = new Date('2026-10-11T12:00:00Z');
    const h = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000);
    expect(livenessRetry([h(1), h(2)], now)).toEqual({ allowed: true });
    expect(livenessRetry([h(1), h(2), h(30)], now)).toEqual({ allowed: true });
    expect(livenessRetry([h(3), h(1), h(2)], now)).toEqual({
      allowed: false,
      retryAt: new Date(h(3).getTime() + 24 * 3_600_000),
    });
  });
});

describe('onboarding order (AUTH-06)', () => {
  const fresh: OnboardingState = {
    status: 'onboarding',
    phoneVerified: false,
    birthDate: null,
    consentsComplete: false,
    livenessVerified: false,
    idRequired: false,
  };

  it('walks every sign-up step in the §6.1 order', () => {
    const order: [Partial<OnboardingState>, string][] = [
      [{}, 'phone'],
      [{ phoneVerified: true }, 'birth_date'],
      [{ birthDate: '2000-01-01' }, 'consents'],
      [{ consentsComplete: true }, 'basics'],
      [{ basicsComplete: true }, 'liveness'],
      [{ livenessVerified: true }, 'photos'],
      [{ photosComplete: true }, 'intent'],
      [{ intentComplete: true }, 'door_question'],
      [{ doorQuestionComplete: true }, 'interests'],
      [{ interestsComplete: true }, 'location'],
      [{ locationComplete: true }, 'done'],
    ];
    let state: OnboardingState = fresh;
    for (const [change, step] of order) {
      state = { ...state, ...change };
      expect(nextOnboardingStep(state)).toEqual({ kind: 'step', step });
    }
  });

  it('asks for an ID before anything after liveness', () => {
    const s = {
      ...fresh,
      phoneVerified: true,
      birthDate: '2000-01-01',
      consentsComplete: true,
      basicsComplete: true,
    };
    expect(nextOnboardingStep({ ...s, idRequired: true })).toEqual({
      kind: 'step',
      step: 'needs_id',
    });
  });

  it('sends active accounts home, unless the main photo changed (VER-07)', () => {
    expect(nextOnboardingStep({ ...fresh, status: 'active' })).toEqual({
      kind: 'step',
      step: 'done',
    });
    expect(nextOnboardingStep({ ...fresh, status: 'active', reverifyRequired: true })).toEqual({
      kind: 'step',
      step: 'reverify',
    });
  });

  it.each(['banned', 'suspended', 'deleted'] as const)('blocks %s accounts', (status) => {
    expect(nextOnboardingStep({ ...fresh, status })).toEqual({ kind: 'blocked', status });
  });

  it('reports progress', () => {
    expect(onboardingProgress('phone')).toEqual({ index: 1, total: 10 });
    expect(onboardingProgress('needs_id')).toEqual({ index: 5, total: 10 });
    expect(onboardingProgress('reverify')).toEqual({ index: 5, total: 10 });
    expect(onboardingProgress('location')).toEqual({ index: 10, total: 10 });
    expect(onboardingProgress('done')).toEqual({ index: 10, total: 10 });
  });
});
