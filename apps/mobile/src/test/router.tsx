import { Text } from 'react-native';

/** Shared expo-router mock: `jest.mock('expo-router', () => require('@/test/router').routerMock)`. */
export const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
export const searchParams: { current: Record<string, string> } = { current: {} };

export const routerMock = {
  useRouter: () => router,
  useLocalSearchParams: () => searchParams.current,
  Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
};

export function resetRouter() {
  router.push.mockReset();
  router.replace.mockReset();
  router.back.mockReset();
  searchParams.current = {};
}
