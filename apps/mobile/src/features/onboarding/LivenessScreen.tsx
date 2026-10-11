import { space } from '@nokuzo/design-tokens';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Banner, Button, Card } from '@/components';
import type { ApiResult } from '@/lib/api';
import { completeLiveness, startLiveness } from './api';
import { ErrorNotice } from './ErrorNotice';
import { OnboardingScreen } from './OnboardingScreen';
import { formatRetry, useAdvance } from './useAdvance';
import { useApiAction } from './useApiAction';

type Phase =
  | { kind: 'intro' }
  | { kind: 'mock'; sessionId: string }
  | { kind: 'native_missing' }
  | { kind: 'failed'; retryAt: string | null };

/**
 * §6.2. The real camera flow needs the AWS Face Liveness native module, which
 * is not built yet (NEEDS_SETUP: AWS account). Until then only the local mock
 * provider can complete this step, clearly marked as development.
 */
export function LivenessScreen({ reverify = false }: { reverify?: boolean }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const advance = useAdvance();
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });

  const onStarted = useCallback((data: { sessionId: string; provider: 'aws' | 'mock' }) => {
    setPhase(
      data.provider === 'mock'
        ? { kind: 'mock', sessionId: data.sessionId }
        : { kind: 'native_missing' },
    );
  }, []);
  const start = useApiAction(startLiveness, onStarted);

  const finish = useCallback(
    async (sessionId: string): Promise<ApiResult<{ outcome: string; retryAt?: string }>> =>
      completeLiveness(sessionId),
    [],
  );
  const onFinished = useCallback(
    async (data: { outcome: string; retryAt?: string }) => {
      if (data.outcome === 'blocked') router.replace('/blocked');
      else if (data.outcome === 'failed')
        setPhase({ kind: 'failed', retryAt: data.retryAt ?? null });
      else await advance();
    },
    [advance, router],
  );
  const complete = useApiAction(finish, onFinished);

  const cooldownUntil =
    start.error === 'liveness_cooldown'
      ? start.retryAt
      : phase.kind === 'failed'
        ? phase.retryAt
        : null;

  return (
    <OnboardingScreen
      step={reverify ? 'reverify' : 'liveness'}
      title={reverify ? t('profile.reverify.title') : t('liveness.title')}
      subtitle={
        reverify ? `${t('profile.reverify.body')} ${t('liveness.body')}` : t('liveness.body')
      }
      testID="liveness"
      footer={
        phase.kind === 'mock' ? (
          <Button
            label={t('liveness.devComplete')}
            onPress={() => void complete.run(phase.sessionId)}
            loading={complete.pending}
          />
        ) : (
          <Button
            label={t('liveness.start')}
            onPress={() => void start.run(undefined)}
            loading={start.pending}
            disabled={Boolean(cooldownUntil)}
          />
        )
      }
    >
      <View style={styles.tips}>
        {[0, 1, 2].map((i) => (
          <AppText key={i} tone="secondary">
            {`• ${t(`liveness.tips.${i}`)}`}
          </AppText>
        ))}
      </View>
      {phase.kind === 'mock' ? (
        <Card testID="liveness-dev">
          <AppText variant="label" tone="warning">
            {`${t('common.dev')} · ${t('liveness.devTitle')}`}
          </AppText>
          <AppText tone="secondary">{t('liveness.devBody')}</AppText>
        </Card>
      ) : null}
      {phase.kind === 'native_missing' ? (
        <Banner tone="warning" message={t('liveness.nativeMissing')} />
      ) : null}
      {cooldownUntil ? (
        <Banner
          tone="danger"
          message={t('liveness.cooldown', { time: formatRetry(cooldownUntil, i18n.language) })}
        />
      ) : phase.kind === 'failed' ? (
        <Banner tone="warning" message={t('liveness.failed')} />
      ) : null}
      {start.error !== 'liveness_cooldown' ? (
        <ErrorNotice error={start.error ?? complete.error} />
      ) : null}
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  tips: { gap: space(1) },
});
