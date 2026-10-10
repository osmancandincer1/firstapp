import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Screen } from '@/components';

/**
 * §6.1 step 2. Apple and Google sign-in appear once their client ids are
 * configured (NEEDS_SETUP, docs/SETUP.md); Apple is then mandatory on iOS
 * whenever Google is offered (App Store 4.8, §18.1).
 */
export function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen title={t('signIn.title')} testID="sign-in">
      <Button label={t('signIn.email')} onPress={() => router.push('/email')} />
    </Screen>
  );
}
