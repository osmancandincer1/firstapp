import { flame, radius, space } from '@nokuzo/design-tokens';
import { countdown, FREE_TABLE_SLOTS } from '@nokuzo/shared';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {
  AppText,
  Avatar,
  Banner,
  Button,
  Card,
  FlameGradient,
  Screen,
  Skeleton,
  EmptyState,
} from '@/components';
import { CoffeeIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import type { TableItem } from '@/features/tur/api';
import { isOffline, useTables } from '@/features/tur/queries';
import { useNow } from '@/features/tur/useNow';

/**
 * §8.1 #23 Masalar: the slots, active tables with "Sıra sende" and the
 * "Masa bekliyor" queue. Chat itself arrives in Phase 4.
 */
export function TablesScreen() {
  const { t } = useTranslation();
  const query = useTables();

  if (query.isPending) {
    return (
      <Screen title={t('tables.title')} testID="tables-loading">
        <View accessible accessibilityLabel={t('common.loading')} style={styles.gap}>
          <Skeleton height={48} />
          <Skeleton height={88} />
        </View>
      </Screen>
    );
  }
  if (query.isError && !query.data) {
    return (
      <Screen
        title={t('tables.title')}
        subtitle={isOffline(query.error) ? t('common.offline') : t('tables.error')}
        testID="tables-error"
        footer={<Button label={t('common.retry')} onPress={() => void query.refetch()} />}
      />
    );
  }

  const active = query.data.filter((x) => x.status === 'active');
  const waiting = query.data.filter((x) => x.status === 'waiting_slot');

  return (
    <Screen title={t('tables.title')} testID="tables">
      {query.isError && isOffline(query.error) ? (
        <Banner tone="warning" message={t('common.offline')} />
      ) : null}
      <Slots tables={active} total={FREE_TABLE_SLOTS} />
      {active.length === 0 && waiting.length === 0 ? (
        <EmptyState icon={CoffeeIcon} message={t('tables.empty')} testID="tables-empty" />
      ) : null}
      {active.map((x) => (
        <TableRow key={x.tableId} table={x} />
      ))}
      {waiting.length ? (
        <>
          <AppText variant="heading">{t('tables.waitingTitle')}</AppText>
          <AppText tone="secondary">{t('tables.waitingBody')}</AppText>
          {waiting.map((x) => (
            <TableRow key={x.tableId} table={x} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

/** Slot cards: who sits at each table, empty ones dashed; an ember line glows beneath. */
function Slots({ tables, total }: { tables: TableItem[]; total: number }) {
  const { t } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  const glow = useSharedValue(0.55);
  useEffect(() => {
    if (reduceMotion) {
      glow.set(0.85);
      return;
    }
    glow.set(
      withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    return () => cancelAnimation(glow);
  }, [reduceMotion, glow]);
  const ember = useAnimatedStyle(() => ({ opacity: glow.value }));
  const used = tables.length;

  return (
    <View style={styles.slotsBlock}>
      <View
        accessible
        accessibilityLabel={t('tables.slots', { used, total })}
        style={styles.slots}
        testID="slots"
      >
        {Array.from({ length: total }, (_, i) => {
          const table = tables.at(i);
          return table ? (
            <Card key={i} style={styles.slot}>
              <Avatar uri={table.profile?.photos?.[0]?.url} name={table.profile?.name} size={42} />
              <AppText variant="caption" numberOfLines={1}>
                {table.profile?.name ?? ''}
              </AppText>
            </Card>
          ) : (
            <View key={i} style={[styles.slot, styles.emptySlot, { borderColor: colors.border }]}>
              <AppText variant="heading" tone="secondary">
                +
              </AppText>
              <AppText variant="caption" tone="secondary">
                {t('tables.emptySlot')}
              </AppText>
            </View>
          );
        })}
      </View>
      <Animated.View style={[styles.ember, ember]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(255,138,42,0)', flame.start, flame.end, 'rgba(226,65,47,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <AppText variant="caption" tone="secondary" style={styles.slotsCaption}>
        {t('tables.slots', { used, total })}
      </AppText>
    </View>
  );
}

function TableRow({ table }: { table: TableItem }) {
  const { t } = useTranslation();
  const now = useNow();
  const left =
    table.status === 'waiting_slot' && table.waitingExpiresAt
      ? countdown(now, new Date(table.waitingExpiresAt))
      : null;
  return (
    <Card testID="table-row" style={[styles.row, left ? styles.waitingRow : null]}>
      <Avatar uri={table.profile?.photos?.[0]?.url} name={table.profile?.name} size={50} />
      <View style={styles.flex}>
        <View style={styles.between}>
          <AppText variant="label">{table.profile?.name ?? t('inbox.someone')}</AppText>
          {table.status === 'active' && table.myTurn ? (
            <TurnBadge label={t('tables.yourTurn')} />
          ) : null}
        </View>
        <AppText variant="caption" tone="secondary">
          {left ? t('tables.waitingLeft', left) : t('tables.chatSoon')}
        </AppText>
      </View>
    </Card>
  );
}

/** "Sıra sende": a flame pill that breathes softly (still with reduce motion). */
function TurnBadge({ label }: { label: string }) {
  const { reduceMotion } = useTheme();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.set(
      withRepeat(withTiming(1.06, { duration: 1200, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    return () => cancelAnimation(pulse);
  }, [reduceMotion, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View style={[styles.badge, style]}>
      <FlameGradient angle="horizontal" style={StyleSheet.absoluteFill} />
      <AppText variant="caption" tone="onAccent" style={styles.badgeText}>
        {label}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space(2) },
  flex: { flex: 1, gap: 2 },
  slotsBlock: { gap: space(1) },
  slots: { flexDirection: 'row', gap: space(1.25) },
  slot: { flex: 1, height: 100, alignItems: 'center', justifyContent: 'center', gap: space(0.75) },
  emptySlot: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.lg },
  ember: { height: 3, borderRadius: 2, overflow: 'hidden' },
  slotsCaption: { textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  waitingRow: { opacity: 0.85 },
  between: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space(1),
  },
  badge: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontFamily: 'Manrope_700Bold' },
});
