import { nextOnboardingStep, type OnboardingState, type OnboardingStep } from '@nokuzo/shared';
import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session';
import { supabase } from '@/lib/supabase';

export const ONBOARDING_QUERY_KEY = ['onboarding-state'] as const;

export interface ServerOnboardingState extends OnboardingState {
  phoneLast2: string | null;
  ageGateLockedUntil: string | null;
}

/** Reads where the signed-in user is in sign-up (server function my_onboarding_state). */
export async function fetchOnboardingState(): Promise<ServerOnboardingState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_onboarding_state');
  if (error) throw new Error(error.message);
  return (data as ServerOnboardingState | null) ?? null;
}

export function useOnboardingState() {
  const userId = useSession((s) => s.userId);
  return useQuery({
    queryKey: [...ONBOARDING_QUERY_KEY, userId],
    queryFn: fetchOnboardingState,
    enabled: Boolean(userId),
  });
}

export type Gate =
  | { kind: 'loading' }
  | { kind: 'not_configured' }
  | { kind: 'signed_out' }
  | { kind: 'error' }
  | { kind: 'blocked' }
  | { kind: 'step'; step: OnboardingStep };

/** Single place that decides which screen a user belongs on (AUTH-06: resume where you left). */
export function resolveGate(input: {
  configured: boolean;
  session: 'loading' | 'signed_in' | 'signed_out';
  query: { isPending: boolean; isError: boolean; data: ServerOnboardingState | null | undefined };
}): Gate {
  if (!input.configured) return { kind: 'not_configured' };
  if (input.session === 'loading') return { kind: 'loading' };
  if (input.session === 'signed_out') return { kind: 'signed_out' };
  if (input.query.isError) return { kind: 'error' };
  if (input.query.isPending) return { kind: 'loading' };
  if (!input.query.data) return { kind: 'error' };
  const next = nextOnboardingStep(input.query.data);
  return next.kind === 'blocked' ? { kind: 'blocked' } : next;
}

export const STEP_ROUTES: Record<OnboardingStep, string> = {
  phone: '/onboarding/phone',
  birth_date: '/onboarding/birth-date',
  consents: '/onboarding/consents',
  liveness: '/onboarding/liveness',
  needs_id: '/onboarding/needs-id',
  done: '/onboarding/done',
};
