import type { OnboardingStep, ProfileUpdate } from '@nokuzo/shared';
import { useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { View } from 'react-native';

import { Banner, Button, Screen, Skeleton } from '@/components';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { useAdvance } from '@/features/onboarding/useAdvance';
import type { ClientErrorCode } from '@/lib/api';
import { updateSection } from './api';
import { useRefreshProfile } from './queries';

export type FormMode = 'onboarding' | 'edit';

export interface ProfileFormScreenProps {
  mode: FormMode;
  step: OnboardingStep;
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children?: ReactNode;
  testID?: string;
  /** While the saved profile loads, show placeholders instead of an empty form. */
  loading?: boolean;
}

/** Same form inside sign-up (with progress) and in "edit profile" (with a back button). */
export function ProfileFormScreen({
  mode,
  step,
  footer,
  loading,
  children,
  ...rest
}: ProfileFormScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const body = loading ? (
    <View accessible accessibilityLabel={t('common.loading')} testID="form-loading">
      <Skeleton height={48} />
    </View>
  ) : (
    children
  );
  if (mode === 'onboarding') {
    return (
      <OnboardingScreen step={step} footer={footer} {...rest}>
        {body}
      </OnboardingScreen>
    );
  }
  return (
    <Screen
      {...rest}
      footer={
        <>
          {footer}
          <Button variant="ghost" label={t('common.back')} onPress={() => router.back()} />
        </>
      }
    >
      {body}
    </Screen>
  );
}

export interface SaveError {
  error: ClientErrorCode;
  field?: string;
  reason?: string;
}

/**
 * Saves one profile section. In sign-up a success moves on to the next step;
 * in edit mode it goes back. Text held for review (PRO-08) stays on screen
 * with a notice instead of moving on.
 */
export function useSaveSection(mode: FormMode) {
  const router = useRouter();
  const advance = useAdvance();
  const refresh = useRefreshProfile();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SaveError | null>(null);
  const [heldForReview, setHeld] = useState(false);

  const save = useCallback(
    async (update: ProfileUpdate) => {
      if (pending) return false;
      setPending(true);
      setError(null);
      const r = await updateSection(update);
      setPending(false);
      if (!r.ok) {
        setError({
          error: r.error,
          ...(r.field ? { field: r.field } : {}),
          ...(r.reason ? { reason: r.reason } : {}),
        });
        return false;
      }
      await refresh();
      if (r.data.pending) {
        setHeld(true);
        return true;
      }
      if (mode === 'onboarding') await advance();
      else router.back();
      return true;
    },
    [pending, refresh, mode, advance, router],
  );

  return { save, pending, error, heldForReview, clearError: () => setError(null) };
}

/** Error banner that also explains moderation refusals (§7.2: the reason is always shown). */
export function SaveNotice({
  error,
  heldForReview,
}: {
  error: SaveError | null;
  heldForReview?: boolean;
}) {
  const { t } = useTranslation();
  if (error?.error === 'text_blocked' && error.reason) {
    return (
      <Banner
        tone="danger"
        message={t(`profile.textBlocked.${error.reason}`)}
        testID="text-blocked"
      />
    );
  }
  if (error) return <ErrorNotice error={error.error} />;
  if (heldForReview)
    return <Banner tone="info" message={t('profile.pendingReview')} testID="held-for-review" />;
  return null;
}
