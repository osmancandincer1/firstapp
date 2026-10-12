import { flame, radius, space } from '@nokuzo/design-tokens';
import { countdown, FREE_TABLE_SLOTS } from '@nokuzo/shared';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
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
  ChipGroup,
  EmptyState,
  FlameGradient,
  Screen,
  Sheet,
  Skeleton,
} from '@/components';
import { CoffeeIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { endPause, startPause } from '@/features/chat/api';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import { useMyProfile } from '@/features/profile/queries';
import type { PauseState, TableItem } from '@/features/tur/api';
import { isOffline, TABLES_KEY, useInvalidate, useTablesState } from '@/features/tur/queries';
import { useNow } from '@/features/tur/useNow';
import type { ApiResult, ClientErrorCode } from '@/lib/api';

/**
 * §8.1 #23 Masalar: the slots, active tables with "Sıra sende", the
 * "Masa bekliyor" queue, the archive (cooled, closed) and Mola.
 */
export function TablesScreen() {
  const { t } = useTranslation();
  const query = useTablesState();

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

  const list = query.data.tables;
  const active = list.filter((x) => x.status === 'active');
  const waiting = list.filter((x) => x.status === 'waiting_slot');
  const archive = list.filter((x) => x.status !== 'active' && x.status !== 'waiting_slot');

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
      {archive.length ? (
        <>
          <AppText variant="heading">{t('tables.archiveTitle')}</AppText>
          {archive.map((x) => (
            <TableRow key={x.tableId} table={x} />
          ))}
        </>
      ) : null}
      <MolaCard pause={query.data.pause} />
    </Screen>
  );
}

/** Mola (§4.4): a 1–7 day break that stops the reply clocks, at most twice a month. */
function MolaCard({ pause }: { pause: PauseState | null }) {
  const { t, i18n } = useTranslation();
  const me = useMyProfile();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('3');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  if (!pause) return null;

  const run = async (call: () => Promise<ApiResult<unknown>>) => {
    setBusy(true);
    setError(null);
    const r = await call();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    await invalidate(TABLES_KEY);
  };

  if (pause.until) {
    const date = new Date(pause.until).toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return (
      <Card testID="mola-active">
        <AppText>{t('mola.active', { date })}</AppText>
        <Button
          variant="secondary"
          label={t('mola.end')}
          loading={busy}
          onPress={() => void run(endPause)}
        />
        <ErrorNotice error={error} />
      </Card>
    );
  }
  return (
    <>
      <Button variant="ghost" label={t('mola.action')} onPress={() => setOpen(true)} />
      <Sheet visible={open} title={t('mola.title')} onClose={() => setOpen(false)}>
        <AppText tone="secondary">{t('mola.body', { name: me.data?.name ?? '' })}</AppText>
        <AppText variant="label">{t('mola.pick')}</AppText>
        <ChipGroup<string>
          label={t('mola.pick')}
          options={['1', '2', '3', '4', '5', '6', '7'].map((d) => ({
            value: d,
            label: t('mola.days', { count: Number(d) }),
          }))}
          selected={[days]}
          onToggle={setDays}
        />
        <AppText variant="caption" tone="secondary">
          {t('mola.used', { used: pause.usedThisMonth, max: pause.perMonth })}
        </AppText>
        <ErrorNotice error={error} />
        <Button
          label={t('mola.start')}
          loading={busy}
          disabled={pause.usedThisMonth >= pause.perMonth}
          onPress={() => void run(() => startPause(Number(days)))}
        />
      </Sheet>
    </>
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
  const router = useRouter();
  const now = useNow();
  const left =
    table.status === 'waiting_slot' && table.waitingExpiresAt
      ? countdown(now, new Date(table.waitingExpiresAt))
      : null;
  const archived = table.status !== 'active' && table.status !== 'waiting_slot';
  const name = table.profile?.name ?? t('inbox.someone');
  const last = table.lastMessage?.body
    ? table.lastMessage.mine
      ? t('tables.you', { text: table.lastMessage.body })
      : table.lastMessage.body
    : t('tables.noMessages');
  const unread = table.unread ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `${name}, ${t('tables.unread', { count: unread })}` : name}
      onPress={() => router.push({ pathname: '/table/[id]', params: { id: table.tableId } })}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Card testID="table-row" style={[styles.row, (left || archived) && styles.dimmed]}>
        <Avatar uri={table.profile?.photos?.[0]?.url} name={table.profile?.name} size={50} />
        <View style={styles.flex}>
          <View style={styles.between}>
            <AppText variant="label">{name}</AppText>
            {table.status === 'active' && table.myTurn ? (
              <TurnBadge label={t('tables.yourTurn')} />
            ) : archived ? (
              <AppText variant="caption" tone="secondary">
                {t(`tables.status.${table.status}`)}
              </AppText>
            ) : null}
          </View>
          <View style={styles.between}>
            <AppText
              variant="caption"
              tone={unread ? 'primary' : 'secondary'}
              numberOfLines={1}
              style={styles.flex}
            >
              {left ? t('tables.waitingLeft', left) : last}
            </AppText>
            {unread ? (
              <View style={styles.unread}>
                <FlameGradient style={StyleSheet.absoluteFill} />
                <AppText variant="caption" tone="onAccent">
                  {unread}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
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
  dimmed: { opacity: 0.85 },
  pressed: { opacity: 0.7 },
  between: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space(1),
  },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badge: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontFamily: 'Manrope_700Bold' },
});
