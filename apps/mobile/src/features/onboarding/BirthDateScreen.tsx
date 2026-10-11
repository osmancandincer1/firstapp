import { space } from '@nokuzo/design-tokens';
import {
  AGE_GATE_LOCK_HOURS,
  ageOn,
  calendarDateIn,
  checkBirthDate,
  MAXIMUM_AGE,
} from '@nokuzo/shared';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Banner, Button, WheelPicker } from '@/components';
import { submitBirthDate } from './api';
import { ErrorNotice } from './ErrorNotice';
import { useOnboardingState } from './gate';
import { OnboardingScreen } from './OnboardingScreen';
import { formatRetry, useAdvance } from './useAdvance';
import { useApiAction } from './useApiAction';

/** Device-side lock after an under-age attempt (§6.1 step 5: "cihazda 24 saat"). */
export const AGE_LOCK_KEY = 'nokuzo.age_gate_locked_until';

export function toIsoDate(day: string, month: string, year: string): string | null {
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Days in a month; February of an unknown year allows the 29th. */
export function daysInMonth(month: number, year: number | null): number {
  return new Date(Date.UTC(year ?? 2000, month, 0)).getUTCDate();
}

/**
 * §6.1 step 5: three scroll wheels (day, month, year). Nothing is preselected,
 * so nobody submits a default date by accident; the chosen date and age are
 * shown before continuing because the date cannot be changed later.
 */
export function BirthDateScreen() {
  const { t, i18n } = useTranslation();
  const advance = useAdvance();
  const server = useOnboardingState();
  const [day, setDay] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [deviceLock, setDeviceLock] = useState<string | null>(null);
  // Read the clock once per visit; render must stay pure.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    void SecureStore.getItemAsync(AGE_LOCK_KEY)
      .then(setDeviceLock)
      .catch(() => undefined);
  }, []);

  const today = calendarDateIn(new Date(now));
  const thisYear = Number(today.slice(0, 4));
  const monthNames = t('birthDate.monthNames').split(',');
  const years = useMemo(
    () =>
      Array.from({ length: MAXIMUM_AGE + 1 }, (_, i) => thisYear - i).map((y) => ({
        value: y,
        label: String(y),
      })),
    [thisYear],
  );
  const dayCount = month ? daysInMonth(month, year) : 31;
  const days = Array.from({ length: dayCount }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

  // A month or year change can make the chosen day impossible (31 → February): keep it valid.
  const chooseMonth = (m: number) => {
    setMonth(m);
    if (day && day > daysInMonth(m, year)) setDay(daysInMonth(m, year));
  };
  const chooseYear = (y: number) => {
    setYear(y);
    if (day && month && day > daysInMonth(month, y)) setDay(daysInMonth(month, y));
  };

  const iso = day && month && year ? toIsoDate(String(day), String(month), String(year)) : null;
  const check = iso ? checkBirthDate(iso, today) : 'invalid';
  const age = iso && check === 'ok' ? ageOn(iso, today) : null;

  const submit = useCallback(async (date: string) => {
    const r = await submitBirthDate(date);
    if (!r.ok && r.error === 'underage') {
      const until =
        r.retryAt ?? new Date(Date.now() + AGE_GATE_LOCK_HOURS * 3_600_000).toISOString();
      await SecureStore.setItemAsync(AGE_LOCK_KEY, until).catch(() => undefined);
      setDeviceLock(until);
    }
    return r;
  }, []);
  const action = useApiAction(submit, advance);

  const locks = [deviceLock, server.data?.ageGateLockedUntil ?? null].filter(
    (l): l is string => Boolean(l) && new Date(l!).getTime() > now,
  );
  const lockedUntil = locks.sort().at(-1) ?? null;

  return (
    <OnboardingScreen
      step="birth_date"
      title={t('birthDate.title')}
      subtitle={t('birthDate.subtitle')}
      testID="birth-date"
      footer={
        <Button
          label={t('common.continue')}
          onPress={() => iso && void action.run(iso)}
          disabled={!iso || !(check === 'ok' || check === 'underage') || Boolean(lockedUntil)}
          loading={action.pending}
        />
      }
    >
      <View style={styles.row}>
        <WheelPicker
          label={t('birthDate.day')}
          options={days}
          value={day}
          onChange={setDay}
          testID="wheel-day"
        />
        <View style={styles.month}>
          <WheelPicker
            label={t('birthDate.month')}
            options={monthNames.map((name, i) => ({ value: i + 1, label: name }))}
            value={month}
            onChange={chooseMonth}
            testID="wheel-month"
          />
        </View>
        <WheelPicker
          label={t('birthDate.year')}
          options={years}
          value={year}
          onChange={chooseYear}
          testID="wheel-year"
        />
      </View>
      {iso && age !== null ? (
        <AppText accessibilityLiveRegion="polite" testID="birth-date-summary">
          {t('birthDate.summary', {
            date: `${day} ${monthNames[month! - 1]} ${year}`,
            age,
          })}
        </AppText>
      ) : null}
      {iso && (check === 'invalid' || check === 'future' || check === 'implausible') ? (
        <Banner tone="warning" message={t('birthDate.invalid')} />
      ) : null}
      {lockedUntil ? (
        <Banner
          tone="danger"
          message={t('birthDate.locked', { time: formatRetry(lockedUntil, i18n.language) })}
          testID="age-locked"
        />
      ) : (
        <ErrorNotice error={action.error} />
      )}
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space(1.5) },
  month: { flex: 1.6 },
});
