/** In-memory stand-ins for the database, Supabase Auth and providers. */
import type {
  ConsentChoice,
  ConsentType,
  FaceOwner,
  LineType,
  OtpVerifyStatus,
} from '../../../packages/shared/src/index.ts';
import { identifierHash } from '../_shared/crypto.ts';
import type {
  AuthAdmin,
  Bucket,
  MediaStore,
  ProfileDb,
  Db,
  EmailSender,
  FaceIndex,
  IdentifierType,
  LineLookup,
  LivenessResult,
  LivenessService,
  Platform,
  ProfileState,
  SmsSender,
} from '../_shared/types.ts';

export const SECRET = 'test-secret-that-is-long-enough-123456';
export const env = {
  hmacSecret: SECRET,
  supportEmail: 'destek@example.com',
  appEnv: 'staging' as const,
};
export const ctx = { ip: '203.0.113.7', now: new Date('2026-10-11T12:00:00Z') };

export const hashOf = (type: IdentifierType, value: string) => identifierHash(SECRET, type, value);

export class FakeDb implements Db {
  calls: { fn: string; args: unknown[] }[] = [];
  buckets = new Map<string, number>();
  limit: number | null = null;
  bans = new Set<string>();
  owners = new Map<string, string>();
  otpCreateResult: 'created' | 'locked' = 'created';
  otpVerifyResult: OtpVerifyStatus = 'ok';
  birthDateResult: Awaited<ReturnType<Db['setBirthDate']>> = 'ok';
  deviceResult: 'ok' | 'review' = 'ok';
  markPhoneResult: 'ok' | 'taken' = 'ok';
  state: ProfileState | null = {
    status: 'onboarding',
    phoneVerified: false,
    birthDate: null,
    consentsComplete: false,
    livenessVerified: false,
    idRequired: false,
    basicsComplete: false,
    photosComplete: false,
    reverifyRequired: false,
  };
  versions: Partial<Record<ConsentType, string>> = {};
  flags = new Map<string, unknown>();
  failures: Date[] = [];
  faceOwnerResult: FaceOwner[] = [];
  finishResult: string | null = null;

  private log(fn: string, ...args: unknown[]) {
    this.calls.push({ fn, args });
  }
  called(fn: string) {
    return this.calls.filter((c) => c.fn === fn);
  }

  rateLimitHit(bucket: string, _w: number, max: number) {
    this.log('rateLimitHit', bucket);
    const n = this.buckets.get(bucket) ?? 0;
    if (n >= (this.limit ?? max)) return Promise.resolve(false);
    this.buckets.set(bucket, n + 1);
    return Promise.resolve(true);
  }
  otpCreate(...args: unknown[]) {
    this.log('otpCreate', ...args);
    return Promise.resolve(this.otpCreateResult);
  }
  otpVerify(...args: unknown[]) {
    this.log('otpVerify', ...args);
    return Promise.resolve(this.otpVerifyResult);
  }
  banLookup(ids: readonly { type: IdentifierType; hash: string }[]) {
    this.log('banLookup', ids);
    return Promise.resolve(ids.some((i) => this.bans.has(`${i.type}:${i.hash}`)) ? 'ban-1' : null);
  }
  banAccount(userId: string, reason: string, extra?: unknown) {
    this.log('banAccount', userId, reason, extra);
    return Promise.resolve();
  }
  identifierOwner(type: IdentifierType, hash: string) {
    return Promise.resolve(this.owners.get(`${type}:${hash}`) ?? null);
  }
  bindIdentifier(userId: string, type: IdentifierType, hash: string) {
    this.log('bindIdentifier', userId, type, hash);
    return Promise.resolve('bound' as const);
  }
  markPhoneVerified(...args: unknown[]) {
    this.log('markPhoneVerified', ...args);
    return Promise.resolve(this.markPhoneResult);
  }
  setBirthDate(...args: unknown[]) {
    this.log('setBirthDate', ...args);
    return Promise.resolve(this.birthDateResult);
  }
  registerDevice(userId: string, platform: Platform, hash: string, appVersion: string | null) {
    this.log('registerDevice', userId, platform, hash, appVersion);
    return Promise.resolve(this.deviceResult);
  }
  profileState() {
    return Promise.resolve(this.state);
  }
  currentLegalVersions() {
    return Promise.resolve(this.versions);
  }
  insertConsents(userId: string, choices: readonly ConsentChoice[], ipHash: string) {
    this.log('insertConsents', userId, choices, ipHash);
    return Promise.resolve();
  }
  flag<T>(key: string, fallback: T) {
    return Promise.resolve((this.flags.has(key) ? this.flags.get(key) : fallback) as T);
  }
  livenessFailuresSince() {
    return Promise.resolve(this.failures);
  }
  livenessCreate(...args: unknown[]) {
    this.log('livenessCreate', ...args);
    return Promise.resolve();
  }
  faceOwners(...args: unknown[]) {
    this.log('faceOwners', ...args);
    return Promise.resolve(this.faceOwnerResult);
  }
  livenessFinish(input: Parameters<Db['livenessFinish']>[0]) {
    this.log('livenessFinish', input);
    return Promise.resolve(this.finishResult ?? input.outcome);
  }
}

export class FakeAuth implements AuthAdmin {
  users = new Map<
    string,
    { id: string; email: string | null; oauth: { provider: string; sub: string }[] }
  >();
  emails = new Map<string, string>();
  signIns: string[] = [];

  addUser(
    token: string,
    id: string,
    email: string | null = null,
    oauth: { provider: string; sub: string }[] = [],
  ) {
    this.users.set(token, { id, email, oauth });
    if (email) this.emails.set(id, email);
  }
  userFromToken(token: string) {
    return Promise.resolve(this.users.get(token) ?? null);
  }
  emailOf(userId: string) {
    return Promise.resolve(this.emails.get(userId) ?? null);
  }
  signInByEmail(email: string) {
    this.signIns.push(email);
    return Promise.resolve({
      userId: 'user-new',
      session: { access_token: 'at', refresh_token: 'rt' },
    });
  }
}

export class Outbox implements EmailSender, SmsSender {
  sent: { to: string; text: string; subject?: string }[] = [];
  send(to: string, a: string, b?: string): Promise<void> {
    this.sent.push(b === undefined ? { to, text: a } : { to, subject: a, text: b });
    return Promise.resolve();
  }
}

export class FixedLookup implements LineLookup {
  constructor(public type: LineType) {}
  lineType() {
    return Promise.resolve(this.type);
  }
}

export class FakeLiveness implements LivenessService, FaceIndex {
  readonly name = 'mock' as const;
  result: LivenessResult = { confidence: 98, referenceImage: new Uint8Array([1, 2, 3]) };
  matches: string[] = [];
  age: { low: number; high: number } | null = { low: 26, high: 33 };
  indexed: string[] = [];
  createSession() {
    return Promise.resolve('session-12345');
  }
  getResult() {
    return Promise.resolve(this.result);
  }
  search() {
    return Promise.resolve(this.matches);
  }
  index(_i: Uint8Array, externalId: string) {
    this.indexed.push(externalId);
    return Promise.resolve('face-new');
  }
  ageLow() {
    return Promise.resolve(this.age);
  }
}

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Records every ProfileDb call; results can be overridden per method. */
export class FakeProfileDb implements ProfileDb {
  calls: { fn: string; args: unknown[] }[] = [];
  results: Partial<Record<keyof ProfileDb, unknown>> = {};
  photo = {
    id: UUID(1),
    status: 'pending' as const,
    quarantinePath: 'p1/photos/x.jpg',
    isMain: true,
  };
  voice = { id: UUID(2), status: 'pending' as const, quarantinePath: 'p1/voice/v.m4a' };
  private r<T>(fn: keyof ProfileDb, fallback: T, ...args: unknown[]): Promise<T> {
    this.calls.push({ fn, args });
    return Promise.resolve((fn in this.results ? this.results[fn] : fallback) as T);
  }
  called(fn: keyof ProfileDb) {
    return this.calls.filter((c) => c.fn === fn);
  }
  updateBasics(...a: unknown[]) {
    return this.r('updateBasics', 'ok' as const, ...a);
  }
  updateIntent(...a: unknown[]) {
    return this.r('updateIntent', 'ok', ...a);
  }
  setDoorQuestion(...a: unknown[]) {
    return this.r('setDoorQuestion', 'ok' as const, ...a);
  }
  setInterests(...a: unknown[]) {
    return this.r('setInterests', 'ok' as const, ...a);
  }
  updateMood(...a: unknown[]) {
    return this.r('updateMood', 'ok' as const, ...a);
  }
  updateTwoTruths(...a: unknown[]) {
    return this.r('updateTwoTruths', 'ok' as const, ...a);
  }
  updateDetails(...a: unknown[]) {
    return this.r('updateDetails', 'ok', ...a);
  }
  setLocation(...a: unknown[]) {
    return this.r('setLocation', 'ok' as const, ...a);
  }
  addPendingEdit(...a: unknown[]) {
    return this.r('addPendingEdit', undefined, ...a);
  }
  tryCompleteOnboarding(...a: unknown[]) {
    return this.r('tryCompleteOnboarding', 'onboarding', ...a);
  }
  photoCreate(...a: unknown[]) {
    return this.r<string | null>('photoCreate', UUID(1), ...a);
  }
  photoGet(...a: unknown[]) {
    return this.r('photoGet', this.photo, ...a);
  }
  photoFinish(...a: unknown[]) {
    return this.r('photoFinish', 'ok' as const, ...a);
  }
  photoReorder(...a: unknown[]) {
    return this.r('photoReorder', 'ok' as const, ...a);
  }
  photoDelete(...a: unknown[]) {
    return this.r<string[] | null>('photoDelete', ['p1/photos/x.jpg'], ...a);
  }
  photoCaption(...a: unknown[]) {
    return this.r('photoCaption', 'ok' as const, ...a);
  }
  voiceCreate(...a: unknown[]) {
    return this.r<string | null>('voiceCreate', UUID(2), ...a);
  }
  voiceGet(...a: unknown[]) {
    return this.r('voiceGet', this.voice, ...a);
  }
  voiceFinish(...a: unknown[]) {
    return this.r<string[] | null>('voiceFinish', [], ...a);
  }
  voiceDelete(...a: unknown[]) {
    return this.r('voiceDelete', ['p1/voice/v.m4a'], ...a);
  }
  updatePreferences(...a: unknown[]) {
    return this.r('updatePreferences', 'ok', ...a);
  }
  myPublicProfile(...a: unknown[]) {
    return this.r('myPublicProfile', { name: 'Ece', age: 30 }, ...a);
  }
  myMedia(...a: unknown[]) {
    return this.r(
      'myMedia',
      [
        {
          id: UUID(1),
          kind: 'photo' as const,
          bucket: 'public-photos' as Bucket,
          path: 'p1/photos/a.jpg',
        },
        {
          id: UUID(3),
          kind: 'photo' as const,
          bucket: 'quarantine' as Bucket,
          path: 'p1/photos/b.jpg',
        },
      ],
      ...a,
    );
  }
}

export class FakeStore implements MediaStore {
  objects = new Map<string, Uint8Array>();
  removed: string[] = [];
  signed: { bucket: string; path: string; ttl: number }[] = [];
  signedUploadUrl(_b: Bucket, path: string) {
    return Promise.resolve({ path, token: 'upload-token' });
  }
  download(b: Bucket, path: string) {
    return Promise.resolve(this.objects.get(`${b}/${path}`) ?? null);
  }
  upload(b: Bucket, path: string, bytes: Uint8Array) {
    this.objects.set(`${b}/${path}`, bytes);
    return Promise.resolve();
  }
  remove(b: Bucket, paths: string[]) {
    for (const p of paths) {
      this.removed.push(`${b}/${p}`);
      this.objects.delete(`${b}/${p}`);
    }
    return Promise.resolve();
  }
  signedUrl(b: Bucket, path: string, ttl: number) {
    this.signed.push({ bucket: b, path, ttl });
    return Promise.resolve(`https://signed/${b}/${path}?ttl=${ttl}`);
  }
  signedUrls(b: Bucket, paths: string[], ttl: number) {
    for (const path of paths) this.signed.push({ bucket: b, path, ttl });
    return Promise.resolve(
      Object.fromEntries(paths.map((path) => [path, `https://signed/${b}/${path}?ttl=${ttl}`])),
    );
  }
}
