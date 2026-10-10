// Reanimated 4 runs worklets natively; tests use the libraries' own mocks.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// expo-localization reads the device locale natively; tests pin it to Turkish.
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'tr', languageTag: 'tr-TR' }],
}));
