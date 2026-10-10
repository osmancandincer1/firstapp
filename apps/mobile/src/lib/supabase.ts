import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { env } from './env';
import { secureStorage } from './secureStorage';

/**
 * The Supabase client, or null while the project is NEEDS_SETUP (no URL or
 * anon key). Screens show a "not configured" state instead of failing.
 */
export const supabase: SupabaseClient | null =
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY
    ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: {
          storage: secureStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

// Refresh tokens only while the app is in the foreground (Supabase React Native guidance).
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
