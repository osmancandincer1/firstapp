/**
 * Server configuration for Edge Functions (APP.md §0.3, §0.9, §0.12).
 *
 * Every external service is optional: when its keys are missing the service
 * is null and the feature using it answers `service_unavailable` instead of
 * pretending to work. Development stand-ins (`log` senders, `mock` liveness)
 * are refused outside APP_ENV=local.
 */
import { z } from 'zod';

const appEnv = z.enum(['local', 'staging', 'production']);
export type AppEnv = z.infer<typeof appEnv>;

const blank = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v);

const schema = z.object({
  APP_ENV: appEnv,
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  HASH_HMAC_SECRET: z.string().min(32, 'HASH_HMAC_SECRET must be at least 32 characters'),
  EMAIL_PROVIDER: z.enum(['resend', 'log']).optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  SMS_PROVIDER: z.enum(['twilio', 'log']).optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  LIVENESS_PROVIDER: z.enum(['aws', 'mock']).optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  REKOGNITION_COLLECTION_ID: z.string().optional(),
  AUTH_HOOK_SECRET: z.string().optional(),
  SUPPORT_EMAIL: z.string().optional(),
});

export interface ServerEnv {
  appEnv: AppEnv;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  hmacSecret: string;
  email: { provider: 'resend'; apiKey: string; from: string } | { provider: 'log' } | null;
  sms:
    | { provider: 'twilio'; accountSid: string; authToken: string; senderId: string }
    | { provider: 'log' }
    | null;
  liveness:
    | {
        provider: 'aws';
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
        collectionId: string;
      }
    | { provider: 'mock' }
    | null;
  authHookSecret: string | null;
  supportEmail: string;
}

export class ConfigError extends Error {}

/** Parses raw environment values. Pure, so it can be tested without Deno.env. */
export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  const cleaned = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, blank(v)]));
  const e = schema.parse(cleaned);
  const local = e.APP_ENV === 'local';
  const devOnly = (what: string) => {
    if (!local) throw new ConfigError(`${what} is only allowed when APP_ENV=local`);
  };

  let email: ServerEnv['email'] = null;
  if (e.EMAIL_PROVIDER === 'log') {
    devOnly('EMAIL_PROVIDER=log');
    email = { provider: 'log' };
  } else if (e.EMAIL_PROVIDER === 'resend' && e.EMAIL_API_KEY && e.EMAIL_FROM) {
    email = { provider: 'resend', apiKey: e.EMAIL_API_KEY, from: e.EMAIL_FROM };
  }

  let sms: ServerEnv['sms'] = null;
  if (e.SMS_PROVIDER === 'log') {
    devOnly('SMS_PROVIDER=log');
    sms = { provider: 'log' };
  } else if (e.SMS_PROVIDER === 'twilio' && e.SMS_API_KEY && e.SMS_SENDER_ID) {
    // SMS_API_KEY holds "<Account SID>:<Auth Token>" (docs/SETUP.md).
    const [accountSid, authToken] = e.SMS_API_KEY.split(':');
    if (!accountSid || !authToken)
      throw new ConfigError('SMS_API_KEY must be "<AccountSID>:<AuthToken>"');
    sms = { provider: 'twilio', accountSid, authToken, senderId: e.SMS_SENDER_ID };
  }

  let liveness: ServerEnv['liveness'] = null;
  if (e.LIVENESS_PROVIDER === 'mock') {
    devOnly('LIVENESS_PROVIDER=mock');
    liveness = { provider: 'mock' };
  } else if (
    e.LIVENESS_PROVIDER === 'aws' &&
    e.AWS_ACCESS_KEY_ID &&
    e.AWS_SECRET_ACCESS_KEY &&
    e.AWS_REGION &&
    e.REKOGNITION_COLLECTION_ID
  ) {
    liveness = {
      provider: 'aws',
      accessKeyId: e.AWS_ACCESS_KEY_ID,
      secretAccessKey: e.AWS_SECRET_ACCESS_KEY,
      region: e.AWS_REGION,
      collectionId: e.REKOGNITION_COLLECTION_ID,
    };
  }

  return {
    appEnv: e.APP_ENV,
    supabaseUrl: e.SUPABASE_URL,
    anonKey: e.SUPABASE_ANON_KEY,
    serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY,
    hmacSecret: e.HASH_HMAC_SECRET,
    email,
    sms,
    liveness,
    authHookSecret: e.AUTH_HOOK_SECRET ?? null,
    // TODO(owner): real support address once the domain exists.
    supportEmail: e.SUPPORT_EMAIL ?? 'destek@nokuzo.com',
  };
}

export function loadServerEnv(): ServerEnv {
  return parseServerEnv(Deno.env.toObject());
}
