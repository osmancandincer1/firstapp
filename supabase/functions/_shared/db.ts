/**
 * Database and Supabase Auth adapters. Uses the service role, which exists
 * only inside Edge Functions (APP.md §0.3). All rules that must be atomic are
 * in the srv_* SQL functions; this file only maps arguments and results.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ConsentChoice,
  ConsentType,
  FaceOwner,
  OtpVerifyStatus,
} from '../../../packages/shared/src/index.ts';
import type { ServerEnv } from './env.ts';
import type { AuthAdmin, Db, IdentifierType, Platform, ProfileState } from './types.ts';

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient(env: ServerEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceRoleKey, noSession);
}

async function rpc<T>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.code ?? ''} ${error.message}`);
  return data as T;
}

export class SupabaseDb implements Db {
  constructor(private c: SupabaseClient) {}

  rateLimitHit(bucket: string, windowSeconds: number, max: number) {
    return rpc<boolean>(this.c, 'srv_rate_limit_hit', {
      p_bucket: bucket,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
  }

  otpCreate(
    channel: 'email' | 'phone',
    targetHash: string,
    codeHash: string,
    ttlSeconds: number,
    userId?: string,
  ) {
    return rpc<'created' | 'locked'>(this.c, 'srv_otp_create', {
      p_channel: channel,
      p_target_hash: targetHash,
      p_code_hash: codeHash,
      p_ttl_seconds: ttlSeconds,
      p_user_id: userId ?? null,
    });
  }

  otpVerify(
    channel: 'email' | 'phone',
    targetHash: string,
    codeHash: string,
    maxFailed: number,
    lockSeconds: number,
    userId?: string,
  ) {
    return rpc<OtpVerifyStatus>(this.c, 'srv_otp_verify', {
      p_channel: channel,
      p_target_hash: targetHash,
      p_code_hash: codeHash,
      p_max_failed: maxFailed,
      p_lock_seconds: lockSeconds,
      p_user_id: userId ?? null,
    });
  }

  banLookup(ids: readonly { type: IdentifierType; hash: string }[]) {
    return rpc<string | null>(this.c, 'srv_ban_lookup', { p_identifiers: ids });
  }

  async banAccount(
    userId: string,
    reason: string,
    extra: { type: IdentifierType; hash: string }[] = [],
  ) {
    await rpc(this.c, 'srv_ban_account', { p_user_id: userId, p_reason: reason, p_extra: extra });
  }

  identifierOwner(type: IdentifierType, hash: string) {
    return rpc<string | null>(this.c, 'srv_identifier_owner', { p_type: type, p_hash: hash });
  }

  bindIdentifier(userId: string, type: IdentifierType, hash: string) {
    return rpc<'bound' | 'already_yours' | 'taken'>(this.c, 'srv_bind_identifier', {
      p_user_id: userId,
      p_type: type,
      p_hash: hash,
    });
  }

  markPhoneVerified(userId: string, phoneHash: string, last2: string) {
    return rpc<'ok' | 'taken'>(this.c, 'srv_mark_phone_verified', {
      p_user_id: userId,
      p_phone_hash: phoneHash,
      p_last2: last2,
    });
  }

  setBirthDate(userId: string, birthDate: string) {
    return rpc<'ok' | 'underage' | 'age_locked' | 'already_set' | 'invalid' | 'not_found'>(
      this.c,
      'srv_set_birth_date',
      { p_user_id: userId, p_birth: birthDate },
    );
  }

  registerDevice(
    userId: string,
    platform: Platform,
    deviceHash: string,
    appVersion: string | null,
  ) {
    return rpc<'ok' | 'review' | 'not_found'>(this.c, 'srv_register_device', {
      p_user_id: userId,
      p_platform: platform,
      p_device_hash: deviceHash,
      p_app_version: appVersion,
    });
  }

  async profileState(userId: string): Promise<ProfileState | null> {
    const s = await rpc<Record<string, unknown> | null>(this.c, 'srv_onboarding_state', {
      p_user_id: userId,
    });
    if (!s) return null;
    return {
      status: s.status as ProfileState['status'],
      phoneVerified: Boolean(s.phoneVerified),
      birthDate: (s.birthDate as string | null) ?? null,
      consentsComplete: Boolean(s.consentsComplete),
      livenessVerified: Boolean(s.livenessVerified),
      idRequired: Boolean(s.idRequired),
    };
  }

  async currentLegalVersions() {
    const rows = await rpc<{ type: ConsentType; version: string }[]>(
      this.c,
      'srv_current_legal_versions',
      {},
    );
    return Object.fromEntries(rows.map((r) => [r.type, r.version])) as Partial<
      Record<ConsentType, string>
    >;
  }

  private async profileId(userId: string): Promise<string> {
    const { data, error } = await this.c
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .single();
    if (error || !data) throw new Error('profile not found');
    return data.id as string;
  }

  async insertConsents(userId: string, choices: readonly ConsentChoice[], ipHash: string) {
    const profileId = await this.profileId(userId);
    const { error } = await this.c.from('consents').insert(
      choices.map((c) => ({
        profile_id: profileId,
        type: c.type,
        version: c.version,
        granted: c.granted,
        ip_hash: ipHash,
      })),
    );
    if (error) throw new Error(`consents insert failed: ${error.code}`);
  }

  async flag<T>(key: string, fallback: T): Promise<T> {
    const { data, error } = await this.c
      .from('feature_flags')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return fallback;
    return data.value as T;
  }

  async livenessFailuresSince(userId: string, since: Date): Promise<Date[]> {
    const profileId = await this.profileId(userId);
    const { data, error } = await this.c
      .from('verifications')
      .select('created_at')
      .eq('profile_id', profileId)
      .eq('kind', 'liveness')
      .eq('result', 'failed')
      .gte('created_at', since.toISOString());
    if (error) throw new Error(`verifications query failed: ${error.code}`);
    return (data ?? []).map((r) => new Date(r.created_at as string));
  }

  async livenessCreate(userId: string, provider: string, sessionId: string) {
    const profileId = await this.profileId(userId);
    const { error } = await this.c
      .from('verifications')
      .insert({ profile_id: profileId, kind: 'liveness', provider, provider_ref: sessionId });
    if (error) throw new Error(`verifications insert failed: ${error.code}`);
  }

  faceOwners(userId: string, faceHashes: string[]) {
    return rpc<FaceOwner[]>(this.c, 'srv_face_owners', {
      p_user_id: userId,
      p_face_hashes: faceHashes,
    });
  }

  livenessFinish(i: Parameters<Db['livenessFinish']>[0]) {
    return rpc<string>(this.c, 'srv_liveness_finish', {
      p_user_id: i.userId,
      p_provider: i.provider,
      p_session: i.sessionId,
      p_outcome: i.outcome,
      p_confidence: i.confidence,
      p_age_low: i.ageLow,
      p_age_high: i.ageHigh,
      p_face_hash: i.faceHash,
      p_matched_hashes: i.matchedHashes,
    });
  }
}

export class SupabaseAuthAdmin implements AuthAdmin {
  constructor(
    private admin: SupabaseClient,
    private anon: SupabaseClient,
  ) {}

  async userFromToken(token: string) {
    const { data, error } = await this.admin.auth.getUser(token);
    if (error || !data.user) return null;
    const oauth = (data.user.identities ?? [])
      .filter((i) => i.provider !== 'email' && i.provider !== 'phone')
      .map((i) => ({ provider: i.provider, sub: String(i.identity_data?.sub ?? i.id) }));
    return { id: data.user.id, email: data.user.email ?? null, oauth };
  }

  async emailOf(userId: string) {
    const { data } = await this.admin.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  }

  async signInByEmail(email: string) {
    const created = await this.admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error && created.error.code !== 'email_exists') {
      throw new Error(`createUser failed: ${created.error.code}`);
    }
    // generateLink does not send anything; its token is exchanged for a session right away.
    const link = await this.admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error || !link.data.properties)
      throw new Error(`generateLink failed: ${link.error?.code}`);
    const verified = await this.anon.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.data.properties.hashed_token,
    });
    const s = verified.data.session;
    if (verified.error || !s) throw new Error(`verifyOtp failed: ${verified.error?.code}`);
    return {
      userId: link.data.user.id,
      session: {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_at: s.expires_at,
      },
    };
  }
}

export function authAdmin(env: ServerEnv): SupabaseAuthAdmin {
  return new SupabaseAuthAdmin(
    adminClient(env),
    createClient(env.supabaseUrl, env.anonKey, noSession),
  );
}
