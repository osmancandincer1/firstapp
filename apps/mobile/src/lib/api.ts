import { API_ERROR_CODES, type ApiErrorCode } from '@nokuzo/shared';

import { env } from './env';
import { supabase } from './supabase';

/** Client-side failures in addition to the server's codes. */
export type ClientErrorCode = ApiErrorCode | 'network' | 'not_configured';

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ClientErrorCode; retryAt?: string };

export interface CallOptions {
  /** Send the signed-in user's token (default true). */
  auth?: boolean;
  fetchFn?: typeof fetch;
}

const KNOWN = new Set<string>(API_ERROR_CODES);

/**
 * Calls an Edge Function and normalizes the outcome. Never throws: network
 * problems become `network` so screens can show the offline state (§8.2).
 */
export async function callFunction<T>(
  name: string,
  body: unknown,
  opts: CallOptions = {},
): Promise<ApiResult<T>> {
  if (!supabase || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)
    return { ok: false, error: 'not_configured' };
  let token = env.SUPABASE_ANON_KEY;
  if (opts.auth !== false) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { ok: false, error: 'not_authenticated' };
    token = data.session.access_token;
  }
  let res: Response;
  try {
    res = await (opts.fetchFn ?? fetch)(`${env.SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { ok: false, error: 'network' };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // fall through with null
  }
  if (res.ok) return { ok: true, data: json as T };
  const err = (json ?? {}) as { error?: string; retryAt?: string };
  const code = err.error && KNOWN.has(err.error) ? (err.error as ApiErrorCode) : 'internal';
  return { ok: false, error: code, ...(err.retryAt ? { retryAt: err.retryAt } : {}) };
}
