import { parsePublicEnv } from '@nokuzo/shared';

/**
 * Client configuration. Only EXPO_PUBLIC_* variables reach the bundle, and each
 * must be referenced literally so Expo can inline it at build time.
 */
export const env = parsePublicEnv({
  APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
});
