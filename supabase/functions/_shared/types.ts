/** Contracts between services and their dependencies. Implementations live in db.ts and providers/. */
import type {
  ApiErrorCode,
  ConsentChoice,
  ConsentType,
  FaceOwner,
  LineType,
  OtpVerifyStatus,
  SessionTokens,
} from '../../../packages/shared/src/index.ts';

export type IdentifierType =
  'email' | 'phone' | 'face' | 'device' | 'oauth_sub' | 'payment' | 'id_doc';
export type Platform = 'ios' | 'android' | 'web';

export interface ProfileState {
  status: 'onboarding' | 'active' | 'paused' | 'suspended' | 'banned' | 'deleted';
  phoneVerified: boolean;
  birthDate: string | null;
  consentsComplete: boolean;
  livenessVerified: boolean;
  idRequired: boolean;
}

/** Thin wrapper around the srv_* SQL functions (see the identity migration). */
export interface Db {
  rateLimitHit(bucket: string, windowSeconds: number, max: number): Promise<boolean>;
  otpCreate(
    channel: 'email' | 'phone',
    targetHash: string,
    codeHash: string,
    ttlSeconds: number,
    userId?: string,
  ): Promise<'created' | 'locked'>;
  otpVerify(
    channel: 'email' | 'phone',
    targetHash: string,
    codeHash: string,
    maxFailed: number,
    lockSeconds: number,
    userId?: string,
  ): Promise<OtpVerifyStatus>;
  banLookup(ids: readonly { type: IdentifierType; hash: string }[]): Promise<string | null>;
  banAccount(
    userId: string,
    reason: string,
    extra?: { type: IdentifierType; hash: string }[],
  ): Promise<void>;
  identifierOwner(type: IdentifierType, hash: string): Promise<string | null>;
  bindIdentifier(
    userId: string,
    type: IdentifierType,
    hash: string,
  ): Promise<'bound' | 'already_yours' | 'taken'>;
  markPhoneVerified(userId: string, phoneHash: string, last2: string): Promise<'ok' | 'taken'>;
  setBirthDate(
    userId: string,
    birthDate: string,
  ): Promise<'ok' | 'underage' | 'age_locked' | 'already_set' | 'invalid' | 'not_found'>;
  registerDevice(
    userId: string,
    platform: Platform,
    deviceHash: string,
    appVersion: string | null,
  ): Promise<'ok' | 'review' | 'not_found'>;
  profileState(userId: string): Promise<ProfileState | null>;
  currentLegalVersions(): Promise<Partial<Record<ConsentType, string>>>;
  insertConsents(userId: string, choices: readonly ConsentChoice[], ipHash: string): Promise<void>;
  flag<T>(key: string, fallback: T): Promise<T>;
  livenessFailuresSince(userId: string, since: Date): Promise<Date[]>;
  livenessCreate(userId: string, provider: string, sessionId: string): Promise<void>;
  faceOwners(userId: string, faceHashes: string[]): Promise<FaceOwner[]>;
  livenessFinish(input: {
    userId: string;
    provider: string;
    sessionId: string;
    outcome: string;
    confidence: number;
    ageLow: number | null;
    ageHigh: number | null;
    faceHash: string | null;
    matchedHashes: string[];
  }): Promise<string>;
}

export interface AuthAdmin {
  /** Verifies a user access token. Null when missing, invalid or expired. */
  userFromToken(token: string): Promise<{
    id: string;
    email: string | null;
    oauth: { provider: string; sub: string }[];
  } | null>;
  emailOf(userId: string): Promise<string | null>;
  /** Creates the auth user if needed and returns a fresh session for it. */
  signInByEmail(email: string): Promise<{ userId: string; session: SessionTokens }>;
}

export interface EmailSender {
  send(to: string, subject: string, text: string): Promise<void>;
}

export interface SmsSender {
  send(to: string, text: string): Promise<void>;
}

export interface LineLookup {
  lineType(e164: string): Promise<LineType>;
}

export interface LivenessResult {
  confidence: number;
  /** Reference frame from the session; never stored by us (§6.2). */
  referenceImage: Uint8Array | null;
}

export interface LivenessService {
  readonly name: 'aws' | 'mock';
  createSession(): Promise<string>;
  getResult(sessionId: string): Promise<LivenessResult>;
}

export interface FaceIndex {
  /** Face ids in the collection similar to the image, above the threshold. */
  search(image: Uint8Array, threshold: number): Promise<string[]>;
  /** Adds the face to the collection; returns its face id. */
  index(image: Uint8Array, externalId: string): Promise<string | null>;
  /** Lower bound of the estimated age, or null if no face is found. */
  ageLow(image: Uint8Array): Promise<{ low: number; high: number } | null>;
}

export type Result<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; error: ApiErrorCode; retryAt?: string };

export const fail = (status: number, error: ApiErrorCode, retryAt?: Date): Result<never> => ({
  ok: false,
  status,
  error,
  ...(retryAt ? { retryAt: retryAt.toISOString() } : {}),
});

export const ok = <T>(body: T, status = 200): Result<T> => ({ ok: true, status, body });

/** Request facts the services need, extracted by the HTTP layer. */
export interface RequestContext {
  ip: string;
  now: Date;
}
