import { isOtpFormat, OTP_LENGTH } from '@nokuzo/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Input, Screen } from '@/components';
import { adoptSession } from '@/features/auth/session';
import {
  requestEmailCode,
  requestPhoneCode,
  verifyEmailCode,
  verifyPhoneCode,
} from '@/features/onboarding/api';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import { useAdvance } from '@/features/onboarding/useAdvance';
import { useApiAction } from '@/features/onboarding/useApiAction';
import type { ApiResult } from '@/lib/api';

export const RESEND_SECONDS = 60;

type Channel = 'email' | 'phone';

/** Shared "enter the 6-digit code" screen for email (§6.1 step 3) and phone (step 4). */
export function CodeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const advance = useAdvance();
  const params = useLocalSearchParams<{ channel?: string; target?: string }>();
  const channel: Channel = params.channel === 'phone' ? 'phone' : 'email';
  const target = params.target ?? '';
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const verify = useCallback(
    async (c: string): Promise<ApiResult<unknown>> => {
      if (channel === 'phone') return verifyPhoneCode({ phone: target, code: c });
      const r = await verifyEmailCode({ email: target, code: c });
      if (r.ok && !(await adoptSession(r.data.session))) return { ok: false, error: 'internal' };
      return r;
    },
    [channel, target],
  );
  const verifyAction = useApiAction(verify, advance);

  const resend = useCallback(
    () => (channel === 'phone' ? requestPhoneCode(target) : requestEmailCode(target)),
    [channel, target],
  );
  const onResent = useCallback(() => {
    setResent(true);
    setSeconds(RESEND_SECONDS);
  }, []);
  const resendAction = useApiAction(resend, onResent);

  const error = verifyAction.error ?? resendAction.error;

  return (
    <Screen
      title={t('code.title')}
      subtitle={t(channel === 'phone' ? 'code.phoneSubtitle' : 'code.emailSubtitle', { target })}
      testID="code"
      footer={
        <>
          <Button
            label={t('code.submit')}
            onPress={() => void verifyAction.run(code)}
            disabled={!isOtpFormat(code)}
            loading={verifyAction.pending}
          />
          <Button
            variant="ghost"
            label={seconds > 0 ? t('code.resendIn', { seconds }) : t('code.resend')}
            onPress={() => void resendAction.run(undefined)}
            disabled={seconds > 0}
            loading={resendAction.pending}
          />
          <Button variant="ghost" label={t('code.change')} onPress={() => router.back()} />
        </>
      }
    >
      <Input
        label={t('code.label')}
        value={code}
        onChangeText={(v) => {
          setCode(v.replace(/\D/g, '').slice(0, OTP_LENGTH));
          verifyAction.clearError();
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={channel === 'phone' ? 'sms-otp' : 'one-time-code'}
        maxLength={OTP_LENGTH}
      />
      {resent && !error ? <Banner message={t('code.resent')} /> : null}
      <ErrorNotice error={error} />
    </Screen>
  );
}
