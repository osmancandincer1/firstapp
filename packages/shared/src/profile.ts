/**
 * Profile fields and limits (APP.md §6.4). Values are stable keys; the app
 * localizes them. Special-category data (religion, politics, ethnicity,
 * health, income) is deliberately absent and cannot be added as a field.
 */
import { z } from 'zod';

export const NAME_MIN = 2;
export const NAME_MAX = 20;
export const NAME_CHANGE_DAYS = 30;
export const GENDER_CUSTOM_MAX = 30;
export const ABOUT_MAX = 300;
export const CAPTION_MAX = 40;
export const SHORT_TEXT_MAX = 40;
export const DOOR_QUESTION_MIN = 8;
export const DOOR_QUESTION_MAX = 90;
export const DOOR_QUESTION_CHANGE_DAYS = 7;
export const INTERESTS_MIN = 5;
export const INTERESTS_MAX = 10;
export const PHOTOS_MIN = 3;
export const PHOTOS_MAX = 6;
export const DEALBREAKERS_MAX = 3;
export const FAVORITES_MAX = 3;
export const HEIGHT_MIN = 140;
export const HEIGHT_MAX = 220;
export const VOICE_MIN_SECONDS = 5;
export const VOICE_MAX_SECONDS = 20;

export const GENDERS = ['woman', 'man', 'nonbinary', 'self_described'] as const;
export const SEEKING = ['women', 'men', 'nonbinary'] as const;
export const INTENTS = ['long_term', 'serious_unhurried', 'unsure', 'friendship'] as const;
export const TEMPOS = ['meet_soon', 'chat_first', 'slow'] as const;

/** Optional lifestyle fields with fixed choices (§6.4 İsteğe bağlı alanlar). */
export const DETAIL_CHOICES = {
  education: ['high_school', 'associate', 'bachelor', 'master', 'doctorate', 'prefer_not'],
  smoking: ['never', 'social', 'regularly', 'trying_to_quit'],
  alcohol: ['never', 'rarely', 'socially', 'often'],
  children: ['has', 'has_not'],
  wants_children: ['want', 'dont_want', 'not_sure', 'maybe'],
  sports: ['never', 'sometimes', 'regularly'],
  diet: ['everything', 'vegetarian', 'vegan', 'other'],
  sleep: ['morning', 'night_owl', 'varies'],
  zodiac: [
    'aries',
    'taurus',
    'gemini',
    'cancer',
    'leo',
    'virgo',
    'libra',
    'scorpio',
    'sagittarius',
    'capricorn',
    'aquarius',
    'pisces',
  ],
  first_date: ['coffee', 'walk', 'dinner', 'art_music', 'any'],
} as const;
export const PETS = ['cat', 'dog', 'other', 'none_but_love', 'allergic'] as const;
export const LANGUAGES = [
  'tr',
  'en',
  'de',
  'fr',
  'es',
  'it',
  'ru',
  'ar',
  'ku',
  'fa',
  'az',
  'el',
  'nl',
  'pt',
  'ja',
  'zh',
] as const;

/** Lifestyle fields that can be made a "must" in the intent card (§6.4 Olmazsa olmazlarım). */
export const DEALBREAKER_FIELDS = [
  'smoking',
  'alcohol',
  'children',
  'wants_children',
  'pets',
  'sports',
  'diet',
] as const;
export type DealbreakerField = (typeof DEALBREAKER_FIELDS)[number];

const choice = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

/** Letters (any script), spaces, hyphen and apostrophe; no digits or symbols. */
const NAME_RE = /^[\p{L}][\p{L}\p{M}' -]*[\p{L}\p{M}]$/u;

export const nameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(NAME_MIN).max(NAME_MAX).regex(NAME_RE));

export const basicsSchema = z
  .object({
    name: nameSchema,
    gender: choice(GENDERS),
    genderCustom: z.string().trim().min(2).max(GENDER_CUSTOM_MAX).optional(),
    showGender: z.boolean(),
    seeking: z.array(choice(SEEKING)).min(1).max(SEEKING.length),
  })
  .refine((b) => b.gender !== 'self_described' || Boolean(b.genderCustom), {
    path: ['genderCustom'],
    message: 'required for self_described',
  })
  .refine((b) => new Set(b.seeking).size === b.seeking.length, { path: ['seeking'] });

const dealbreakerSchema = z.object({
  field: choice(DEALBREAKER_FIELDS),
  /** Values of that field the user accepts in a match; at least one. */
  accepted: z.array(z.string().min(1).max(30)).min(1).max(5),
});

export const intentSchema = z
  .object({
    intent: choice(INTENTS),
    tempo: choice(TEMPOS),
    dealbreakers: z.array(dealbreakerSchema).max(DEALBREAKERS_MAX),
  })
  .refine((v) => new Set(v.dealbreakers.map((d) => d.field)).size === v.dealbreakers.length, {
    path: ['dealbreakers'],
  })
  .refine(
    (v) =>
      v.dealbreakers.every((d) => {
        const allowed: readonly string[] =
          d.field === 'pets' ? PETS : DETAIL_CHOICES[d.field as keyof typeof DETAIL_CHOICES];
        return d.accepted.every((a) => allowed.includes(a));
      }),
    { path: ['dealbreakers'], message: 'unknown value' },
  );

export const doorQuestionSchema = z.union([
  z.object({ presetId: z.string().uuid() }),
  z.object({ customText: z.string().trim().min(DOOR_QUESTION_MIN).max(DOOR_QUESTION_MAX) }),
]);

export const interestsSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(INTERESTS_MIN)
    .max(INTERESTS_MAX)
    .refine((ids) => new Set(ids).size === ids.length),
});

const shortText = z.string().trim().min(1).max(SHORT_TEXT_MAX);
const optional = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional();

/** Partial update of optional fields; `null` clears a field. */
export const detailsSchema = z.object({
  height: optional(z.number().int().min(HEIGHT_MIN).max(HEIGHT_MAX)),
  education: optional(choice(DETAIL_CHOICES.education)),
  school: optional(shortText),
  occupation: optional(shortText),
  workplace: optional(shortText),
  smoking: optional(choice(DETAIL_CHOICES.smoking)),
  alcohol: optional(choice(DETAIL_CHOICES.alcohol)),
  children: optional(choice(DETAIL_CHOICES.children)),
  wants_children: optional(choice(DETAIL_CHOICES.wants_children)),
  pets: optional(z.array(choice(PETS)).min(1).max(PETS.length)),
  sports: optional(choice(DETAIL_CHOICES.sports)),
  diet: optional(choice(DETAIL_CHOICES.diet)),
  sleep: optional(choice(DETAIL_CHOICES.sleep)),
  languages: optional(z.array(choice(LANGUAGES)).min(1).max(LANGUAGES.length)),
  hometown_city_id: optional(z.number().int().min(1).max(81)),
  zodiac: optional(choice(DETAIL_CHOICES.zodiac)),
  first_date: optional(choice(DETAIL_CHOICES.first_date)),
  music: optional(z.array(shortText).min(1).max(FAVORITES_MAX)),
  films: optional(z.array(shortText).min(1).max(FAVORITES_MAX)),
  books: optional(z.array(shortText).min(1).max(FAVORITES_MAX)),
  about: optional(z.string().trim().min(1).max(ABOUT_MAX)),
});
export type Details = z.infer<typeof detailsSchema>;
export type DetailKey = keyof Details;
export const DETAIL_KEYS = Object.keys(detailsSchema.shape) as DetailKey[];
/** Free-text fields that go through text moderation. */
export const MODERATED_DETAIL_KEYS: DetailKey[] = [
  'school',
  'occupation',
  'workplace',
  'music',
  'films',
  'books',
  'about',
];

/** Per-field "show on profile" switches (§6.4); gender has its own switch in basics. */
export const visibilitySchema = z.partialRecord(
  z.enum(DETAIL_KEYS as [DetailKey, ...DetailKey[]]),
  z.boolean(),
);

export const locationSchema = z.object({
  cityId: z.number().int().min(1).max(81),
  districtId: z.number().int().positive().nullable().optional(),
  /** Device coordinates, if the user allowed location; rounded on the server. */
  coords: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable()
    .optional(),
});

/**
 * Coordinates are stored on a ~1 km grid only (§13.6). Two decimals of a
 * degree are ≈1.1 km of latitude; raw coordinates never reach the database.
 */
export function roundToGrid(coords: { lat: number; lng: number }): { lat: number; lng: number } {
  const r = (v: number) => Math.round(v * 100) / 100;
  return { lat: r(coords.lat), lng: r(coords.lng) };
}

/** Whether a change limited to once per `days` is allowed (null = never changed). */
export function canChange(lastChangedAt: Date | null, now: Date, days: number): boolean {
  if (!lastChangedAt) return true;
  return now.getTime() - lastChangedAt.getTime() >= days * 86_400_000;
}
