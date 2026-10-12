/**
 * Chat at a table (APP.md §4.4, §7.3, §13.5). Messages are sent here and read
 * by the app directly (RLS) and through Realtime. The rules about turns,
 * clocks and who may write live in srv_* functions; this layer validates,
 * attaches pattern flags (SOH-04..06) and moderates the farewell note.
 */
import {
  chatActionSchema,
  messageFlags,
  moderateText,
  VOICE_MESSAGE_MAX_SECONDS,
  VOICE_MESSAGE_MIN_SECONDS,
} from '../../../../packages/shared/src/index.ts';
import { mp4DurationMs } from '../media.ts';
import type { Result } from '../types.ts';
import { blocked, fail, ok } from '../types.ts';
import { VOICE_MAX_BYTES } from './media.ts';
import { VIEW_URL_SECONDS } from './sign.ts';
import { activeUser, type TurDeps } from './tur.ts';

const voicePath = (userId: string, voiceId: string) => `u_${userId}/messages/${voiceId}.m4a`;

type Json = Record<string, unknown>;

export async function chatAction(
  deps: TurDeps,
  token: string | null,
  raw: unknown,
): Promise<Result<Json>> {
  const a = await activeUser(deps, token);
  if ('error' in a) return a.error!;
  const parsed = chatActionSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');
  const req = parsed.data;
  const userId = a.user.id;

  switch (req.action) {
    case 'send': {
      const r = await deps.tur.messageSend({
        userId,
        tableId: req.tableId,
        clientId: req.clientId,
        body: req.text,
        replyTo: req.replyTo ?? null,
        flags: { ...messageFlags(req.text) },
      });
      if (r.result === 'ok') return ok({ ok: true, message: r.message });
      if (r.result === 'not_active') return fail(409, 'table_closed');
      if (r.result === 'link_blocked') return fail(403, 'link_blocked');
      return fail(404, 'not_found');
    }

    case 'voice_upload_url': {
      const voiceId = crypto.randomUUID();
      const target = await deps.store.signedUploadUrl('quarantine', voicePath(userId, voiceId));
      return ok({
        ok: true,
        id: voiceId,
        bucket: 'quarantine',
        path: target.path,
        token: target.token,
      });
    }

    case 'send_voice': {
      // SOH-10: a readable recording of 1–60 seconds; anything else is refused and removed.
      const path = voicePath(userId, req.voiceId);
      const bytes = await deps.store.download('quarantine', path);
      if (!bytes) return fail(404, 'not_found');
      await deps.store.remove('quarantine', [path]);
      const ms = bytes.length <= VOICE_MAX_BYTES ? mp4DurationMs(bytes) : null;
      if (
        ms === null ||
        ms < VOICE_MESSAGE_MIN_SECONDS * 1000 ||
        ms > VOICE_MESSAGE_MAX_SECONDS * 1000 + 500
      ) {
        return {
          ok: false,
          status: 400,
          error: 'invalid_input',
          details: { reason: 'voice_duration' },
        };
      }
      await deps.store.upload('public-voice', path, bytes, 'audio/mp4');
      const r = await deps.tur.messageSend({
        userId,
        tableId: req.tableId,
        clientId: req.clientId,
        kind: 'voice',
        body: null,
        mediaPath: path,
        replyTo: null,
        flags: { durationMs: Math.min(ms, VOICE_MESSAGE_MAX_SECONDS * 1000) },
      });
      if (r.result === 'ok') return ok({ ok: true, message: r.message });
      await deps.store.remove('public-voice', [path]);
      return r.result === 'not_active' ? fail(409, 'table_closed') : fail(404, 'not_found');
    }

    case 'media_url': {
      const path = await deps.tur.messageMedia(userId, req.messageId);
      const url = path ? await deps.store.signedUrl('public-voice', path, VIEW_URL_SECONDS) : null;
      return url ? ok({ ok: true, url }) : fail(404, 'not_found');
    }

    case 'read': {
      await deps.tur.messagesRead(userId, req.tableId);
      return ok({ ok: true });
    }

    case 'farewell': {
      const note = req.note || null;
      if (note) {
        const v = moderateText(note);
        if (v.action !== 'allow') return blocked('note', v.reason);
      }
      const r = await deps.tur.tableFarewell(userId, req.tableId, req.key, note);
      if (r === 'already_closed') return fail(409, 'table_closed');
      return r === 'ok' ? ok({ ok: true }) : fail(404, 'not_found');
    }

    case 'reopen': {
      const r = await deps.tur.tableReopen(userId, req.tableId);
      if (r === 'too_late') return fail(409, 'reopen_too_late');
      if (r === 'not_found') return fail(404, 'not_found');
      return ok({ ok: true, result: r });
    }

    case 'block': {
      const r = await deps.tur.blockFromTable(userId, req.tableId);
      return r === 'ok' ? ok({ ok: true }) : fail(404, 'not_found');
    }
  }
}
