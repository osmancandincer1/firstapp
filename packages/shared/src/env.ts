import { z } from 'zod';

/** APP.md §0.12 — every environment has its own database, bucket, keys and store products. */
export const appEnvSchema = z.enum(['local', 'staging', 'production']);
export type AppEnv = z.infer<typeof appEnvSchema>;

/**
 * Public (client-safe) configuration. Nothing secret may ever be added here:
 * these values are bundled into the mobile app and the website (§0.3).
 * Optional values are services that are NEEDS_SETUP; the feature using them
 * stays off until the owner provides a value (§0.9).
 */
export const publicEnvSchema = z.object({
  APP_ENV: appEnvSchema.default('local'),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SENTRY_DSN: z.url().optional(),
});
export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Keys that must never appear in a public env object (§0.3). */
const FORBIDDEN_PUBLIC_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'HASH_HMAC_SECRET',
  'AWS_SECRET_ACCESS_KEY',
  'SMS_API_KEY',
  'EMAIL_API_KEY',
  'REVENUECAT_WEBHOOK_SECRET',
  'MODERATION_API_KEY',
] as const;

/**
 * Parses raw values into a PublicEnv. Empty strings count as "not set", so a
 * blank line copied from .env.example keeps the service disabled instead of
 * failing validation.
 */
export function parsePublicEnv(raw: Record<string, string | undefined>): PublicEnv {
  for (const key of FORBIDDEN_PUBLIC_KEYS) {
    if (raw[key]) throw new Error(`${key} must never be exposed to client code`);
  }
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === undefined || v.trim() === '' ? undefined : v]),
  );
  return publicEnvSchema.parse(cleaned);
}

/** §0.10 — demo content is allowed only outside production. */
export function isDemoAllowed(env: AppEnv): boolean {
  return env !== 'production';
}

export type ServiceStatus = 'ready' | 'NEEDS_SETUP';

/** Reports whether optional services are configured, for the dev status screen and logs. */
export function serviceStatus(env: PublicEnv): Record<'supabase' | 'sentry', ServiceStatus> {
  return {
    supabase: env.SUPABASE_URL && env.SUPABASE_ANON_KEY ? 'ready' : 'NEEDS_SETUP',
    sentry: env.SENTRY_DSN ? 'ready' : 'NEEDS_SETUP',
  };
}
