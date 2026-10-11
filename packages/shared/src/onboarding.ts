/**
 * Sign-up step order (APP.md §6.1). The step is derived from what the server
 * already knows, so closing the app resumes at the same place (AUTH-06).
 *
 * §6.1 order: phone → birth date → consents → name/gender/seeking → liveness
 * → photos → intent → door question → interests → location → done.
 * Notification permission (step 14) arrives with push in Phase 7.
 */

export const ONBOARDING_STEPS = [
  'phone',
  'birth_date',
  'consents',
  'basics',
  'liveness',
  'needs_id',
  'photos',
  'intent',
  'door_question',
  'interests',
  'location',
  'reverify',
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
  basicsComplete?: boolean;
  photosComplete?: boolean;
  intentComplete?: boolean;
  doorQuestionComplete?: boolean;
  interestsComplete?: boolean;
  locationComplete?: boolean;
  /** The main photo changed after sign-up: liveness must be repeated (§6.2, VER-07). */
  reverifyRequired?: boolean;
}

export type Gate =
  { kind: 'step'; step: OnboardingStep } | { kind: 'blocked'; status: AccountStatus };

export function nextOnboardingStep(s: OnboardingState): Gate {
  if (s.status === 'banned' || s.status === 'suspended' || s.status === 'deleted') {
    return { kind: 'blocked', status: s.status };
  }
  if (s.reverifyRequired) return { kind: 'step', step: 'reverify' };
  if (s.status === 'active' || s.status === 'paused') return { kind: 'step', step: 'done' };
  if (!s.phoneVerified) return { kind: 'step', step: 'phone' };
  if (!s.birthDate) return { kind: 'step', step: 'birth_date' };
  if (!s.consentsComplete) return { kind: 'step', step: 'consents' };
  if (!s.basicsComplete) return { kind: 'step', step: 'basics' };
  if (s.idRequired) return { kind: 'step', step: 'needs_id' };
  if (!s.livenessVerified) return { kind: 'step', step: 'liveness' };
  if (!s.photosComplete) return { kind: 'step', step: 'photos' };
  if (!s.intentComplete) return { kind: 'step', step: 'intent' };
  if (!s.doorQuestionComplete) return { kind: 'step', step: 'door_question' };
  if (!s.interestsComplete) return { kind: 'step', step: 'interests' };
  if (!s.locationComplete) return { kind: 'step', step: 'location' };
  return { kind: 'step', step: 'done' };
}

const VISIBLE_STEPS: OnboardingStep[] = [
  'phone',
  'birth_date',
  'consents',
  'basics',
  'liveness',
  'photos',
  'intent',
  'door_question',
  'interests',
  'location',
];

/** 1-based position for the progress bar (§6.1 "Her adımda ilerleme çubuğu"). */
export function onboardingProgress(step: OnboardingStep): { index: number; total: number } {
  const mapped = step === 'needs_id' || step === 'reverify' ? 'liveness' : step;
  const i = VISIBLE_STEPS.indexOf(mapped);
  return { index: i === -1 ? VISIBLE_STEPS.length : i + 1, total: VISIBLE_STEPS.length };
}
