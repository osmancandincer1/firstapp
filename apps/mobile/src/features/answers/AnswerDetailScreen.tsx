import { motion } from '@nokuzo/design-tokens';
import { RECIPROCATION_MAX } from '@nokuzo/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { AppText, Banner, Button, Card, Input, Screen } from '@/components';
import { useTheme } from '@/design/theme';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import type { ApiResult } from '@/lib/api';
import { passAnswer, reciprocate } from '@/features/tur/api';
import { PlayVoice, PublicProfileView } from '@/features/tur/PublicProfileView';
import { INBOX_KEY, TABLES_KEY, useInbox, useInvalidate } from '@/features/tur/queries';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

/** §8.1 #22: their answer and full profile; Karşılık ver opens a table, Geç is silent (§4.2). */
export function AnswerDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const inbox = useInbox();
  const invalidate = useInvalidate();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [opened, setOpened] = useState<'active' | 'waiting_slot' | null>(null);
  const answer = inbox.data?.incoming.find((a) => a.answerId === id);
  const lang = i18n.language === 'en' ? 'en' : 'tr';

  if (opened) return <TableOpened status={opened} />;

  if (!answer) {
    return (
      <Screen
        title={t('inbox.title')}
        subtitle={inbox.isPending ? t('common.loading') : t('inbox.gone')}
        testID="answer-detail-missing"
        footer={<Button label={t('common.back')} onPress={() => router.back()} />}
      />
    );
  }

  const run = async (
    call: () => Promise<ApiResult<{ ok: true; tableStatus?: 'active' | 'waiting_slot' }>>,
  ) => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const r = await call();
    setBusy(false);
    if (!r.ok) {
      setFailure(r);
      return;
    }
    await invalidate(INBOX_KEY, TABLES_KEY);
    if ('tableStatus' in r.data && r.data.tableStatus) setOpened(r.data.tableStatus);
    else router.back();
  };

  return (
    <Screen
      title={answer.profile?.name ?? t('inbox.someone')}
      testID="answer-detail"
      footer={
        <>
          <Button
            label={t('inbox.reciprocate')}
            onPress={() => void run(() => reciprocate(answer.answerId, message.trim()))}
            disabled={message.trim().length === 0}
            loading={busy}
          />
          <Button
            variant="ghost"
            label={t('inbox.pass')}
            accessibilityHint={t('inbox.passHint')}
            onPress={() => void run(() => passAnswer(answer.answerId))}
            disabled={busy}
          />
        </>
      }
    >
      <Card>
        {answer.question ? (
          <AppText variant="label" tone="secondary">
            {answer.question[lang]}
          </AppText>
        ) : null}
        {answer.text ? <AppText variant="heading">{`“${answer.text}”`}</AppText> : null}
        {answer.voiceUrl ? <PlayVoice url={answer.voiceUrl} label={t('inbox.playAnswer')} /> : null}
      </Card>
      <Input
        label={t('inbox.messageLabel')}
        help={t('inbox.messageHelp')}
        value={message}
        onChangeText={setMessage}
        maxLength={RECIPROCATION_MAX}
        multiline
        testID="reciprocate-message"
      />
      {failure?.error === 'text_blocked' ? (
        <Banner tone="danger" message={t(`profile.textBlocked.${failure.reason ?? 'profanity'}`)} />
      ) : (
        <ErrorNotice error={failure?.error ?? null} />
      )}
      {answer.profile ? <PublicProfileView profile={answer.profile} /> : null}
    </Screen>
  );
}

/** §8.1 #27 "Masa açıldı" moment; reduce motion turns it into a short cross-fade. */
function TableOpened({ status }: { status: 'active' | 'waiting_slot' }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { reduceMotion } = useTheme();
  const entering = reduceMotion
    ? FadeIn.duration(motion.reducedCrossfade)
    : ZoomIn.duration(motion.celebrateMin);
  return (
    <Screen
      title={t(status === 'active' ? 'inbox.openedTitle' : 'inbox.waitingTitle')}
      testID="table-opened"
      footer={
        <>
          <Button label={t('inbox.goTables')} onPress={() => router.replace('/tables')} />
          <Button variant="ghost" label={t('common.back')} onPress={() => router.back()} />
        </>
      }
    >
      <Animated.View entering={entering}>
        <Card>
          <AppText accessibilityLiveRegion="polite">
            {t(status === 'active' ? 'inbox.openedBody' : 'inbox.waitingBody')}
          </AppText>
        </Card>
      </Animated.View>
    </Screen>
  );
}
