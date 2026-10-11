import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { ONBOARDING_QUERY_KEY } from './gate';

/**
 * After a step succeeds: refresh the server state and let the gate pick the
 * next screen. `refetchType: 'all'` also refetches the state when no screen is
 * showing it (e.g. the code screen); otherwise the gate would read the cached,
 * previous step and send the user back to it.
 */
export function useAdvance() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY, refetchType: 'all' });
    router.replace('/');
  }, [queryClient, router]);
}

/** Formats a retry time for messages such as "you can try again at …". */
export function formatRetry(iso: string | null, language: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'tr-TR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
