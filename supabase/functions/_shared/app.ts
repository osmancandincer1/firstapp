/** Composition root: builds real dependencies from the environment, once per worker. */
import disposable from './data/disposable_domains.json' with { type: 'json' };
import { adminClient, authAdmin, SupabaseDb } from './db.ts';
import { loadServerEnv, type ServerEnv } from './env.ts';
import { livenessProviders } from './providers/faces.ts';
import { emailSender, lineLookup, smsSender } from './providers/messaging.ts';
import type {
  AuthAdmin,
  Db,
  EmailSender,
  FaceIndex,
  LineLookup,
  LivenessService,
  SmsSender,
} from './types.ts';

export interface AppDeps {
  env: ServerEnv;
  db: Db;
  auth: AuthAdmin;
  email: EmailSender | null;
  sms: SmsSender | null;
  lookup: LineLookup;
  liveness: LivenessService | null;
  faces: FaceIndex | null;
  disposableDomains: ReadonlySet<string>;
}

let cached: AppDeps | null = null;

export function appDeps(): AppDeps {
  if (cached) return cached;
  const env = loadServerEnv();
  cached = {
    env,
    db: new SupabaseDb(adminClient(env)),
    auth: authAdmin(env),
    email: emailSender(env),
    sms: smsSender(env),
    lookup: lineLookup(env),
    ...livenessProviders(env),
    disposableDomains: new Set(disposable.domains),
  };
  return cached;
}

/** Responses of unauthenticated sign-in endpoints take at least this long (BAN-06). */
export const SIGN_IN_MIN_DURATION_MS = 700;
