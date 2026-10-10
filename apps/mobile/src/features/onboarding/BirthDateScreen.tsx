import { space } from '@nokuzo/design-tokens';
import { AGE_GATE_LOCK_HOURS, calendarDateIn, checkBirthDate } from '@nokuzo/shared';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Input } from '@/components';
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

export function BirthDateScreen() {
  const { t, i18n } = useTranslation();
  const advance = useAdvance();
  const server = useOnboardingState();
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [deviceLock, setDeviceLock] = useState<string | null>(null);
  // Read the clock once per visit; render must stay pure.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    void SecureStore.getItemAsync(AGE_LOCK_KEY)
      .then(setDeviceLock)
      .catch(() => undefined);
  }, []);

  const iso = toIsoDate(day, month, year);
  const check = iso ? checkBirthDate(iso, calendarDateIn(new Date(now))) : 'invalid';
  const typedAll = day.length > 0 && month.length > 0 && year.length === 4;

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
        <View style={styles.small}>
          <Input
            label={t('birthDate.day')}
            value={day}
            onChangeText={setDay}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
        <View style={styles.small}>
          <Input
            label={t('birthDate.month')}
            value={month}
            onChangeText={setMonth}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
        <View style={styles.large}>
          <Input
            label={t('birthDate.year')}
            value={year}
            onChangeText={setYear}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
      </View>
      {typedAll && (check === 'invalid' || check === 'future' || check === 'implausible') ? (
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
  small: { flex: 1 },
  large: { flex: 1.6 },
});
