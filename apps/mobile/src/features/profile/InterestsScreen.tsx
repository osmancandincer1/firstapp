import { INTERESTS_MAX, INTERESTS_MIN } from '@nokuzo/shared';
import { space } from '@nokuzo/design-tokens';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, ChipGroup, Skeleton } from '@/components';
import { ProfileFormScreen, SaveNotice, useSaveSection, type FormMode } from './ProfileFormScreen';
import { useInitialValues } from './useInitialValues';
import { useInterests, useMyProfile } from './queries';

/** §6.1 step 12: 5–10 interests by category; optional details are one tap away. */
export function InterestsScreen({ mode = 'onboarding' }: { mode?: FormMode }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const me = useMyProfile();
  const interests = useInterests();
  const [ids, setIds] = useState<string[]>([]);
  const { save, pending, error, heldForReview } = useSaveSection(mode);

  useInitialValues(me.data, (p) => setIds(p.interestIds));

  const grouped = useMemo(() => {
    const map = new Map<string, { value: string; label: string }[]>();
    for (const i of interests.data ?? []) {
      const list = map.get(i.category) ?? [];
      list.push({ value: i.id, label: i18n.language === 'en' ? i.label_en : i.label_tr });
      map.set(i.category, list);
    }
    return [...map.entries()];
  }, [interests.data, i18n.language]);

  const toggle = (id: string) =>
    setIds((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= INTERESTS_MAX
          ? cur
          : [...cur, id],
    );
  const valid = ids.length >= INTERESTS_MIN && ids.length <= INTERESTS_MAX;

  return (
    <ProfileFormScreen
      loading={me.isPending}
      mode={mode}
      step="interests"
      title={t('profile.interests.title')}
      subtitle={t('profile.interests.subtitle')}
      testID="interests"
      footer={
        <>
          <Button
            label={t('common.continue')}
            disabled={!valid}
            loading={pending}
            onPress={() => void save({ section: 'interests', data: { ids } })}
          />
          <Button
            variant="ghost"
            label={t('profile.interests.more')}
            onPress={() => router.push('/profile/details')}
          />
        </>
      }
    >
      <AppText variant="label" accessibilityLiveRegion="polite" testID="interest-count">
        {t('profile.interests.count', { count: ids.length })}
      </AppText>
      {interests.isPending ? (
        <View accessible accessibilityLabel={t('common.loading')} style={styles.group}>
          <Skeleton height={44} />
          <Skeleton height={44} />
        </View>
      ) : (
        grouped.map(([category, options]) => (
          <View key={category} style={styles.group}>
            <AppText variant="label">{t(`profile.interests.categories.${category}`)}</AppText>
            <ChipGroup<string>
              label={t(`profile.interests.categories.${category}`)}
              multiple
              options={options}
              selected={ids}
              onToggle={toggle}
            />
          </View>
        ))
      )}
      <SaveNotice error={error} heldForReview={heldForReview} />
    </ProfileFormScreen>
  );
}

const styles = StyleSheet.create({ group: { gap: space(1) } });
