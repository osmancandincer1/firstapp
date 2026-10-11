/**
 * The Round, answers and tables (APP.md §4.1, §4.2, §4.4).
 *
 * Every write goes through srv_* functions that hold the rules (§13.4); this
 * layer validates input, moderates text, checks copy-paste answers, handles
 * voice answers and signs media URLs.
 */
import {
  answerActionSchema,
  ANSWER_VOICE_MAX_SECONDS,
  ANSWER_VOICE_MIN_SECONDS,
  checkAnswerText,
  copyPasteVerdict,
  moderateText,
  tablesActionSchema,
  turActionSchema,
} from '../../../../packages/shared/src/index.ts';
import { mp4DurationMs } from '../media.ts';
import type { AuthAdmin, Db, MediaStore, Result, TurDb } from '../types.ts';
import { blocked, fail, ok } from '../types.ts';
import { signItems, signProfiles } from './sign.ts';
import { VOICE_MAX_BYTES } from './media.ts';

export interface TurDeps {
  db: Pick<Db, 'profileState'>;
  tur: TurDb;
  auth: AuthAdmin;
  store: MediaStore;
}

type Json = Record<string, unknown>;

async function activeUser(deps: TurDeps, token: string | null) {
  const user = token ? await deps.auth.userFromToken(token) : null;
  if (!user) return { error: fail(401, 'not_authenticated') } as const;
  const state = await deps.db.profileState(user.id);
  if (!state || state.status !== 'active') return { error: fail(409, 'wrong_step') } as const;
  return { user } as const;
}

export async function turAction(
  deps: TurDeps,
  token: string | null,
  raw: unknown,
): Promise<Result<Json>> {
  const a = await activeUser(deps, token);
  if ('error' in a) return a.error!;
  const parsed = turActionSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');
  const req = parsed.data;
  const userId = a.user.id;

  switch (req.action) {
    case 'view': {
      const tur = await deps.tur.currentTur(userId);
      if (!tur) return ok({ ok: true, tur: null });
      const cards = await signItems(deps.store, (tur.cards as Json[]) ?? []);
      return ok({ ok: true, tur: { ...tur, cards } });
    }
    case 'saved': {
      const saved = await signItems(deps.store, await deps.tur.saved(userId));
      return ok({ ok: true, saved });
    }
    case 'pass':
    case 'save':
    case 'unsave': {
      const r = await deps.tur.turAction(userId, req.cardId, req.action);
      if (r === 'saved_limit') return fail(409, 'saved_limit');
      return r === 'ok' ? ok({ ok: true }) : fail(404, 'not_found');
    }
    case 'less':
      await deps.tur.lessLikeThis(userId, req.reasonKey);
      return ok({ ok: true });
  }
}

/** Voice answers live under the sender's own folder, so ids cannot point at someone else's file. */
const voiceAnswerPath = (userId: string, voiceId: string) => `u_${userId}/answers/${voiceId}.m4a`;

const CREATE_ERRORS: Record<string, Result<never>> = {
  not_in_tur: fail(409, 'not_in_tur'),
  already_answered: fail(409, 'not_in_tur'),
  daily_limit: { ok: false, status: 429, error: 'answer_limit', details: { reason: 'daily' } },
  pending_limit: { ok: false, status: 429, error: 'answer_limit', details: { reason: 'pending' } },
  not_active: fail(409, 'wrong_step'),
};

export async function answerAction(
  deps: TurDeps,
  token: string | null,
  raw: unknown,
): Promise<Result<Json>> {
  const a = await activeUser(deps, token);
  if ('error' in a) return a.error!;
  const parsed = answerActionSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');
  const req = parsed.data;
  const userId = a.user.id;

  switch (req.action) {
    case 'inbox': {
      const box = await deps.tur.inbox(userId);
      const [incoming, outgoing] = await Promise.all([
        signItems(deps.store, box.incoming, (i) => (i.voicePath as string | null) ?? null),
        signItems(deps.store, box.outgoing),
      ]);
      return ok({ ok: true, incoming, outgoing });
    }

    case 'voice_upload_url': {
      const voiceId = crypto.randomUUID();
      const target = await deps.store.signedUploadUrl(
        'quarantine',
        voiceAnswerPath(userId, voiceId),
      );
      return ok({
        ok: true,
        id: voiceId,
        bucket: 'quarantine',
        path: target.path,
        token: target.token,
      });
    }

    case 'send': {
      let text: string | null = null;
      let voicePath: string | null = null;
      let voiceMs: number | null = null;
      let warning: 'similar' | undefined;

      if (req.text !== undefined) {
        text = req.text.trim();
        const shape = checkAnswerText(text);
        if (shape !== 'ok')
          return { ok: false, status: 400, error: 'answer_invalid', details: { reason: shape } };
        const mod = moderateText(text);
        if (mod.action === 'block') return blocked('text', mod.reason);
        // Copy-paste check over the last 24 hours (§4.2, MAS-03).
        const verdict = copyPasteVerdict(text, await deps.tur.recentAnswerTexts(userId));
        if (verdict === 'block') return fail(429, 'answer_duplicate');
        if (verdict === 'warn') warning = 'similar';
      } else {
        const quarantinePath = voiceAnswerPath(userId, req.voiceId!);
        const bytes = await deps.store.download('quarantine', quarantinePath);
        if (!bytes) return fail(404, 'not_found');
        await deps.store.remove('quarantine', [quarantinePath]);
        const ms = bytes.length <= VOICE_MAX_BYTES ? mp4DurationMs(bytes) : null;
        if (
          ms === null ||
          ms < ANSWER_VOICE_MIN_SECONDS * 1000 ||
          ms > ANSWER_VOICE_MAX_SECONDS * 1000 + 500
        ) {
          return {
            ok: false,
            status: 400,
            error: 'answer_invalid',
            details: { reason: 'voice_duration' },
          };
        }
        voicePath = quarantinePath;
        voiceMs = Math.min(ms, ANSWER_VOICE_MAX_SECONDS * 1000);
        await deps.store.upload('public-voice', voicePath, bytes, 'audio/mp4');
      }

      const r = await deps.tur.answerCreate({
        userId,
        candidateId: req.candidateId,
        text,
        voicePath,
        voiceMs,
      });
      if (r.result !== 'ok') {
        if (voicePath) await deps.store.remove('public-voice', [voicePath]);
        return CREATE_ERRORS[r.result] ?? fail(500, 'internal');
      }
      return ok({ ok: true, answerId: r.answerId!, ...(warning ? { warning } : {}) });
    }

    case 'reciprocate': {
      const mod = moderateText(req.message);
      if (mod.action === 'block') return blocked('message', mod.reason);
      const r = await deps.tur.answerRespond(
        userId,
        req.answerId,
        'reciprocate',
        req.message.trim(),
      );
      if (r.result !== 'ok') return fail(404, 'not_found');
      return ok({ ok: true, tableId: r.tableId!, tableStatus: r.tableStatus! });
    }

    case 'pass': {
      const r = await deps.tur.answerRespond(userId, req.answerId, 'pass', null);
      return r.result === 'passed' ? ok({ ok: true }) : fail(404, 'not_found');
    }
  }
}

export async function tablesAction(
  deps: TurDeps,
  token: string | null,
  raw: unknown,
): Promise<Result<Json>> {
  const a = await activeUser(deps, token);
  if ('error' in a) return a.error!;
  if (!tablesActionSchema.safeParse(raw).success) return fail(400, 'invalid_input');
  const tables = await signItems(deps.store, await deps.tur.myTables(a.user.id));
  return ok({ ok: true, tables });
}

export { signProfiles };
