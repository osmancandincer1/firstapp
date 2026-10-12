import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from '@/design/theme';
import { useSession, watchSession } from '@/features/auth/session';
import i18n, { initI18n } from '@/i18n';
import { env } from '@/lib/env';
import { initSentry } from '@/lib/sentry';
import { usePreferences } from '@/stores/preferences';

initSentry(env);
initI18n(usePreferences.getState().language);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  const language = usePreferences((s) => s.language);

  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language]);

  useEffect(() => watchSession(), []);

  // A font failure falls back to system fonts instead of blocking the app.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemedStack />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Signing in or out sends the user back through the gate. */
function useSessionRedirect() {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current !== status && status !== 'loading') {
      queryClient.removeQueries({ queryKey: ['onboarding-state'] });
      router.replace('/');
    }
    previous.current = status;
  }, [status, router]);
}

function ThemedStack() {
  const { name, colors } = useTheme();
  useSessionRedirect();
  return (
    <>
      <StatusBar style={name === 'night' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgBase } }}
      />
    </>
  );
}
