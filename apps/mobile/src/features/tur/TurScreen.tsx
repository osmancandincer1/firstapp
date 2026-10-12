import { motion, space } from '@nokuzo/design-tokens';
import { LESS_LIKE_THIS_KEYS, TUR_SIZE } from '@nokuzo/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FlipInEasyY } from 'react-native-reanimated';

import { AppText, Banner, Button, Card, Screen, Sheet, Skeleton } from '@/components';
import { useTheme } from '@/design/theme';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import type { ClientErrorCode } from '@/lib/api';
import { cardAction, lessLikeThis, nextTur, type Tur, type TurCard } from './api';
import { PublicProfileView } from './PublicProfileView';
import { isOffline, SAVED_KEY, TUR_KEY, useInvalidate, useTurState } from './queries';
import {
  firstOpenIndex,
  isDecided,
  openingTime,
  turView,
  useCountdownText,
  useReasonText,
} from './turState';
import { useNow } from './useNow';

/** §8.1 #18 Tur: up to 9 cards, free back-and-forth, "Neden bu kişi?", Cevapla / Geç. */
export function TurScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const query = useTurState();
  const now = useNow();
  const countdownText = useCountdownText();
  const [browseAgain, setBrowseAgain] = useState(false);
  const next = useNextTur(() => setBrowseAgain(false));

  const header = (
    <View style={styles.headerRow}>
      <Button variant="ghost" label={t('tur.filters')} onPress={() => router.push('/filters')} />
      <Button variant="ghost" label={t('tur.saved')} onPress={() => router.push('/saved')} />
    </View>
  );

  if (query.isPending) {
    return (
      <Screen title={t('tur.heading')} testID="tur-loading">
        <View accessible accessibilityLabel={t('common.loading')} style={styles.gap}>
          <Skeleton height={8} width="40%" />
          <Skeleton height={320} />
          <Skeleton height={48} />
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

  return <TurCards tur={view.tur} header={header} offlineBanner={offlineBanner} />;
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

function TurCards({
  tur,
  header,
  offlineBanner,
}: {
  tur: Tur;
  header: React.ReactNode;
  offlineBanner: React.ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const invalidate = useInvalidate();
  const [index, setIndex] = useState(() => firstOpenIndex(tur.cards));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const card = tur.cards[Math.min(index, tur.cards.length - 1)]!;
  const last = tur.cards.length - 1;

  // Moving to another card clears the last card's error.
  const go = (i: number) => {
    setError(null);
    setIndex(i);
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

  return (
    <Screen
      title={t(`tur.titles.${tur.kind}`)}
      testID="tur-cards"
      header={header}
      footer={
        isDecided(card) ? (
          <AppText tone="secondary" accessibilityLiveRegion="polite" testID="card-decided">
            {t(`tur.decided.${card.action}`)}
          </AppText>
        ) : (
          <>
            <Button
              label={t('tur.answer')}
              onPress={() => router.push({ pathname: '/answer', params: { cardId: card.cardId } })}
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button
                  variant="secondary"
                  label={t('tur.pass')}
                  onPress={() => void act('pass')}
                  disabled={busy}
                />
              </View>
              <View style={styles.flex}>
                <Button
                  variant="ghost"
                  label={t('tur.save')}
                  onPress={() => void act('save')}
                  disabled={busy}
                />
              </View>
            </View>
          </>
        )
      }
    >
      {offlineBanner}
      {tur.cards.length < TUR_SIZE ? <PoolHint tur={tur} /> : null}
      <Dots count={tur.cards.length} index={index} cards={tur.cards} />
      <CardFace card={card} key={card.cardId} />
      {card.action === 'saved' ? (
        <Button
          variant="ghost"
          label={t('tur.unsave')}
          onPress={() => void act('unsave')}
          disabled={busy}
        />
      ) : null}
      <ErrorNotice error={error} />
      <View style={styles.row}>
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
    </Screen>
  );
}

/** Position indicator (9 dots); decided cards are filled, the current one is larger. */
function Dots({ count, index, cards }: { count: number; index: number; cards: TurCard[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('tur.position', { index: index + 1, total: count })}
      style={styles.dots}
      testID="tur-dots"
    >
      {cards.map((c, i) => (
        <View
          key={c.cardId}
          style={[
            styles.dot,
            i === index && styles.dotCurrent,
            { backgroundColor: isDecided(c) || i === index ? colors.accentPrimary : colors.border },
          ]}
        />
      ))}
    </View>
  );
}

/** Front: the profile. Back: "Neden bu kişi?" (flips; reduce motion swaps instantly). */
function CardFace({ card }: { card: TurCard }) {
  const { t } = useTranslation();
  const { reduceMotion } = useTheme();
  const [back, setBack] = useState(false);
  const entering = reduceMotion
    ? FadeIn.duration(motion.reducedCrossfade)
    : FlipInEasyY.duration(motion.durationSlow);

  return (
    <View style={styles.gap}>
      <Button
        variant="ghost"
        label={back ? t('tur.showProfile') : t('tur.why')}
        onPress={() => setBack(!back)}
        accessibilityHint={t('tur.whyHint')}
      />
      {back ? (
        <Animated.View entering={entering} key="back">
          <WhyThisPerson card={card} />
        </Animated.View>
      ) : (
        <Animated.View entering={entering} key="front">
          {card.profile ? (
            <PublicProfileView profile={card.profile} />
          ) : (
            <AppText tone="secondary">{t('tur.unavailable')}</AppText>
          )}
        </Animated.View>
      )}
    </View>
  );
}

function WhyThisPerson({ card }: { card: TurCard }) {
  const { t } = useTranslation();
  const { reason, difference } = useReasonText();
  const [sheet, setSheet] = useState(false);
  const [done, setDone] = useState(false);
  const reasons = card.reasons.reasons ?? [];
  const lessKeys = (card.reasons.all ?? []).filter((k) =>
    (LESS_LIKE_THIS_KEYS as readonly string[]).includes(k),
  );

  const less = async (key: string) => {
    setSheet(false);
    const r = await lessLikeThis(key);
    if (r.ok) setDone(true);
  };

  return (
    <Card testID="why">
      <AppText variant="heading">{t('tur.why')}</AppText>
      {reasons.length ? (
        reasons.map((r) => <AppText key={r.key}>{`• ${reason(r)}`}</AppText>)
      ) : (
        <AppText tone="secondary">{t('tur.noReasons')}</AppText>
      )}
      {card.reasons.difference ? (
        <AppText tone="secondary">{difference(card.reasons.difference)}</AppText>
      ) : null}
      <AppText variant="caption" tone="secondary">
        {t('tur.howItWorks')}
      </AppText>
      {done ? (
        <AppText tone="success" accessibilityLiveRegion="polite">
          {t('tur.lessDone')}
        </AppText>
      ) : lessKeys.length ? (
        <Button variant="ghost" label={t('tur.lessLikeThis')} onPress={() => setSheet(true)} />
      ) : null}
      <Sheet visible={sheet} title={t('tur.lessQuestion')} onClose={() => setSheet(false)}>
        {lessKeys.map((k) => (
          <Button
            key={k}
            variant="secondary"
            label={t(`tur.less.${k}`)}
            onPress={() => void less(k)}
          />
        ))}
      </Sheet>
    </Card>
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

const styles = StyleSheet.create({
  gap: { gap: space(2) },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space(1.5) },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: space(1), alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 6 },
  dotCurrent: { width: 12, height: 12 },
});
