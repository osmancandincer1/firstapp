import { flame, minTouchTarget, radius, space } from '@nokuzo/design-tokens';
import { MOODS, type Mood } from '@nokuzo/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Banner, Button, Card, ChipGroup, Icon, Screen } from '@/components';
import {
  BookmarkSimpleIcon,
  CaretRightIcon,
  DiceFiveIcon,
  SlidersHorizontalIcon,
} from '@/components/icons';
import { useTheme } from '@/design/theme';
import { signOut } from '@/features/auth/session';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import type { ClientErrorCode } from '@/lib/api';
import { env } from '@/lib/env';
import { updateSection } from './api';
import { useMyFun, useMyProfile, useProfileView, useRefreshProfile } from './queries';

const SECTIONS = [
  ['basics', '/profile/edit/basics'],
  ['photos', '/profile/edit/photos'],
  ['intent', '/profile/edit/intent'],
  ['door', '/profile/edit/door-question'],
  ['interests', '/profile/edit/interests'],
  ['location', '/profile/edit/location'],
  ['details', '/profile/details'],
  ['voice', '/profile/voice'],
] as const;

/** One tappable line in a glass list: label, optional status and a caret. */
function Row({
  label,
  detail,
  icon,
  onPress,
  last,
}: {
  label: string;
  detail?: string;
  icon?: Parameters<typeof Icon>[0]['icon'];
  onPress: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: flame.glassBorder },
        pressed && { opacity: 0.6 },
      ]}
    >
      {icon ? <Icon icon={icon} size={20} color={colors.accentPrimary} /> : null}
      <AppText style={styles.rowLabel}>{label}</AppText>
      {detail ? (
        <AppText variant="caption" tone="secondary">
          {detail}
        </AppText>
      ) : null}
      <Icon icon={CaretRightIcon} size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

/** This week's mood (D-066): one tap saves, tapping the selected one clears it. */
function MoodCard() {
  const { t } = useTranslation();
  const fun = useMyFun();
  const refresh = useRefreshProfile();
  const [optimistic, setOptimistic] = useState<{ mood: Mood | null } | null>(null);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const current = optimistic ? optimistic.mood : (fun.data?.mood ?? null);

  const choose = async (mood: Mood) => {
    const next = current === mood ? null : mood;
    setOptimistic({ mood: next });
    setError(null);
    const r = await updateSection({ section: 'mood', data: { mood: next } });
    if (!r.ok) setError(r.error);
    await refresh();
    setOptimistic(null);
  };

  return (
    <Card testID="mood-card">
      <AppText variant="heading">{t('mood.title')}</AppText>
      <ChipGroup<Mood>
        label={t('mood.title')}
        options={MOODS.map((m) => ({ value: m, label: t(`mood.options.${m}`) }))}
        selected={current ? [current] : []}
        onToggle={(m) => void choose(m)}
      />
      <AppText variant="caption" tone="secondary">
        {t('mood.hint')}
      </AppText>
      <ErrorNotice error={error} />
    </Card>
  );
}

/**
 * The "Ben" tab (§8.1 #28): who you are at a glance, this week's mood, the
 * games, and every part of the profile.
 */
export function ProfileHomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMyProfile();
  const view = useProfileView();
  const fun = useMyFun();
  const pending = me.data?.pendingEdits.length ?? 0;
  const mainPhoto = me.data?.photos.find((p) => p.status === 'approved');
  const photoUrl = mainPhoto ? view.data?.media[mainPhoto.id] : undefined;

  return (
    <Screen title={t('profile.home.title')} testID="profile-home">
      <View style={styles.hero}>
        <Avatar uri={photoUrl} name={me.data?.name} size={92} shape="portrait" />
        <View style={styles.heroText}>
          {me.data?.name ? <AppText variant="title">{me.data.name}</AppText> : null}
          <AppText tone="secondary">{t('profile.home.active')}</AppText>
        </View>
      </View>
      <Button
        variant="secondary"
        label={t('profile.home.preview')}
        onPress={() => router.push('/profile/preview')}
      />
      {pending > 0 ? <Banner message={t('profile.home.pending', { count: pending })} /> : null}

      <MoodCard />

      <AppText variant="label" tone="secondary" style={styles.section}>
        {t('games.title')}
      </AppText>
      <Card style={styles.list}>
        <Row
          icon={DiceFiveIcon}
          label={t('games.twoTruths.title')}
          detail={fun.data?.twoTruths ? t('games.twoTruths.added') : t('games.twoTruths.empty')}
          onPress={() => router.push('/profile/edit/two-truths')}
          last
        />
      </Card>

      <AppText variant="label" tone="secondary" style={styles.section}>
        {t('profile.home.discover')}
      </AppText>
      <Card style={styles.list}>
        <Row
          icon={SlidersHorizontalIcon}
          label={t('tur.filters')}
          onPress={() => router.push('/filters')}
        />
        <Row
          icon={BookmarkSimpleIcon}
          label={t('tur.saved')}
          onPress={() => router.push('/saved')}
          last
        />
      </Card>

      <AppText variant="label" tone="secondary" style={styles.section}>
        {t('profile.home.profileParts')}
      </AppText>
      <Card style={styles.list}>
        {SECTIONS.map(([key, href], i) => (
          <Row
            key={key}
            label={t(`profile.home.sections.${key}`)}
            onPress={() => router.push(href as never)}
            last={i === SECTIONS.length - 1}
          />
        ))}
      </Card>

      <View style={styles.end}>
        {env.APP_ENV !== 'production' ? (
          <Button
            variant="ghost"
            label={t('done.foundation')}
            onPress={() => router.push('/dev/foundation')}
          />
        ) : null}
        <Button variant="ghost" label={t('common.signOut')} onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  heroText: { flex: 1, gap: space(0.5) },
  section: { textTransform: 'uppercase', letterSpacing: 1, marginTop: space(1) },
  list: { paddingVertical: 0, paddingHorizontal: space(2), gap: 0, borderRadius: radius.lg },
  row: {
    minHeight: minTouchTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
  },
  rowLabel: { flex: 1 },
  end: { marginTop: space(2) },
});
