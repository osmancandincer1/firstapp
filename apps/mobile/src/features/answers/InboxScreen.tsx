import { space } from '@nokuzo/design-tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Banner, Button, Card, Screen, SegmentedControl, Skeleton } from '@/components';
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
          incoming.map((a) => <IncomingRow key={a.answerId} answer={a} />)
        ) : (
          <AppText tone="secondary" testID="inbox-empty">
            {t('inbox.emptyIncoming')}
          </AppText>
        )
      ) : outgoing.length ? (
        outgoing.map((a) => <OutgoingRow key={a.answerId} answer={a} />)
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

function IncomingRow({ answer: a }: { answer: IncomingAnswer }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const lang = i18n.language === 'en' ? 'en' : 'tr';
  return (
    <Card testID="incoming-row">
      <AppText variant="heading">
        {t('inbox.nameAge', { name: a.profile?.name ?? '', age: a.profile?.age ?? '' })}
      </AppText>
      {a.question ? (
        <AppText variant="caption" tone="secondary">
          {a.question[lang]}
        </AppText>
      ) : null}
      <AnswerBody text={a.text} voiceMs={a.voiceMs} />
      <Button
        variant="secondary"
        label={t('inbox.open')}
        onPress={() => router.push({ pathname: '/inbox/[id]', params: { id: a.answerId } })}
      />
    </Card>
  );
}

function OutgoingRow({ answer: a }: { answer: OutgoingAnswer }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'tr';
  return (
    <Card testID="outgoing-row">
      <View style={styles.between}>
        <AppText variant="heading">{a.profile?.name ?? t('inbox.someone')}</AppText>
        <AppText variant="label" tone={a.status === 'reciprocated' ? 'success' : 'secondary'}>
          {t(`inbox.status.${a.status}`)}
        </AppText>
      </View>
      {a.question ? (
        <AppText variant="caption" tone="secondary">
          {a.question[lang]}
        </AppText>
      ) : null}
      <AnswerBody text={a.text} voiceMs={a.voiceMs} />
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space(2) },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
