/**
 * Sign-up step order (APP.md §6.1). The step is derived from what the server
 * already knows, so closing the app resumes at the same place (AUTH-06).
 * Steps after liveness (name, photos, …) arrive in Phase 2.
 */

export const ONBOARDING_STEPS = [
  'phone',
  'birth_date',
  'consents',
  'liveness',
  'needs_id',
  'done',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type AccountStatus = 'onboarding' | 'active' | 'paused' | 'suspended' | 'banned' | 'deleted';

export interface OnboardingState {
  status: AccountStatus;
  phoneVerified: boolean;
  birthDate: string | null;
  consentsComplete: boolean;
  livenessVerified: boolean;
  /** Liveness passed but the age estimate requires an ID document. */
  idRequired: boolean;
}

export type Gate =
  { kind: 'step'; step: OnboardingStep } | { kind: 'blocked'; status: AccountStatus };

export function nextOnboardingStep(s: OnboardingState): Gate {
  if (s.status === 'banned' || s.status === 'suspended' || s.status === 'deleted') {
    return { kind: 'blocked', status: s.status };
  }
  if (!s.phoneVerified) return { kind: 'step', step: 'phone' };
  if (!s.birthDate) return { kind: 'step', step: 'birth_date' };
  if (!s.consentsComplete) return { kind: 'step', step: 'consents' };
  if (s.idRequired) return { kind: 'step', step: 'needs_id' };
  if (!s.livenessVerified) return { kind: 'step', step: 'liveness' };
  return { kind: 'step', step: 'done' };
}

/** 1-based position for the progress bar (§6.1 "Her adımda ilerleme çubuğu"). */
export function onboardingProgress(step: OnboardingStep): { index: number; total: number } {
  const visible: OnboardingStep[] = ['phone', 'birth_date', 'consents', 'liveness'];
  const i = visible.indexOf(step === 'needs_id' ? 'liveness' : step);
  return { index: i === -1 ? visible.length : i + 1, total: visible.length };
}
