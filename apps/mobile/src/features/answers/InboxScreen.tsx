import { space } from '@nokuzo/design-tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  AppText,
  Avatar,
  Banner,
  Button,
  Card,
  Screen,
  SegmentedControl,
  Skeleton,
} from '@/components';
import { useTheme } from '@/design/theme';
import type { IncomingAnswer, OutgoingAnswer } from '@/features/tur/api';
import { isOffline, useInbox } from '@/features/tur/queries';

type Tab = 'incoming' | 'outgoing';

/** §8.1 #21 Cevaplar: incoming (full profile, free — §4.2) and sent with their status. */
export function InboxScreen() {
  const { t } = useTranslation();
  const query = useInbox();
  const [tab, setTab] = useState<Tab>('incoming');

  if (query.isPending) {
    return (
      <Screen title={t('inbox.title')} testID="inbox-loading">
        <View accessible accessibilityLabel={t('common.loading')} style={styles.gap}>
          <Skeleton height={96} />
          <Skeleton height={96} />
        </View>
      </Screen>
    );
  }
  if (query.isError && !query.data) {
    return (
      <Screen
        title={t('inbox.title')}
        subtitle={isOffline(query.error) ? t('common.offline') : t('inbox.error')}
        testID="inbox-error"
        footer={<Button label={t('common.retry')} onPress={() => void query.refetch()} />}
      />
    );
  }

  const incoming = query.data.incoming;
  const outgoing = query.data.outgoing;

  return (
    <Screen title={t('inbox.title')} testID="inbox">
      {query.isError && isOffline(query.error) ? (
        <Banner tone="warning" message={t('common.offline')} />
      ) : null}
      <SegmentedControl<Tab>
        label={t('inbox.title')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'incoming', label: t('inbox.incoming', { count: incoming.length }) },
          { value: 'outgoing', label: t('inbox.outgoing') },
        ]}
      />
      {tab === 'incoming' ? (
        incoming.length ? (
          incoming.map((a, i) => <IncomingRow key={a.answerId} answer={a} index={i} />)
        ) : (
          <AppText tone="secondary" testID="inbox-empty">
            {t('inbox.emptyIncoming')}
          </AppText>
        )
      ) : outgoing.length ? (
        outgoing.map((a, i) => <OutgoingRow key={a.answerId} answer={a} index={i} />)
      ) : (
        <AppText tone="secondary" testID="outbox-empty">
          {t('inbox.emptyOutgoing')}
        </AppText>
      )}
    </Screen>
  );
}

function AnswerBody({ text, voiceMs }: { text: string | null; voiceMs: number | null }) {
  const { t } = useTranslation();
  return text ? (
    <AppText>{`“${text}”`}</AppText>
  ) : (
    <AppText tone="secondary">
      {t('inbox.voiceAnswer', { seconds: Math.round((voiceMs ?? 0) / 1000) })}
    </AppText>
  );
}

function useRowEntering(index: number) {
  const { reduceMotion } = useTheme();
  return reduceMotion
    ? undefined
    : FadeInDown.delay(index * 70)
        .springify()
        .damping(18);
}

function IncomingRow({ answer: a, index }: { answer: IncomingAnswer; index: number }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const lang = i18n.language === 'en' ? 'en' : 'tr';
  const entering = useRowEntering(index);
  return (
    <Animated.View entering={entering}>
      <Card testID="incoming-row" style={styles.row}>
        <View style={styles.rowHead}>
          <Avatar
            uri={a.profile?.photos?.[0]?.url}
            name={a.profile?.name}
            size={54}
            shape="portrait"
          />
          <View style={styles.flex}>
            <AppText variant="heading">
              {t('inbox.nameAge', { name: a.profile?.name ?? '', age: a.profile?.age ?? '' })}
            </AppText>
            {a.question ? (
              <AppText variant="caption" tone="secondary" numberOfLines={2}>
                {a.question[lang]}
              </AppText>
            ) : null}
          </View>
        </View>
        <AnswerBody text={a.text} voiceMs={a.voiceMs} />
        <Button
          label={t('inbox.open')}
          onPress={() => router.push({ pathname: '/inbox/[id]', params: { id: a.answerId } })}
        />
      </Card>
    </Animated.View>
  );
}

function OutgoingRow({ answer: a, index }: { answer: OutgoingAnswer; index: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const entering = useRowEntering(index);
  const status = {
    waiting: { bg: 'rgba(255,255,255,0.08)', fg: colors.textSecondary },
    reciprocated: { bg: 'rgba(107,211,154,0.16)', fg: colors.success },
    dropped: { bg: 'rgba(255,255,255,0.04)', fg: colors.textSecondary },
  }[a.status];
  return (
    <Animated.View entering={entering}>
      <Card testID="outgoing-row" style={styles.outRow}>
        <Avatar uri={a.profile?.photos?.[0]?.url} name={a.profile?.name} size={46} />
        <View style={styles.flex}>
          <AppText variant="label">{a.profile?.name ?? t('inbox.someone')}</AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {a.text
              ? `“${a.text}”`
              : t('inbox.voiceAnswer', { seconds: Math.round((a.voiceMs ?? 0) / 1000) })}
          </AppText>
        </View>
        <View style={[styles.status, { backgroundColor: status.bg }]}>
          <AppText variant="caption" style={[styles.statusText, { color: status.fg }]}>
            {t(`inbox.status.${a.status}`)}
          </AppText>
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space(2) },
  flex: { flex: 1, gap: 2 },
  row: { gap: space(1.5) },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  outRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  status: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  statusText: { fontFamily: 'Manrope_600SemiBold' },
});
