import { radius, space } from '@nokuzo/design-tokens';
import { countdown, FREE_TABLE_SLOTS } from '@nokuzo/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Banner, Button, Card, Screen, Skeleton } from '@/components';
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
      <Slots used={active.length} total={FREE_TABLE_SLOTS} />
      {active.length === 0 && waiting.length === 0 ? (
        <AppText tone="secondary" testID="tables-empty">
          {t('tables.empty')}
        </AppText>
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

function Slots({ used, total }: { used: number; total: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={t('tables.slots', { used, total })}
      style={styles.slots}
      testID="slots"
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.slot,
            { borderColor: colors.border },
            i < used && {
              backgroundColor: colors.accentPrimary,
              borderColor: colors.accentPrimary,
            },
          ]}
        />
      ))}
      <AppText variant="label" tone="secondary">
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
    <Card testID="table-row">
      <View style={styles.between}>
        <AppText variant="heading">{table.profile?.name ?? t('inbox.someone')}</AppText>
        {table.status === 'active' && table.myTurn ? (
          <AppText variant="label" tone="accent">
            {t('tables.yourTurn')}
          </AppText>
        ) : null}
      </View>
      <AppText variant="caption" tone="secondary">
        {left ? t('tables.waitingLeft', left) : t('tables.chatSoon')}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space(2) },
  slots: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  slot: { width: 36, height: 36, borderRadius: radius.sm, borderWidth: 2 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
