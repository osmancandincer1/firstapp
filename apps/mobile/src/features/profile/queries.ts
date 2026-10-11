import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useSession } from '@/features/auth/session';
import { ONBOARDING_QUERY_KEY } from '@/features/onboarding/gate';
import {
  fetchCities,
  fetchDistricts,
  fetchInterests,
  fetchMyProfile,
  fetchPresets,
  fetchVoicePrompts,
  viewProfile,
} from './api';

export const MY_PROFILE_KEY = ['my-profile'] as const;
export const PROFILE_VIEW_KEY = ['profile-view'] as const;

export function useMyProfile() {
  const userId = useSession((s) => s.userId);
  return useQuery({
    queryKey: [...MY_PROFILE_KEY, userId],
    queryFn: fetchMyProfile,
    enabled: Boolean(userId),
  });
}

/** Own media URLs and the public preview; refreshed often because signed URLs expire (PRO-05). */
export function useProfileView() {
  const userId = useSession((s) => s.userId);
  return useQuery({
    queryKey: [...PROFILE_VIEW_KEY, userId],
    queryFn: async () => {
      const r = await viewProfile();
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  });
}

const DAY = 24 * 60 * 60_000;
export const usePresets = () =>
  useQuery({ queryKey: ['presets'], queryFn: fetchPresets, staleTime: DAY });
export const useInterests = () =>
  useQuery({ queryKey: ['interests'], queryFn: fetchInterests, staleTime: DAY });
export const useVoicePrompts = () =>
  useQuery({ queryKey: ['voice-prompts'], queryFn: fetchVoicePrompts, staleTime: DAY });
export const useCities = () =>
  useQuery({ queryKey: ['cities'], queryFn: fetchCities, staleTime: DAY });
export const useDistricts = () =>
  useQuery({ queryKey: ['districts'], queryFn: fetchDistricts, staleTime: DAY });

/** Refreshes everything that depends on the profile after a change. */
export function useRefreshProfile() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: MY_PROFILE_KEY }),
      qc.invalidateQueries({ queryKey: PROFILE_VIEW_KEY }),
      qc.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY }),
    ]);
  }, [qc]);
}
