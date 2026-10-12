import { flame, motion, space } from '@nokuzo/design-tokens';
import { TUR_SIZE } from '@nokuzo/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, SlideOutLeft } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Banner,
  Button,
  Card,
  FlameGradient,
  GlowBackdrop,
  Icon,
  Screen,
  Skeleton,
} from '@/components';
import { BookmarkSimpleIcon, SlidersHorizontalIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import { useMyProfile } from '@/features/profile/queries';
import type { ClientErrorCode } from '@/lib/api';
import { cardAction, nextTur, type Tur, type TurCard } from './api';
import { PublicProfileView } from './PublicProfileView';
import { isOffline, SAVED_KEY, TUR_KEY, useInvalidate, useTurState } from './queries';
import { ActionPill, FlipCard } from './TurCard';
import { firstOpenIndex, isDecided, openingTime, turView, useCountdownText } from './turState';
import { useNow } from './useNow';

/** Round buttons for the filters and the saved list. */
function HeaderActions() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={styles.headerActions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('tur.saved')}
        onPress={() => router.push('/saved')}
        style={styles.roundButton}
      >
        <Icon icon={BookmarkSimpleIcon} size={20} color={colors.textPrimary} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('tur.filters')}
        onPress={() => router.push('/filters')}
        style={styles.roundButton}
      >
        <Icon icon={SlidersHorizontalIcon} size={20} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

/** §8.1 #18 Tur: up to 9 cards, free back-and-forth, "Neden bu kişi?", Cevapla / Geç. */
export function TurScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const query = useTurState();
  const now = useNow();
  const countdownText = useCountdownText();
  const [browseAgain, setBrowseAgain] = useState(false);
  const next = useNextTur(() => setBrowseAgain(false));
  const header = <HeaderActions />;

  if (query.isPending) {
    return (
      <Screen title={t('tur.heading')} testID="tur-loading">
        <View accessible accessibilityLabel={t('common.loading')} style={styles.gap}>
          <Skeleton height={8} width="40%" />
          <Skeleton height={420} radius={34} />
          <Skeleton height={56} />
        </View>
      </Screen>
    );
  }
  if (query.isError && query.data === undefined) {
    return (
      <Screen
        title={t('tur.heading')}
        subtitle={isOffline(query.error) ? t('common.offline') : t('tur.error')}
        testID="tur-error"
        footer={<Button label={t('common.retry')} onPress={() => void query.refetch()} />}
      />
    );
  }

  const offline = query.isError && isOffline(query.error);
  const mode = query.data?.mode ?? 'scheduled';
  const view = turView(query.data?.tur ?? null, now, mode);
  const offlineBanner = offline ? <Banner tone="warning" message={t('common.offline')} /> : null;

  if (view.kind === 'none') {
    return (
      <Screen title={t('tur.heading')} testID="tur-none" header={header}>
        {offlineBanner}
        <Card>
          <AppText variant="heading">{t('tur.noneTitle')}</AppText>
          <AppText tone="secondary">{t('tur.noneBody')}</AppText>
        </Card>
        <Button label={t('tur.openFilters')} onPress={() => router.push('/filters')} />
        <Button variant="ghost" label={t('tur.retry')} onPress={() => void query.refetch()} />
      </Screen>
    );
  }

  if (view.kind === 'waiting') {
    return (
      <Screen title={t('tur.heading')} testID="tur-waiting" header={header}>
        {offlineBanner}
        <Card>
          <AppText variant="heading">
            {t('tur.notOpenTitle', { time: openingTime(view.opensAt) })}
          </AppText>
          <AppText accessibilityLiveRegion="polite">{countdownText(now, view.opensAt)}</AppText>
          <AppText tone="secondary">{t('tur.notOpenBody')}</AppText>
        </Card>
      </Screen>
    );
  }

  if (view.kind === 'empty') {
    return (
      <Screen title={t('tur.heading')} testID="tur-empty" header={header}>
        {offlineBanner}
        <Card>
          <AppText variant="heading">{t('tur.emptyTitle')}</AppText>
          <AppText tone="secondary">{t('tur.emptyBody')}</AppText>
        </Card>
        <PoolHint tur={view.tur} />
        <Button label={t('tur.openFilters')} onPress={() => router.push('/filters')} />
      </Screen>
    );
  }

  if (view.kind === 'finished' && !browseAgain) {
    return (
      <Screen title={t('tur.finishedTitle')} testID="tur-finished" header={header}>
        {offlineBanner}
        {mode === 'on_demand' ? (
          <>
            <Card>
              <AppText tone="secondary">{t('tur.finishedOnDemand')}</AppText>
            </Card>
            <Button label={t('tur.next')} onPress={() => void next.run()} loading={next.pending} />
            <ErrorNotice error={next.error} />
          </>
        ) : (
          <Card>
            <AppText accessibilityLiveRegion="polite">{countdownText(now, view.nextAt)}</AppText>
            <AppText tone="secondary">
              {t('tur.finishedBody', { time: openingTime(view.nextAt) })}
            </AppText>
          </Card>
        )}
        <Button
          variant="secondary"
          label={t('tur.completeProfile')}
          onPress={() => router.push('/profile/details')}
        />
        <Button variant="ghost" label={t('tur.browseAgain')} onPress={() => setBrowseAgain(true)} />
      </Screen>
    );
  }

  return <TurCards tur={view.tur} offlineBanner={offlineBanner} />;
}

/** "Sıradaki 9 kişi": asks for the next Round and shows it at once. */
function useNextTur(onOpened: () => void) {
  const invalidate = useInvalidate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const run = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const r = await nextTur();
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await invalidate(TUR_KEY);
    onOpened();
  };
  return { run, pending, error };
}

function TurCards({ tur, offlineBanner }: { tur: Tur; offlineBanner: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, reduceMotion } = useTheme();
  const invalidate = useInvalidate();
  const me = useMyProfile();
  const { height } = useWindowDimensions();
  const [index, setIndex] = useState(() => firstOpenIndex(tur.cards));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const card = tur.cards[Math.min(index, tur.cards.length - 1)]!;
  const last = tur.cards.length - 1;
  const cardHeight = Math.max(420, Math.min(580, height * 0.62));
  const myName = me.data?.name ?? '';

  // Moving to another card clears the last card's error.
  const go = (i: number) => {
    setError(null);
    setIndex(Math.max(0, Math.min(last, i)));
  };

  const act = async (action: 'pass' | 'save' | 'unsave') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await cardAction(card.cardId, action);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await invalidate(TUR_KEY, SAVED_KEY);
    if (action !== 'unsave' && index < last) go(index + 1);
  };

  const entering = reduceMotion
    ? FadeIn.duration(motion.reducedCrossfade)
    : FadeInDown.springify().damping(18).stiffness(160);
  const exiting = reduceMotion
    ? FadeOut.duration(motion.reducedCrossfade)
    : SlideOutLeft.duration(320);

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.flex, { backgroundColor: colors.bgBase }]}
      testID="tur-cards"
    >
      <GlowBackdrop placement="center" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
            <FlameGradient style={StyleSheet.absoluteFill} />
            <AppText variant="heading">{myName.slice(0, 1).toLocaleUpperCase('tr')}</AppText>
          </View>
          <View style={styles.flex}>
            {myName ? (
              <AppText variant="caption" tone="secondary">
                {t('tur.hello', { name: myName })}
              </AppText>
            ) : null}
            <AppText variant="label" accessibilityRole="header">
              {t(`tur.titles.${tur.kind}`)} · {index + 1} / {tur.cards.length}
            </AppText>
          </View>
          <HeaderActions />
        </View>

        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={t('tur.position', { index: index + 1, total: tur.cards.length })}
          style={styles.segments}
          testID="tur-dots"
        >
          {tur.cards.map((c, i) => (
            <Pressable
              key={c.cardId}
              onPress={() => go(i)}
              accessibilityLabel={t('tur.goToCard', { index: i + 1 })}
              hitSlop={{ top: 12, bottom: 12 }}
              style={styles.segmentHit}
            >
              {isDecided(c) ? (
                <FlameGradient angle="horizontal" style={styles.segment} />
              ) : (
                <View
                  style={[
                    styles.segment,
                    {
                      backgroundColor: i === index ? colors.textPrimary : 'rgba(255,255,255,0.16)',
                    },
                  ]}
                />
              )}
            </Pressable>
          ))}
        </View>

        {offlineBanner ? <View style={styles.pad}>{offlineBanner}</View> : null}
        {tur.cards.length < TUR_SIZE ? (
          <View style={styles.pad}>
            <PoolHint tur={tur} />
          </View>
        ) : null}

        <Animated.View key={card.cardId} entering={entering} exiting={exiting}>
          <FlipCard card={card} height={cardHeight} />
        </Animated.View>

        {isDecided(card) ? (
          <View style={[styles.pad, styles.decided]}>
            <AppText tone="secondary" accessibilityLiveRegion="polite" testID="card-decided">
              {t(`tur.decided.${card.action}`)}
            </AppText>
            {card.action === 'saved' ? (
              <Button
                variant="ghost"
                label={t('tur.unsave')}
                onPress={() => void act('unsave')}
                disabled={busy}
              />
            ) : null}
          </View>
        ) : (
          <ActionPill
            busy={busy}
            saved={false}
            onPass={() => void act('pass')}
            onSave={() => void act('save')}
            onAnswer={() => router.push({ pathname: '/answer', params: { cardId: card.cardId } })}
          />
        )}

        <View style={styles.pad}>
          <ErrorNotice error={error} />
          <View style={styles.navRow}>
            <View style={styles.flex}>
              <Button
                variant="secondary"
                label={t('common.back')}
                onPress={() => go(index - 1)}
                disabled={index === 0}
              />
            </View>
            <View style={styles.flex}>
              <Button
                variant="secondary"
                label={t('common.next')}
                onPress={() => go(index + 1)}
                disabled={index >= last}
              />
            </View>
          </View>
          {card.profile ? <PublicProfileView profile={card.profile} below /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** §4.1: an honest small pool — never padded with people outside the filters. */
function PoolHint({ tur }: { tur: Tur }) {
  const { t } = useTranslation();
  const lines = [t('tur.small', { count: tur.cards.length })];
  if (tur.hint?.widerDistance)
    lines.push(t('tur.widerDistance', { count: tur.hint.widerDistance }));
  if (tur.hint?.widerAge) lines.push(t('tur.widerAge', { count: tur.hint.widerAge }));
  return <Banner message={lines.join(' ')} testID="pool-hint" />;
}

export type { TurCard };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space(2) },
  scroll: { paddingBottom: space(4), gap: space(1.75) },
  pad: { paddingHorizontal: space(2.5), gap: space(2) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    paddingHorizontal: space(2.5),
    paddingTop: space(1.5),
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', gap: space(1) },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: flame.chip,
    borderWidth: 1,
    borderColor: flame.glassBorder,
  },
  segments: { flexDirection: 'row', gap: 5, paddingHorizontal: space(3) },
  segmentHit: { flex: 1 },
  segment: { height: 3, borderRadius: 2 },
  decided: { alignItems: 'center', marginTop: space(1) },
  navRow: { flexDirection: 'row', gap: space(1.5) },
});
