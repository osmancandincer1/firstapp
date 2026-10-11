/**
 * Photo and voice pipelines (APP.md §6.4, §7.2, §13.7, PRO-01..05, VER-02).
 *
 * Photos: the app uploads to `quarantine` with a one-time signed URL; then
 * `process` checks the file, removes metadata, asks the moderation provider,
 * and either publishes a clean copy to `public-photos`, rejects it with a
 * reason, or keeps it in quarantine for a human. Without a moderation
 * provider nothing is published automatically: photos wait for review (§0.9).
 */
import {
  decidePhoto,
  moderateText,
  photoActionSchema,
  VOICE_MAX_SECONDS,
  VOICE_MIN_SECONDS,
  voiceActionSchema,
  type MediaResult,
  type ProfileViewResponse,
  type UploadTarget,
} from '../../../../packages/shared/src/index.ts';
import { identifierHash } from '../crypto.ts';
import { checkPhotoFile, mp4DurationMs } from '../media.ts';
import type {
  AuthAdmin,
  Db,
  FaceIndex,
  ImageModeration,
  MediaStore,
  ProfileDb,
  Result,
} from '../types.ts';
import { blocked, fail, ok } from '../types.ts';

/** Signed media URLs live this long (§13.7 kısa ömürlü; PRO-05). */
export const SIGNED_URL_SECONDS = 600;
export const VOICE_MAX_BYTES = 2 * 1024 * 1024;

export interface MediaDeps {
  env: { hmacSecret: string };
  db: Pick<Db, 'profileState' | 'faceOwners' | 'flag'>;
  profile: ProfileDb;
  auth: AuthAdmin;
  store: MediaStore;
  moderation: ImageModeration | null;
  faces: FaceIndex | null;
}

async function signedInUser(deps: MediaDeps, token: string | null) {
  return token ? await deps.auth.userFromToken(token) : null;
}

/** Photos need a passed liveness check: the main photo is matched against it (VER-02). */
async function mayEditMedia(deps: MediaDeps, userId: string): Promise<boolean> {
  const s = await deps.db.profileState(userId);
  return Boolean(s && ['onboarding', 'active', 'paused'].includes(s.status) && s.livenessVerified);
}

export async function photoAction(
  deps: MediaDeps,
  token: string | null,
  raw: unknown,
): Promise<Result<UploadTarget | MediaResult | { ok: true }>> {
  const user = await signedInUser(deps, token);
  if (!user) return fail(401, 'not_authenticated');
  const parsed = photoActionSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');
  if (!(await mayEditMedia(deps, user.id))) return fail(409, 'wrong_step');
  const req = parsed.data;

  switch (req.action) {
    case 'upload_url': {
      const id = await deps.profile.photoCreate(user.id);
      if (!id) return fail(409, 'photo_limit');
      const row = await deps.profile.photoGet(user.id, id);
      const target = await deps.store.signedUploadUrl('quarantine', row!.quarantinePath!);
      return ok({ ok: true, id, bucket: 'quarantine', path: target.path, token: target.token });
    }
    case 'process':
      return processPhoto(deps, user.id, req.photoId);
    case 'reorder': {
      const r = await deps.profile.photoReorder(user.id, req.ids);
      if (r === 'invalid') return fail(400, 'invalid_input');
      await deps.profile.tryCompleteOnboarding(user.id);
      return ok({ ok: true });
    }
    case 'caption': {
      const caption = req.caption || null;
      if (caption) {
        const v = moderateText(caption);
        if (v.action === 'block') return blocked('caption', v.reason);
        if (v.action === 'review') {
          await deps.profile.addPendingEdit(user.id, `caption.${req.photoId}`, caption, v.reason);
          return ok({ ok: true });
        }
      }
      const r = await deps.profile.photoCaption(user.id, req.photoId, caption);
      return r === 'ok' ? ok({ ok: true }) : fail(404, 'not_found');
    }
    case 'delete': {
      const paths = await deps.profile.photoDelete(user.id, req.photoId);
      if (!paths) return fail(404, 'not_found');
      await deps.store.remove('quarantine', paths);
      await deps.store.remove('public-photos', paths);
      return ok({ ok: true });
    }
  }
}

async function processPhoto(
  deps: MediaDeps,
  userId: string,
  photoId: string,
): Promise<Result<MediaResult>> {
  const row = await deps.profile.photoGet(userId, photoId);
  if (!row || row.status !== 'pending' || !row.quarantinePath) return fail(404, 'not_found');
  const bytes = await deps.store.download('quarantine', row.quarantinePath);
  if (!bytes) return fail(404, 'not_found');

  const finish = async (
    status: 'approved' | 'rejected' | 'review',
    reason: string | null,
    extra: {
      faceMatched?: boolean;
      publicPath?: string | null;
      width?: number | null;
      height?: number | null;
    } = {},
  ): Promise<Result<MediaResult>> => {
    await deps.profile.photoFinish({
      userId,
      photoId,
      status,
      reason,
      faceMatched: extra.faceMatched ?? false,
      publicPath: extra.publicPath ?? null,
      width: extra.width ?? null,
      height: extra.height ?? null,
    });
    await deps.profile.tryCompleteOnboarding(userId);
    return ok({ ok: true, status, ...(reason ? { reason } : {}) });
  };

  const file = checkPhotoFile(bytes);
  if (!file.ok) {
    await deps.store.remove('quarantine', [row.quarantinePath]);
    return finish('rejected', file.reason);
  }
  const dims = { width: file.width, height: file.height };

  if (!deps.moderation || !deps.faces) {
    // No automatic moderation configured: keep the stripped file for a human (§0.9).
    await deps.store.upload('quarantine', row.quarantinePath, file.clean, `image/${file.type}`);
    return finish('review', 'under_review', dims);
  }

  const signals = await deps.moderation.analyze(file.clean);
  let selfMatch = false;
  if (signals.faces.length > 0) {
    const threshold = await deps.db.flag<number>('liveness.face_match_threshold', 90);
    const ids = await deps.faces.search(file.clean, threshold);
    const hashes = await Promise.all(
      ids.map((id) => identifierHash(deps.env.hmacSecret, 'face', id)),
    );
    selfMatch = hashes.length > 0 && (await deps.db.faceOwners(userId, hashes)).includes('self');
  }
  const decision = decidePhoto({ ...signals, selfMatch, isMain: row.isMain });

  if (decision.status === 'approved') {
    const publicPath = row.quarantinePath.replace(/\.jpg$/, file.type === 'png' ? '.png' : '.jpg');
    await deps.store.upload('public-photos', publicPath, file.clean, `image/${file.type}`);
    await deps.store.remove('quarantine', [row.quarantinePath]);
    return finish('approved', null, { faceMatched: decision.faceMatched, publicPath, ...dims });
  }
  if (decision.status === 'rejected') {
    await deps.store.remove('quarantine', [row.quarantinePath]);
    return finish('rejected', decision.reason, dims);
  }
  await deps.store.upload('quarantine', row.quarantinePath, file.clean, `image/${file.type}`);
  return finish('review', decision.reason, dims);
}

export async function voiceAction(
  deps: MediaDeps,
  token: string | null,
  raw: unknown,
): Promise<Result<UploadTarget | MediaResult | { ok: true }>> {
  const user = await signedInUser(deps, token);
  if (!user) return fail(401, 'not_authenticated');
  const parsed = voiceActionSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');
  if (!(await mayEditMedia(deps, user.id))) return fail(409, 'wrong_step');
  const req = parsed.data;

  switch (req.action) {
    case 'upload_url': {
      const id = await deps.profile.voiceCreate(user.id, req.promptId);
      if (!id) return fail(400, 'invalid_input');
      const row = await deps.profile.voiceGet(user.id, id);
      const target = await deps.store.signedUploadUrl('quarantine', row!.quarantinePath!);
      return ok({ ok: true, id, bucket: 'quarantine', path: target.path, token: target.token });
    }
    case 'process': {
      const row = await deps.profile.voiceGet(user.id, req.voiceId);
      if (!row || row.status !== 'pending' || !row.quarantinePath) return fail(404, 'not_found');
      const bytes = await deps.store.download('quarantine', row.quarantinePath);
      if (!bytes) return fail(404, 'not_found');
      await deps.store.remove('quarantine', [row.quarantinePath]);

      const ms = bytes.length <= VOICE_MAX_BYTES ? mp4DurationMs(bytes) : null;
      const reason =
        bytes.length > VOICE_MAX_BYTES
          ? 'too_large'
          : ms === null
            ? 'unsupported_type'
            : ms < VOICE_MIN_SECONDS * 1000 || ms > VOICE_MAX_SECONDS * 1000 + 500
              ? 'duration'
              : null;
      if (reason) {
        await deps.profile.voiceFinish({
          userId: user.id,
          voiceId: req.voiceId,
          status: 'rejected',
          reason,
          durationMs: null,
          publicPath: null,
        });
        return ok({ ok: true, status: 'rejected', reason });
      }
      const publicPath = row.quarantinePath;
      await deps.store.upload('public-voice', publicPath, bytes, 'audio/mp4');
      const old = await deps.profile.voiceFinish({
        userId: user.id,
        voiceId: req.voiceId,
        status: 'approved',
        reason: null,
        durationMs: Math.min(ms!, VOICE_MAX_SECONDS * 1000),
        publicPath,
      });
      if (old?.length) await deps.store.remove('public-voice', old);
      return ok({ ok: true, status: 'approved' });
    }
    case 'delete': {
      const paths = await deps.profile.voiceDelete(user.id);
      await deps.store.remove('quarantine', paths);
      await deps.store.remove('public-voice', paths);
      return ok({ ok: true });
    }
  }
}

/**
 * The user's own profile as others see it, plus signed URLs for their own
 * media (pending photos included, for the owner only).
 */
export async function viewOwnProfile(
  deps: MediaDeps,
  token: string | null,
): Promise<Result<ProfileViewResponse>> {
  const user = await signedInUser(deps, token);
  if (!user) return fail(401, 'not_authenticated');
  const [preview, media] = await Promise.all([
    deps.profile.myPublicProfile(user.id),
    deps.profile.myMedia(user.id),
  ]);
  const urls: Record<string, string> = {};
  await Promise.all(
    media.map(async (m) => {
      const url = await deps.store.signedUrl(m.bucket, m.path, SIGNED_URL_SECONDS);
      if (url) urls[m.id] = url;
    }),
  );
  return ok({ ok: true, preview, media: urls });
}
