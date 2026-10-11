import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { router, resetRouter } from '@/test/router';
import { ONBOARDING_QUERY_KEY } from './gate';
import { useAdvance } from './useAdvance';

jest.mock('expo-router', () => require('@/test/router').routerMock);

/**
 * Regression: after the phone code was verified, the gate read the cached
 * "phone" step (the state query was not on screen, so invalidation did not
 * refetch it) and sent the user back to the phone screen.
 */
it('refetches the sign-up state, even when no screen is showing it, before going to the gate', async () => {
  resetRouter();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = [...ONBOARDING_QUERY_KEY, 'u1'];
  // As in the app, the cached query knows how to fetch the server state.
  client.setQueryDefaults(ONBOARDING_QUERY_KEY, { queryFn: () => ({ step: 'birth_date' }) });
  client.setQueryData(key, { step: 'phone' });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useAdvance(), { wrapper });

  router.replace.mockImplementation(() => {
    // The gate reads the cache the moment it mounts.
    expect(client.getQueryData(key)).toEqual({ step: 'birth_date' });
  });
  await act(() => result.current());
  expect(router.replace).toHaveBeenCalledWith('/');
});
