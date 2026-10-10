import { normalizeEmail } from '@nokuzo/shared';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input, Screen } from '@/components';
import { requestEmailCode } from '@/features/onboarding/api';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import { useApiAction } from '@/features/onboarding/useApiAction';

/** §6.1 step 3a: ask for the address and send a code. */
export function EmailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const valid = normalizeEmail(email) !== null;

  const onSent = useCallback(() => {
    router.push({ pathname: '/code', params: { channel: 'email', target: email.trim() } });
  }, [router, email]);
  const action = useApiAction(requestEmailCode, onSent);

  return (
    <Screen
      title={t('email.title')}
      testID="email"
      footer={
        <Button
          label={t('email.submit')}
          onPress={() => void action.run(email.trim())}
          disabled={!valid}
          loading={action.pending}
        />
      }
    >
      <Input
        label={t('email.label')}
        placeholder={t('email.placeholder')}
        help={t('email.help')}
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          action.clearError();
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
        maxLength={254}
      />
      <ErrorNotice error={action.error} />
    </Screen>
  );
}
