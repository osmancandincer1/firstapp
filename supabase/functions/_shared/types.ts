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
  basicsComplete: boolean;
  photosComplete: boolean;
  reverifyRequired: boolean;
}

export type MediaStatus = 'pending' | 'approved' | 'rejected' | 'review';
export type Bucket = 'quarantine' | 'public-photos' | 'public-voice';

/** Profile writes (srv_* functions of the profile migration). */
export interface ProfileDb {
  updateBasics(
    userId: string,
    b: {
      name: string;
      gender: string;
      genderCustom: string | null;
      showGender: boolean;
      seeking: string[];
    },
  ): Promise<'ok' | 'name_locked' | 'not_found'>;
  updateIntent(
    userId: string,
    intent: string,
    tempo: string,
    dealbreakers: unknown,
  ): Promise<string>;
  setDoorQuestion(
    userId: string,
    presetId: string | null,
    customText: string | null,
  ): Promise<'ok' | 'locked' | 'invalid_preset' | 'not_found'>;
  setInterests(userId: string, ids: string[]): Promise<'ok' | 'invalid' | 'not_found'>;
  updateDetails(
    userId: string,
    data: Record<string, unknown>,
    visibility: Record<string, boolean>,
  ): Promise<string>;
  setLocation(
    userId: string,
    cityId: number,
    districtId: number | null,
    lat: number | null,
    lng: number | null,
  ): Promise<'ok' | 'invalid_city' | 'invalid_district' | 'not_found'>;
  addPendingEdit(userId: string, field: string, value: unknown, reason: string): Promise<void>;
  tryCompleteOnboarding(userId: string): Promise<string | null>;
  photoCreate(userId: string): Promise<string | null>;
  photoGet(
    userId: string,
    photoId: string,
  ): Promise<{
    id: string;
    status: MediaStatus;
    quarantinePath: string | null;
    isMain: boolean;
  } | null>;
  photoFinish(input: {
    userId: string;
    photoId: string;
    status: MediaStatus;
    reason: string | null;
    faceMatched: boolean;
    publicPath: string | null;
    width: number | null;
    height: number | null;
  }): Promise<'ok' | 'not_found'>;
  photoReorder(userId: string, ids: string[]): Promise<'ok' | 'invalid'>;
  photoDelete(userId: string, photoId: string): Promise<string[] | null>;
  photoCaption(
    userId: string,
    photoId: string,
    caption: string | null,
  ): Promise<'ok' | 'not_found'>;
  voiceCreate(userId: string, promptId: string): Promise<string | null>;
  voiceGet(
    userId: string,
    voiceId: string,
  ): Promise<{ id: string; status: MediaStatus; quarantinePath: string | null } | null>;
  voiceFinish(input: {
    userId: string;
    voiceId: string;
    status: MediaStatus;
    reason: string | null;
    durationMs: number | null;
    publicPath: string | null;
  }): Promise<string[] | null>;
  voiceDelete(userId: string): Promise<string[]>;
  myPublicProfile(userId: string): Promise<Record<string, unknown> | null>;
  myMedia(
    userId: string,
  ): Promise<{ id: string; kind: 'photo' | 'voice'; bucket: Bucket; path: string }[]>;
}

/** Private object storage; every read and write goes through signed URLs or the service role. */
export interface MediaStore {
  signedUploadUrl(bucket: Bucket, path: string): Promise<{ path: string; token: string }>;
  download(bucket: Bucket, path: string): Promise<Uint8Array | null>;
  upload(bucket: Bucket, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(bucket: Bucket, paths: string[]): Promise<void>;
  signedUrl(bucket: Bucket, path: string, expiresInSeconds: number): Promise<string | null>;
}

/** Image signals for decidePhoto (§7.2). */
export interface ImageModeration {
  analyze(image: Uint8Array): Promise<{
    labels: { name: string; parent: string | null; confidence: number }[];
    texts: string[];
    faces: { ageLow: number; ageHigh: number }[];
  }>;
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
  | {
      ok: false;
      status: number;
      error: ApiErrorCode;
      retryAt?: string;
      /** Extra, non-sensitive detail, e.g. which field was blocked and why. */
      details?: { field?: string; reason?: string };
    };

export const fail = (status: number, error: ApiErrorCode, retryAt?: Date): Result<never> => ({
  ok: false,
  status,
  error,
  ...(retryAt ? { retryAt: retryAt.toISOString() } : {}),
});

/** A text field was refused by moderation (§7.2); the app shows the field and the reason. */
export const blocked = (field: string, reason: string): Result<never> => ({
  ok: false,
  status: 400,
  error: 'text_blocked',
  details: { field, reason },
});

export const ok = <T>(body: T, status = 200): Result<T> => ({ ok: true, status, body });

/** Request facts the services need, extracted by the HTTP layer. */
export interface RequestContext {
  ip: string;
  now: Date;
}
