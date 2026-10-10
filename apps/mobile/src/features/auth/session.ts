import type { SessionTokens } from '@nokuzo/shared';
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

type SessionStatus = 'loading' | 'signed_in' | 'signed_out';

interface SessionState {
  status: SessionStatus;
  userId: string | null;
  setSession: (session: Session | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: supabase ? 'loading' : 'signed_out',
  userId: null,
  setSession: (session) =>
    set({ status: session ? 'signed_in' : 'signed_out', userId: session?.user.id ?? null }),
}));

/** Keeps the store in sync with Supabase Auth. Returns an unsubscribe function. */
export function watchSession(): () => void {
  if (!supabase) return () => {};
  void supabase.auth
    .getSession()
    .then(({ data }) => useSession.getState().setSession(data.session));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    useSession.getState().setSession(session);
  });
  return () => data.subscription.unsubscribe();
}

/** Stores the session returned by email-otp-verify (the server minted it). */
export async function adoptSession(tokens: SessionTokens): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  return !error;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}
