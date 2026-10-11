/**
 * The Round (Tur), answers and discovery preferences (APP.md §4.1, §4.2, §5, §6.6).
 */
import { z } from 'zod';

import { foldText } from './moderation.ts';
import { INTENTS } from './profile.ts';

export const TUR_SIZE = 9;
export const TUR_OPEN_HOUR = 21;
/** The nightly job runs half an hour before opening (§5). */
export const TUR_GENERATE_HOUR = 20;
export const TUR_GENERATE_MINUTE = 30;
export const TUR_TIME_ZONE = 'Europe/Istanbul';
export const PASS_HIDE_DAYS = 60;
export const SHOWN_HIDE_DAYS = 14;
export const SAVED_MAX = 9;
export const SAVED_DAYS = 7;

export const ANSWER_TEXT_MIN = 10;
export const ANSWER_TEXT_MAX = 200;
export const ANSWER_VOICE_MIN_SECONDS = 3;
export const ANSWER_VOICE_MAX_SECONDS = 20;
export const ANSWER_DAILY_LIMIT = 15;
export const ANSWER_PENDING_LIMIT = 15;
export const ANSWER_EXPIRY_DAYS = 14;
/** §4.2: 80%+ similar answers in 24 h — the 3rd is warned, the 4th refused. */
export const SIMILARITY_THRESHOLD = 0.8;
export const SIMILAR_WARN_AT = 3;
export const SIMILAR_BLOCK_AT = 4;
/** §4.4 table slots; the server reads the live value from the `tables.free_slots` flag. */
export const FREE_TABLE_SLOTS = 3;
export const PLUS_TABLE_SLOTS = 5;
export const WAITING_SLOT_HOURS = 72;
export const RECIPROCATION_MIN = 1;
export const RECIPROCATION_MAX = 1000;

// --- Opening times -----------------------------------------------------------------

function istanbulParts(at: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TUR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

/** Offset of Istanbul from UTC at `at`, in minutes (Türkiye has kept UTC+3 since 2016). */
function offsetMinutes(at: Date): number {
  const p = istanbulParts(at);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** The next 21:00 in Istanbul strictly after `now`. */
export function nextTurOpening(now: Date): Date {
  const p = istanbulParts(now);
  const offset = offsetMinutes(now);
  let opening = Date.UTC(p.y, p.m - 1, p.d, TUR_OPEN_HOUR, 0) - offset * 60_000;
  if (opening <= now.getTime()) opening += 24 * 3_600_000;
  return new Date(opening);
}

/** The Round date in effect at `now`: today after 21:00, otherwise yesterday (YYYY-MM-DD). */
export function currentTurDate(now: Date): string {
  const p = istanbulParts(now);
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d));
  if (p.h < TUR_OPEN_HOUR) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

/** Countdown parts for "next Round in …". */
export function countdown(now: Date, target: Date): { hours: number; minutes: number } {
  const ms = Math.max(0, target.getTime() - now.getTime());
  return { hours: Math.floor(ms / 3_600_000), minutes: Math.floor((ms % 3_600_000) / 60_000) };
}

// --- Answers -------------------------------------------------------------------------

/**
 * §4.2: 10–200 characters, and emoji alone is not enough: at least three
 * letters or digits must remain once emoji, symbols and spaces are removed.
 */
export function checkAnswerText(raw: string): 'ok' | 'too_short' | 'too_long' | 'emoji_only' {
  const text = raw.trim();
  if ([...text].length > ANSWER_TEXT_MAX) return 'too_long';
  const meaningful = text.replace(/[^\p{L}\p{N}]/gu, '');
  if (meaningful.length < 3) return 'emoji_only';
  if ([...text].length < ANSWER_TEXT_MIN) return 'too_short';
  return 'ok';
}

function trigrams(text: string): Map<string, number> {
  const s = ` ${foldText(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
  const grams = new Map<string, number>();
  for (let i = 0; i + 3 <= s.length; i++) {
    const g = s.slice(i, i + 3);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

/** Dice coefficient over character trigrams of the folded text (0–1). */
export function textSimilarity(a: string, b: string): number {
  const ga = trigrams(a);
  const gb = trigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of ga) {
    inter += Math.min(n, gb.get(g) ?? 0);
    total += n;
  }
  for (const n of gb.values()) total += n;
  return total === 0 ? 0 : (2 * inter) / total;
}

/**
 * Copy-paste check (§4.2, MAS-03). `recent` are the user's answers of the
 * last 24 hours. Counting this one, 3 similar → warn (sent), 4 → refused.
 */
export function copyPasteVerdict(text: string, recent: readonly string[]): 'ok' | 'warn' | 'block' {
  const similar = recent.filter((r) => textSimilarity(text, r) >= SIMILARITY_THRESHOLD).length + 1;
  if (similar >= SIMILAR_BLOCK_AT) return 'block';
  if (similar >= SIMILAR_WARN_AT) return 'warn';
  return 'ok';
}

/** What the sender sees: a pass by the recipient is never revealed (§4.2). */
export type OutgoingStatus = 'waiting' | 'reciprocated' | 'dropped';
export function outgoingStatus(
  status: 'pending' | 'reciprocated' | 'passed' | 'expired' | 'reported',
  expiresAt: Date,
  now: Date,
): OutgoingStatus {
  if (status === 'reciprocated') return 'reciprocated';
  if (status === 'expired') return 'dropped';
  return now.getTime() >= expiresAt.getTime() ? 'dropped' : 'waiting';
}

// --- Preferences (§6.6 basic filters) ---------------------------------------------------

export const DISTANCES = [5, 10, 25, 50, 100] as const;
export const AGE_FILTER_MIN = 18;
export const AGE_FILTER_MAX = 99;
export const AGE_SPAN_MIN = 4;
type Intent = (typeof INTENTS)[number];

/**
 * Intents next to each other on the scale long_term → serious_unhurried →
 * unsure → friendship count as "neighbours" for the default filter and score.
 */
export function neighbourIntents(intent: Intent): Intent[] {
  const i = INTENTS.indexOf(intent);
  return INTENTS.filter((_, j) => Math.abs(i - j) === 1);
}

/** §6.6 defaults: own age ±5 (at least a 4-year span), whole city, own intent + neighbours. */
export function defaultPreferences(age: number, intent: Intent) {
  // ±5 always leaves at least a 5-year span within 18–99, so the 4-year minimum holds.
  const min = Math.max(AGE_FILTER_MIN, age - 5);
  const max = Math.min(AGE_FILTER_MAX, age + 5);
  return {
    ageMin: min,
    ageMax: max,
    distanceKm: null,
    intents: [intent, ...neighbourIntents(intent)],
    voiceOnly: false,
  };
}

export const preferencesSchema = z
  .object({
    ageMin: z.number().int().min(AGE_FILTER_MIN).max(AGE_FILTER_MAX),
    ageMax: z.number().int().min(AGE_FILTER_MIN).max(AGE_FILTER_MAX),
    distanceKm: z
      .union([z.literal(5), z.literal(10), z.literal(25), z.literal(50), z.literal(100)])
      .nullable(),
    intents: z.array(z.enum(INTENTS)).min(1).max(INTENTS.length),
    voiceOnly: z.boolean(),
  })
  .refine((p) => p.ageMax - p.ageMin >= AGE_SPAN_MIN, { path: ['ageMax'], message: 'span' })
  .refine((p) => new Set(p.intents).size === p.intents.length, { path: ['intents'] });
export type Preferences = z.infer<typeof preferencesSchema>;

/** §6.6: below this pool size the filters screen warns. */
export const POOL_WARNING = 30;

// --- "Why this person?" (§4.6) ---------------------------------------------------------------

/** Reason and difference keys produced by the server; the app localizes them. */
export const REASON_KEYS = [
  'same_intent',
  'neighbour_intent',
  'shared_interests',
  'same_tempo',
  'same_first_date',
  'both_non_smokers',
  'both_active',
] as const;
export const DIFFERENCE_KEYS = ['smoking', 'alcohol', 'wants_children', 'tempo'] as const;
export type ReasonKey = (typeof REASON_KEYS)[number];

/** Reasons the user can ask to see less of ("Bunun gibileri daha az göster"). */
export const LESS_LIKE_THIS_KEYS: readonly ReasonKey[] = [
  'same_intent',
  'shared_interests',
  'same_tempo',
  'same_first_date',
];
