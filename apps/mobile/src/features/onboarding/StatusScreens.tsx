import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Screen } from '@/components';
import { signOut } from '@/features/auth/session';
import { SUPPORT_EMAIL } from '@/lib/constants';
import { env } from '@/lib/env';
import { OnboardingScreen } from './OnboardingScreen';

/** Liveness passed but the age estimate needs an ID document (§6.2). ID provider: NEEDS_SETUP. */
export function NeedsIdScreen() {
  const { t } = useTranslation();
  return (
    <OnboardingScreen
      step="needs_id"
      title={t('needsId.title')}
      subtitle={t('needsId.body')}
      testID="needs-id"
    >
      <AppText selectable>{t('needsId.support', { email: SUPPORT_EMAIL })}</AppText>
    </OnboardingScreen>
  );
}

/** End of Phase 1: the account is verified; profile steps arrive in Phase 2. */
export function DoneScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen
      title={t('done.title')}
      subtitle={t('done.body')}
      testID="done"
      footer={
        <>
          {env.APP_ENV !== 'production' ? (
            <Button
              variant="secondary"
              label={t('done.foundation')}
              onPress={() => router.push('/dev/foundation')}
            />
          ) : null}
          <Button variant="ghost" label={t('common.signOut')} onPress={() => void signOut()} />
        </>
      }
    />
  );
}

/**
 * Generic refusal (§7.5): never says which identifier was the problem. The
 * full ban screen with reason and appeal arrives in Phase 5.
 */
export function BlockedScreen() {
  const { t } = useTranslation();
  return (
    <Screen
      title={t('blocked.title')}
      subtitle={t('blocked.body', { email: SUPPORT_EMAIL })}
      testID="blocked"
      footer={<Button variant="ghost" label={t('common.signOut')} onPress={() => void signOut()} />}
    />
  );
}
