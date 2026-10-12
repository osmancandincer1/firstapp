import { flame, motion, radius, space } from '@nokuzo/design-tokens';
import {
  AGE_FILTER_MAX,
  AGE_FILTER_MIN,
  AGE_SPAN_MIN,
  DISTANCES,
  INTENTS,
  POOL_WARNING,
  preferencesSchema,
  type Preferences,
} from '@nokuzo/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import {
  AppText,
  Banner,
  Button,
  Card,
  Checkbox,
  ChipGroup,
  FlameGradient,
  Screen,
  Skeleton,
} from '@/components';
import { useTheme } from '@/design/theme';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import { updateSection } from '@/features/profile/api';
import { useInitialValues } from '@/features/profile/useInitialValues';
import type { ClientErrorCode } from '@/lib/api';
import { poolEstimate } from './api';
import { PREFERENCES_KEY, useDiscoveryPreferences, useInvalidate } from './queries';

type Distance = (typeof DISTANCES)[number] | null;
const WHOLE_CITY = 'all';

/** Keeps ageMin/ageMax inside 18–99 with at least a 4-year span (§6.6). */
export function stepAge(p: Preferences, which: 'ageMin' | 'ageMax', delta: number): Preferences {
  const value = p[which] + delta;
  if (which === 'ageMin') {
    if (value < AGE_FILTER_MIN || p.ageMax - value < AGE_SPAN_MIN) return p;
  } else if (value > AGE_FILTER_MAX || value - p.ageMin < AGE_SPAN_MIN) return p;
  return { ...p, [which]: value };
}

/** Live pool estimate, debounced while the user is still changing filters (TUR-09). */
function useEstimate(prefs: Preferences | null) {
  const [estimate, setEstimate] = useState<number | null>(null);
  const key = JSON.stringify(prefs);
  useEffect(() => {
    if (!prefs || !preferencesSchema.safeParse(prefs).success) return;
    let live = true;
    const id = setTimeout(() => {
      void poolEstimate(prefs).then((n) => {
        if (live) setEstimate(n);
      });
    }, 400);
    return () => {
      live = false;
      clearTimeout(id);
    };
    // `key` captures every field of `prefs`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return estimate;
}

/** §8.1 #44 Filtreler (§6.6 basic filters) with a live pool estimate. */
export function FiltersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const saved = useDiscoveryPreferences();
  const invalidate = useInvalidate();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const [done, setDone] = useState(false);
  const estimate = useEstimate(prefs);

  useInitialValues(saved.data, setPrefs);

  if (!prefs) {
    return (
      <Screen
        title={t('filters.title')}
        subtitle={saved.isError ? t('filters.error') : undefined}
        testID="filters-loading"
        footer={
          saved.isError ? (
            <Button label={t('common.retry')} onPress={() => void saved.refetch()} />
          ) : null
        }
      >
        {saved.isError ? null : (
          <View accessible accessibilityLabel={t('common.loading')} style={styles.gap}>
            <Skeleton height={48} />
            <Skeleton height={96} />
          </View>
        )}
      </Screen>
    );
  }

  const change = (next: Preferences) => {
    setDone(false);
    setPrefs(next);
  };
  const toggleIntent = (i: (typeof INTENTS)[number]) =>
    change({
      ...prefs,
      intents: prefs.intents.includes(i)
        ? prefs.intents.filter((x) => x !== i)
        : [...prefs.intents, i],
    });
  const valid = preferencesSchema.safeParse(prefs).success;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const r = await updateSection({ section: 'preferences', data: prefs });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await invalidate(PREFERENCES_KEY);
    setDone(true);
  };

  const distanceValue: string = prefs.distanceKm === null ? WHOLE_CITY : String(prefs.distanceKm);

  return (
    <Screen
      title={t('filters.title')}
      subtitle={t('filters.subtitle')}
      testID="filters"
      footer={
        <>
          <Button
            label={t('filters.save')}
            onPress={() => void save()}
            disabled={!valid}
            loading={busy}
          />
          <Button variant="ghost" label={t('common.back')} onPress={() => router.back()} />
        </>
      }
    >
      <Card>
        <AppText variant="label">{t('filters.age')}</AppText>
        <AgeRange min={prefs.ageMin} max={prefs.ageMax} />
        <AgeStepper
          label={t('filters.ageMin')}
          value={prefs.ageMin}
          onStep={(d) => change(stepAge(prefs, 'ageMin', d))}
        />
        <AgeStepper
          label={t('filters.ageMax')}
          value={prefs.ageMax}
          onStep={(d) => change(stepAge(prefs, 'ageMax', d))}
        />
        <AppText variant="caption" tone="secondary">
          {t('filters.ageHelp', { span: AGE_SPAN_MIN })}
        </AppText>
      </Card>
      <AppText variant="label">{t('filters.distance')}</AppText>
      <ChipGroup<string>
        label={t('filters.distance')}
        options={[
          ...DISTANCES.map((d) => ({ value: String(d), label: t('filters.km', { km: d }) })),
          { value: WHOLE_CITY, label: t('filters.wholeCity') },
        ]}
        selected={[distanceValue]}
        onToggle={(v) =>
          change({ ...prefs, distanceKm: v === WHOLE_CITY ? null : (Number(v) as Distance) })
        }
        testID="distance"
      />
      <AppText variant="label">{t('filters.intents')}</AppText>
      <ChipGroup
        label={t('filters.intents')}
        multiple
        options={INTENTS.map((i) => ({ value: i, label: t(`profile.intent.intents.${i}`) }))}
        selected={prefs.intents}
        onToggle={toggleIntent}
        testID="intents"
      />
      {prefs.intents.length === 0 ? (
        <AppText tone="danger">{t('filters.intentRequired')}</AppText>
      ) : null}
      <Checkbox
        label={t('filters.voiceOnly')}
        checked={prefs.voiceOnly}
        onChange={(voiceOnly) => change({ ...prefs, voiceOnly })}
      />
      <Button
        variant="ghost"
        label={t('filters.more')}
        onPress={() => router.push('/profile/edit/intent')}
      />
      {estimate !== null ? (
        <Card testID="estimate">
          <AppText accessibilityLiveRegion="polite">
            {t('filters.estimate', { count: estimate })}
          </AppText>
          {estimate < POOL_WARNING ? (
            <Banner tone="warning" message={t('filters.smallPool')} />
          ) : null}
        </Card>
      ) : null}
      {done ? (
        <AppText tone="success" accessibilityLiveRegion="polite">
          {t('filters.saved')}
        </AppText>
      ) : null}
      <ErrorNotice error={error} />
    </Screen>
  );
}

/** The chosen range drawn on the 18–99 track; the steppers below are the controls. */
function AgeRange({ min, max }: { min: number; max: number }) {
  const { reduceMotion } = useTheme();
  const span = AGE_FILTER_MAX - AGE_FILTER_MIN;
  const left = ((min - AGE_FILTER_MIN) / span) * 100;
  const width = ((max - min) / span) * 100;
  const l = useSharedValue(left);
  const w = useSharedValue(width);
  useEffect(() => {
    const to = (v: number) => (reduceMotion ? v : withTiming(v, { duration: motion.durationBase }));
    l.set(to(left));
    w.set(to(width));
  }, [left, width, reduceMotion, l, w]);
  const fill = useAnimatedStyle(() => ({
    left: `${l.value}%` as `${number}%`,
    width: `${w.value}%` as `${number}%`,
  }));
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AppText variant="title">{`${min} – ${max}`}</AppText>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fill]}>
          <FlameGradient style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
    </View>
  );
}

function AgeStepper({
  label,
  value,
  onStep,
}: {
  label: string;
  value: number;
  onStep: (d: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.stepper}>
      <AppText style={styles.flex}>{`${label}: ${value}`}</AppText>
      <Button
        variant="secondary"
        label="−"
        accessibilityHint={t('filters.decrease', { label })}
        onPress={() => onStep(-1)}
      />
      <Button
        variant="secondary"
        label="+"
        accessibilityHint={t('filters.increase', { label })}
        onPress={() => onStep(1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space(2) },
  flex: { flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: flame.chip,
    marginTop: space(1),
    overflow: 'hidden',
  },
  fill: { position: 'absolute', top: 0, bottom: 0, borderRadius: radius.pill, overflow: 'hidden' },
});
