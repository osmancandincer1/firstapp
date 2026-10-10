import { normalizePhone } from '@nokuzo/shared';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input } from '@/components';
import { requestPhoneCode } from './api';
import { ErrorNotice } from './ErrorNotice';
import { OnboardingScreen } from './OnboardingScreen';
import { useApiAction } from './useApiAction';

/** §6.1 step 4: mobile number (+90 only at launch), then an SMS code. */
export function PhoneScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const e164 = normalizePhone(phone);

  const onSent = useCallback(() => {
    router.push({ pathname: '/code', params: { channel: 'phone', target: e164 ?? phone } });
  }, [router, e164, phone]);
  const action = useApiAction(requestPhoneCode, onSent);

  return (
    <OnboardingScreen
      step="phone"
      title={t('phone.title')}
      subtitle={t('phone.subtitle')}
      testID="phone"
      footer={
        <Button
          label={t('phone.submit')}
          onPress={() => void action.run(e164 ?? phone)}
          disabled={!e164}
          loading={action.pending}
        />
      }
    >
      <Input
        label={t('phone.label')}
        placeholder={t('phone.placeholder')}
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          action.clearError();
        }}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={20}
      />
      <ErrorNotice error={action.error} />
    </OnboardingScreen>
  );
}
