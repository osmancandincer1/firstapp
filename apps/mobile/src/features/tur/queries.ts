import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useSession } from '@/features/auth/session';
import type { ApiResult } from '@/lib/api';
import { fetchInbox, fetchPreferences, listSaved, listTables, viewTur } from './api';

export const TUR_KEY = ['tur'] as const;
export const SAVED_KEY = ['tur-saved'] as const;
export const INBOX_KEY = ['inbox'] as const;
export const TABLES_KEY = ['tables'] as const;
export const PREFERENCES_KEY = ['preferences'] as const;

/** API errors travel as Error(code) so screens can tell "offline" from other failures. */
export class ApiError extends Error {}
async function unwrap<T>(p: Promise<ApiResult<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new ApiError(r.error);
  return r.data;
}

/** Signed media URLs live 10 minutes; refetch well before that. */
const MEDIA_STALE = 5 * 60_000;

function useUserQuery<T>(key: readonly string[], fn: () => Promise<T>, staleTime = MEDIA_STALE) {
  const userId = useSession((s) => s.userId);
  return useQuery({ queryKey: [...key, userId], queryFn: fn, enabled: Boolean(userId), staleTime });
}

/** The current Round and how Rounds are opened; servers without a mode are scheduled. */
export const useTurState = () =>
  useUserQuery(TUR_KEY, async () => {
    const r = await unwrap(viewTur());
    return { tur: r.tur, mode: r.mode ?? ('scheduled' as const) };
  });
/** Just the current Round (other screens look up cards in it). */
export function useTur() {
  const q = useTurState();
  return { ...q, data: q.data?.tur };
}
export const useSaved = () =>
  useUserQuery(SAVED_KEY, async () => (await unwrap(listSaved())).saved);
export const useInbox = () => useUserQuery(INBOX_KEY, () => unwrap(fetchInbox()));
/** The tables list and the Mola state, fetched together. */
export const useTablesState = () =>
  useUserQuery(
    TABLES_KEY,
    async () => {
      const r = await unwrap(listTables());
      return { tables: r.tables, pause: r.pause ?? null };
    },
    60_000,
  );
export function useTables() {
  const q = useTablesState();
  return { ...q, data: q.data?.tables };
}
export const useDiscoveryPreferences = () =>
  useUserQuery(PREFERENCES_KEY, fetchPreferences, 60_000);

/** True when the query failed because the device is offline (§8.2). */
export const isOffline = (error: unknown) =>
  error instanceof ApiError && error.message === 'network';

export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback(
    (...keys: (readonly string[])[]) =>
      Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey }))),
    [qc],
  );
}
