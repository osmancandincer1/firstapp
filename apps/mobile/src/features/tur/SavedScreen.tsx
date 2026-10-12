import { flame, radius, space } from '@nokuzo/design-tokens';
import { countdown, SAVED_MAX } from '@nokuzo/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import {
  AppText,
  Avatar,
  Banner,
  Button,
  Card,
  EmptyState,
  Icon,
  Screen,
  Skeleton,
} from '@/components';
import { BookmarkSimpleIcon, ClockIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import type { ClientErrorCode } from '@/lib/api';
import { cardAction, type SavedCard } from './api';
import { PublicProfileView } from './PublicProfileView';
import { isOffline, SAVED_KEY, TUR_KEY, useInvalidate, useSaved } from './queries';
import { useNow } from './useNow';

/** §8.1 #45 Sonraya sakladıklarım: at most 9 people for 7 days; they are never told. */
export function SavedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const query = useSaved();

  const footer = <Button variant="ghost" label={t('common.back')} onPress={() => router.back()} />;

  if (query.isPending) {
    return (
      <Screen title={t('saved.title')} testID="saved-loading" footer={footer}>
        <View accessible accessibilityLabel={t('common.loading')} style={styles.gap}>
          <Skeleton height={88} />
        </View>
      </Screen>
    );
  }
  if (query.isError && !query.data) {
    return (
      <Screen
        title={t('saved.title')}
        subtitle={isOffline(query.error) ? t('common.offline') : t('saved.error')}
        testID="saved-error"
        footer={<Button label={t('common.retry')} onPress={() => void query.refetch()} />}
      />
    );
  }

  return (
    <Screen
      title={t('saved.title')}
      subtitle={t('saved.subtitle', { count: query.data.length, max: SAVED_MAX })}
      testID="saved"
      footer={footer}
    >
      {query.isError && isOffline(query.error) ? (
        <Banner tone="warning" message={t('common.offline')} />
      ) : null}
      {query.data.length === 0 ? (
        <EmptyState icon={BookmarkSimpleIcon} message={t('saved.empty')} testID="saved-empty" />
      ) : (
        query.data.map((s, i) => <SavedRow key={s.candidateId} item={s} index={i} />)
      )}
    </Screen>
  );
}

function SavedRow({ item, index }: { item: SavedCard; index: number }) {
  const { t } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  const router = useRouter();
  const now = useNow();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const [open, setOpen] = useState(false);
  const left = countdown(now, new Date(item.expiresAt));

  const unsave = async () => {
    if (!item.cardId || busy) return;
    setBusy(true);
    const r = await cardAction(item.cardId, 'unsave');
    setBusy(false);
    if (!r.ok) setError(r.error);
    else await invalidate(SAVED_KEY, TUR_KEY);
  };

  return (
    <Animated.View
      entering={
        reduceMotion
          ? undefined
          : FadeInDown.delay(60 * index)
              .springify()
              .damping(18)
      }
      layout={reduceMotion ? undefined : LinearTransition}
    >
      <Card testID="saved-row">
        <View style={styles.head}>
          <Avatar
            uri={item.profile?.photos?.[0]?.url}
            name={item.profile?.name}
            size={64}
            shape="portrait"
          />
          <View style={styles.headText}>
            <AppText variant="heading">
              {[item.profile?.name ?? t('inbox.someone'), item.profile?.age]
                .filter(Boolean)
                .join(', ')}
            </AppText>
            <View style={styles.pill}>
              <Icon icon={ClockIcon} size={14} color={colors.accentSecondary} />
              <AppText variant="caption" tone="secondary">
                {t('saved.left', { days: Math.floor(left.hours / 24), hours: left.hours % 24 })}
              </AppText>
            </View>
          </View>
        </View>
        {item.profile ? (
          <Button
            variant="secondary"
            label={open ? t('saved.hideProfile') : t('saved.showProfile')}
            onPress={() => setOpen(!open)}
          />
        ) : null}
        {open && item.profile ? <PublicProfileView profile={item.profile} /> : null}
        <Button
          label={t('tur.answer')}
          onPress={() =>
            router.push({ pathname: '/answer', params: { candidateId: item.candidateId } })
          }
        />
        {item.cardId ? (
          <Button
            variant="ghost"
            label={t('tur.unsave')}
            onPress={() => void unsave()}
            disabled={busy}
          />
        ) : null}
        <ErrorNotice error={error} />
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space(2) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  headText: { flex: 1, gap: space(0.75), alignItems: 'flex-start' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space(1.25),
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: flame.chip,
    borderWidth: 1,
    borderColor: flame.chipBorder,
  },
});
