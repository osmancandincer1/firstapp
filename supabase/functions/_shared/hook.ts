/**
 * Supabase Auth "before user created" hook (APP.md §7.5, BAN-01/04).
 * Runs for every new auth user, including Apple/Google sign-ups, and refuses
 * banned or disposable addresses with a generic message. The request is
 * signed (Standard Webhooks) with AUTH_HOOK_SECRET.
 */
import { Webhook } from 'standardwebhooks';
import {
  canonicalEmail,
  emailDomain,
  isDisposableDomain,
} from '../../../packages/shared/src/index.ts';
import { identifierHash } from './crypto.ts';
import type { Db } from './types.ts';

export const GENERIC_REFUSAL =
  'Bu bilgilerle hesap oluşturulamıyor. / An account cannot be created with these details.';

export interface HookDeps {
  hmacSecret: string;
  hookSecret: string | null;
  db: Pick<Db, 'banLookup'>;
  disposableDomains: ReadonlySet<string>;
}

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function beforeUserCreated(deps: HookDeps, req: Request): Promise<Response> {
  if (!deps.hookSecret)
    return reply(503, { error: { http_code: 503, message: 'hook not configured' } });
  const payload = await req.text();
  let event: { user?: { email?: string | null } };
  try {
    const wh = new Webhook(deps.hookSecret.replace(/^v1,whsec_/, ''));
    event = wh.verify(payload, Object.fromEntries(req.headers)) as typeof event;
  } catch {
    return reply(401, { error: { http_code: 401, message: 'invalid signature' } });
  }

  const email = event.user?.email ?? null;
  const canonical = email ? canonicalEmail(email) : null;
  if (canonical) {
    if (isDisposableDomain(emailDomain(canonical), deps.disposableDomains)) {
      return reply(400, { error: { http_code: 400, message: GENERIC_REFUSAL } });
    }
    const hash = await identifierHash(deps.hmacSecret, 'email', canonical);
    if (await deps.db.banLookup([{ type: 'email', hash }])) {
      return reply(403, { error: { http_code: 403, message: GENERIC_REFUSAL } });
    }
  }
  return reply(200, {});
}
