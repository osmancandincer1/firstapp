/** Composition root: builds real dependencies from the environment, once per worker. */
import disposable from './data/disposable_domains.json' with { type: 'json' };
import { adminClient, authAdmin, SupabaseDb } from './db.ts';
import { SupabaseProfileDb } from './profileDb.ts';
import { loadServerEnv, type ServerEnv } from './env.ts';
import { livenessProviders } from './providers/faces.ts';
import { imageModeration } from './providers/imageModeration.ts';
import { SupabaseMediaStore } from './providers/storage.ts';
import { emailSender, lineLookup, smsSender } from './providers/messaging.ts';
import type {
  AuthAdmin,
  Db,
  EmailSender,
  FaceIndex,
  ImageModeration,
  LineLookup,
  LivenessService,
  MediaStore,
  ProfileDb,
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
  profile: ProfileDb;
  store: MediaStore;
  moderation: ImageModeration | null;
}

let cached: AppDeps | null = null;

export function appDeps(): AppDeps {
  if (cached) return cached;
  const env = loadServerEnv();
  const admin = adminClient(env);
  cached = {
    env,
    db: new SupabaseDb(admin),
    profile: new SupabaseProfileDb(admin),
    store: new SupabaseMediaStore(admin),
    moderation: imageModeration(env),
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
