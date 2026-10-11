import {
  checkAnswerText,
  copyPasteVerdict,
  countdown,
  currentTurDate,
  defaultPreferences,
  neighbourIntents,
  nextTurOpening,
  outgoingStatus,
  preferencesSchema,
  textSimilarity,
} from './tur.ts';

describe('Round timing (§4.1, TUR-02)', () => {
  it('opens at 21:00 Istanbul time (18:00 UTC)', () => {
    expect(nextTurOpening(new Date('2026-10-12T10:00:00Z')).toISOString()).toBe(
      '2026-10-12T18:00:00.000Z',
    );
    expect(nextTurOpening(new Date('2026-10-12T18:00:00Z')).toISOString()).toBe(
      '2026-10-13T18:00:00.000Z',
    );
    expect(nextTurOpening(new Date('2026-12-31T21:30:00Z')).toISOString()).toBe(
      '2027-01-01T18:00:00.000Z',
    );
  });

  it('uses the day of the last opening as the Round date', () => {
    expect(currentTurDate(new Date('2026-10-12T17:59:00Z'))).toBe('2026-10-11');
    expect(currentTurDate(new Date('2026-10-12T18:00:00Z'))).toBe('2026-10-12');
    expect(currentTurDate(new Date('2026-10-12T21:30:00Z'))).toBe('2026-10-12'); // 00:30 next day in Istanbul
    expect(currentTurDate(new Date('2027-01-01T00:30:00Z'))).toBe('2026-12-31');
  });

  it('counts down to the next opening', () => {
    expect(countdown(new Date('2026-10-12T15:30:00Z'), new Date('2026-10-12T18:00:00Z'))).toEqual({
      hours: 2,
      minutes: 30,
    });
    expect(countdown(new Date('2026-10-12T19:00:00Z'), new Date('2026-10-12T18:00:00Z'))).toEqual({
      hours: 0,
      minutes: 0,
    });
  });
});

describe('answer text (MAS-01)', () => {
  it.each([
    ['Simit-çay, kesinlikle!', 'ok'],
    ['kısa', 'too_short'],
    ['😂😂😂😂😂😂😂😂😂😂', 'emoji_only'],
    ['🙂 ok 🙂 🙂 🙂 🙂', 'emoji_only'],
    ['x'.repeat(201), 'too_long'],
    ['  Serpme kahvaltı  ', 'ok'],
  ])('%p → %s', (text, verdict) => {
    expect(checkAnswerText(text)).toBe(verdict);
  });
});

describe('copy-paste detection (MAS-03)', () => {
  const base = 'Serpme kahvaltı tabii ki, bol çay ile!';
  it('scores near-copies as similar and different text as not', () => {
    expect(textSimilarity(base, 'serpme kahvalti tabii ki bol cay ile')).toBeGreaterThan(0.9);
    expect(textSimilarity(base, 'Simit-çay, deniz kenarında')).toBeLessThan(0.5);
    expect(textSimilarity('', '')).toBe(0);
  });

  it('warns on the third similar answer in 24 hours and blocks the fourth', () => {
    expect(copyPasteVerdict(base, [])).toBe('ok');
    expect(copyPasteVerdict(base, [base])).toBe('ok');
    expect(copyPasteVerdict(base, [base, base.toUpperCase()])).toBe('warn');
    expect(copyPasteVerdict(base, [base, base, `${base}.`])).toBe('block');
    expect(copyPasteVerdict(base, ['başka', 'tamamen farklı bir cevap', 'yine farklı'])).toBe('ok');
  });
});

describe('what the sender sees (§4.2)', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const later = new Date('2026-10-20T12:00:00Z');
  const earlier = new Date('2026-10-01T12:00:00Z');
  it('never reveals a pass before the answer expires', () => {
    expect(outgoingStatus('passed', later, now)).toBe('waiting');
    expect(outgoingStatus('pending', later, now)).toBe('waiting');
    expect(outgoingStatus('passed', earlier, now)).toBe('dropped');
    expect(outgoingStatus('expired', later, now)).toBe('dropped');
    expect(outgoingStatus('reciprocated', earlier, now)).toBe('reciprocated');
  });
});

describe('preferences (§6.6)', () => {
  it('defaults to own age ±5 with at least a 4-year span', () => {
    expect(defaultPreferences(30, 'long_term')).toEqual({
      ageMin: 25,
      ageMax: 35,
      distanceKm: null,
      intents: ['long_term', 'serious_unhurried'],
      voiceOnly: false,
    });
    expect(defaultPreferences(18, 'unsure')).toMatchObject({
      ageMin: 18,
      ageMax: 23,
      intents: ['unsure', 'serious_unhurried', 'friendship'],
    });
    expect(defaultPreferences(99, 'friendship')).toMatchObject({ ageMin: 94, ageMax: 99 });
  });

  it('knows neighbouring intents', () => {
    expect(neighbourIntents('serious_unhurried')).toEqual(['long_term', 'unsure']);
    expect(neighbourIntents('friendship')).toEqual(['unsure']);
  });

  it('validates ranges, distances and intents', () => {
    const ok = { ageMin: 25, ageMax: 35, distanceKm: 25, intents: ['long_term'], voiceOnly: false };
    expect(preferencesSchema.safeParse(ok).success).toBe(true);
    expect(preferencesSchema.safeParse({ ...ok, distanceKm: null }).success).toBe(true);
    expect(preferencesSchema.safeParse({ ...ok, ageMax: 27 }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...ok, distanceKm: 15 }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...ok, intents: [] }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...ok, ageMin: 17 }).success).toBe(false);
  });
});
