import { onboardingProgress, type OnboardingStep } from '@nokuzo/shared';
import { useTranslation } from 'react-i18next';

import { Button, Screen, StepProgress, type ScreenProps } from '@/components';
import { signOut } from '@/features/auth/session';

/** Screen with the sign-up progress dots and a way out (sign out) on every step. */
export function OnboardingScreen({
  step,
  footer,
  ...rest
}: ScreenProps & { step: OnboardingStep }) {
  const { t } = useTranslation();
  const { index, total } = onboardingProgress(step);
  return (
    <Screen
      {...rest}
      header={<StepProgress index={index} total={total} />}
      footer={
        <>
          {footer}
          <Button variant="ghost" label={t('common.signOut')} onPress={() => void signOut()} />
        </>
      }
    />
  );
}
