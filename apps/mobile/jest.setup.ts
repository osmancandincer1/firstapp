// Reanimated 4 runs worklets natively; tests use the libraries' own mocks.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// expo-localization reads the device locale natively; tests pin it to Turkish.
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'tr', languageTag: 'tr-TR' }],
}));

// In-memory secure store shared by a test file; cleared with `__reset()`.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    setItemAsync: jest.fn((k: string, v: string) => Promise.resolve(void store.set(k, v))),
    deleteItemAsync: jest.fn((k: string) => Promise.resolve(void store.delete(k))),
    __reset: () => store.clear(),
  };
});

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '0.1.0',
  getAndroidId: () => 'android-test-id',
  getIosIdForVendorAsync: () => Promise.resolve('ios-test-id'),
}));

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000000' }));

// Async queries (findBy*, waitFor) wait up to 3 s: the default 1 s is flaky when
// the machine or CI runner is busy, and a passing test returns as soon as it can.
require('@testing-library/react-native').configure({ asyncUtilTimeout: 3000 });
