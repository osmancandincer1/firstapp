import { API_ERROR_CODES, type ApiErrorCode } from '@nokuzo/shared';

import { env } from './env';
import { supabase } from './supabase';

/** Client-side failures in addition to the server's codes. */
export type ClientErrorCode = ApiErrorCode | 'network' | 'not_configured';

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ClientErrorCode; retryAt?: string; field?: string; reason?: string };

export interface CallOptions {
  /** Send the signed-in user's token (default true). */
  auth?: boolean;
  fetchFn?: typeof fetch;
}

const KNOWN = new Set<string>(API_ERROR_CODES);

const SIGNED_STORAGE = /^https?:\/\/[^/]+(\/storage\/v1\/object\/sign\/.*)$/;

/**
 * Local development only: Edge Functions run inside Docker and sign storage
 * URLs with the internal host (http://kong:8000), which a phone cannot reach.
 * Signed storage URLs are pointed at the app's own Supabase URL instead.
 * Hosted Supabase already signs with the public URL, so nothing changes there.
 */
export function localMediaUrls<T>(value: T, base: string): T {
  if (typeof value === 'string') {
    const m = SIGNED_STORAGE.exec(value);
    return (m ? `${base}${m[1]}` : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => localMediaUrls(v, base)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, localMediaUrls(v, base)]),
    ) as T;
  }
  return value;
}

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
  if (res.ok) {
    const data = env.APP_ENV === 'local' ? localMediaUrls(json, env.SUPABASE_URL) : json;
    return { ok: true, data: data as T };
  }
  const err = (json ?? {}) as { error?: string; retryAt?: string; field?: string; reason?: string };
  const code = err.error && KNOWN.has(err.error) ? (err.error as ApiErrorCode) : 'internal';
  return {
    ok: false,
    error: code,
    ...(err.retryAt ? { retryAt: err.retryAt } : {}),
    ...(err.field ? { field: err.field } : {}),
    ...(err.reason ? { reason: err.reason } : {}),
  };
}
