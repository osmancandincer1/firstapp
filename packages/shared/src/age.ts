/** Age gate (APP.md §6.1 step 5, §7.7, AUTH-01). */

export const MINIMUM_AGE = 18;
export const MAXIMUM_AGE = 120;
/** After an under-age attempt the device and the account wait this long (§6.1). */
export const AGE_GATE_LOCK_HOURS = 24;
/** Ages are counted on the Turkish calendar day, the launch market (§0). */
export const AGE_TIME_ZONE = 'Europe/Istanbul';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses "YYYY-MM-DD" and rejects impossible dates such as 2023-02-30. */
export function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/** Calendar date ("YYYY-MM-DD") of `instant` in `timeZone`. */
export function calendarDateIn(instant: Date, timeZone = AGE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Whole years between birth and today. Someone born on 29 February turns a
 * year older on 1 March in non-leap years.
 */
export function ageOn(birthDate: string, today: string): number | null {
  const b = parseIsoDate(birthDate);
  const t = parseIsoDate(today);
  if (!b || !t) return null;
  let age = t.y - b.y;
  if (t.m < b.m || (t.m === b.m && t.d < b.d)) age -= 1;
  return age;
}

export type BirthDateCheck = 'ok' | 'invalid' | 'future' | 'underage' | 'implausible';

export function checkBirthDate(birthDate: string, today: string): BirthDateCheck {
  if (!parseIsoDate(birthDate) || !parseIsoDate(today)) return 'invalid';
  if (birthDate > today) return 'future';
  const age = ageOn(birthDate, today)!;
  if (age < MINIMUM_AGE) return 'underage';
  if (age > MAXIMUM_AGE) return 'implausible';
  return 'ok';
}
