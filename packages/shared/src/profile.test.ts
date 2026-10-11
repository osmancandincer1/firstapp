import {
  basicsSchema,
  canChange,
  detailsSchema,
  doorQuestionSchema,
  intentSchema,
  interestsSchema,
  locationSchema,
  nameSchema,
  roundToGrid,
  visibilitySchema,
} from './profile.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('name (PRO-09)', () => {
  it.each(['Ece', 'Şükrü', 'Ayşe Nur', "D'Angelo", 'Jean-Luc', 'İlkay'])('accepts %p', (n) => {
    expect(nameSchema.safeParse(n).success).toBe(true);
  });

  it('trims and collapses spaces', () => {
    expect(nameSchema.parse('  Ayşe   Nur ')).toBe('Ayşe Nur');
  });

  it.each(['E', 'Ece123', 'ece_', 'x'.repeat(21), '😀Ece', '-Ece', "Ece'"])('rejects %p', (n) => {
    expect(nameSchema.safeParse(n).success).toBe(false);
  });
});

describe('basics', () => {
  const ok = { name: 'Ece', gender: 'woman', showGender: true, seeking: ['men'] };

  it('accepts a complete answer', () => {
    expect(basicsSchema.safeParse(ok).success).toBe(true);
    expect(basicsSchema.safeParse({ ...ok, seeking: ['women', 'men', 'nonbinary'] }).success).toBe(
      true,
    );
  });

  it('needs a description for self-described gender', () => {
    expect(basicsSchema.safeParse({ ...ok, gender: 'self_described' }).success).toBe(false);
    expect(
      basicsSchema.safeParse({ ...ok, gender: 'self_described', genderCustom: 'Akışkan' }).success,
    ).toBe(true);
  });

  it('refuses empty or repeated choices', () => {
    expect(basicsSchema.safeParse({ ...ok, seeking: [] }).success).toBe(false);
    expect(basicsSchema.safeParse({ ...ok, seeking: ['men', 'men'] }).success).toBe(false);
  });
});

describe('intent card', () => {
  const ok = { intent: 'long_term', tempo: 'chat_first', dealbreakers: [] };

  it('accepts up to three dealbreakers with valid values', () => {
    expect(intentSchema.safeParse(ok).success).toBe(true);
    const three = [
      { field: 'smoking', accepted: ['never'] },
      { field: 'pets', accepted: ['cat', 'dog'] },
      { field: 'wants_children', accepted: ['want', 'maybe'] },
    ];
    expect(intentSchema.safeParse({ ...ok, dealbreakers: three }).success).toBe(true);
    expect(
      intentSchema.safeParse({
        ...ok,
        dealbreakers: [...three, { field: 'diet', accepted: ['vegan'] }],
      }).success,
    ).toBe(false);
  });

  it('refuses unknown values and duplicate fields', () => {
    expect(
      intentSchema.safeParse({
        ...ok,
        dealbreakers: [{ field: 'smoking', accepted: ['sometimes'] }],
      }).success,
    ).toBe(false);
    expect(
      intentSchema.safeParse({
        ...ok,
        dealbreakers: [
          { field: 'diet', accepted: ['vegan'] },
          { field: 'diet', accepted: ['vegetarian'] },
        ],
      }).success,
    ).toBe(false);
    expect(intentSchema.safeParse({ ...ok, intent: 'fling' }).success).toBe(false);
  });
});

describe('door question, interests and location (PRO-09)', () => {
  it('takes a preset or an 8–90 character question', () => {
    expect(doorQuestionSchema.safeParse({ presetId: uuid(1) }).success).toBe(true);
    expect(
      doorQuestionSchema.safeParse({ customText: 'Beni hangi konsere götürürdün?' }).success,
    ).toBe(true);
    expect(doorQuestionSchema.safeParse({ customText: 'Naber?' }).success).toBe(false);
    expect(doorQuestionSchema.safeParse({ customText: 'x'.repeat(91) }).success).toBe(false);
  });

  it('needs 5–10 distinct interests', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => uuid(i));
    expect(interestsSchema.safeParse({ ids: ids(4) }).success).toBe(false);
    expect(interestsSchema.safeParse({ ids: ids(5) }).success).toBe(true);
    expect(interestsSchema.safeParse({ ids: ids(10) }).success).toBe(true);
    expect(interestsSchema.safeParse({ ids: ids(11) }).success).toBe(false);
    expect(interestsSchema.safeParse({ ids: [...ids(4), uuid(0)] }).success).toBe(false);
  });

  it('validates the city and rounds coordinates to ~1 km (§13.6)', () => {
    expect(locationSchema.safeParse({ cityId: 34 }).success).toBe(true);
    expect(locationSchema.safeParse({ cityId: 82 }).success).toBe(false);
    expect(roundToGrid({ lat: 41.008237, lng: 28.978358 })).toEqual({ lat: 41.01, lng: 28.98 });
  });
});

describe('optional details', () => {
  it('accepts partial updates and clearing with null', () => {
    expect(
      detailsSchema.safeParse({ height: 172, smoking: 'never', music: ['Sezen Aksu'] }).success,
    ).toBe(true);
    expect(detailsSchema.safeParse({ height: null, about: null }).success).toBe(true);
  });

  it('enforces ranges and list sizes', () => {
    expect(detailsSchema.safeParse({ height: 139 }).success).toBe(false);
    expect(detailsSchema.safeParse({ about: 'x'.repeat(301) }).success).toBe(false);
    expect(detailsSchema.safeParse({ films: ['a', 'b', 'c', 'd'] }).success).toBe(false);
    expect(detailsSchema.safeParse({ religion: 'x' }).success).toBe(true); // unknown keys are dropped…
    expect(detailsSchema.parse({ religion: 'x' } as never)).toEqual({}); // …never stored (§6.4)
  });

  it('has a visibility switch per detail only', () => {
    expect(visibilitySchema.safeParse({ height: false, smoking: true }).success).toBe(true);
    expect(visibilitySchema.safeParse({ birth_date: true }).success).toBe(false);
  });
});

describe('change limits', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  it('allows a change after the waiting period only', () => {
    expect(canChange(null, now, 30)).toBe(true);
    expect(canChange(new Date('2026-09-11T12:00:00Z'), now, 30)).toBe(true);
    expect(canChange(new Date('2026-09-12T12:00:00Z'), now, 30)).toBe(false);
  });
});
