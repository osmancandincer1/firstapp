/**
 * Profile updates (APP.md §6.1 steps 7, 10–13, §6.4, PRO-08, PRO-09).
 *
 * Every free-text value goes through moderateText first:
 *   allow  -> stored right away;
 *   block  -> refused with the field and the reason (§7.2 "Engelle");
 *   review -> held as a pending edit; the published value stays (PRO-08).
 * Section order follows §6.1: basics need completed consents, the rest need a
 * passed liveness check.
 */
import {
  MODERATED_DETAIL_KEYS,
  moderateText,
  profileUpdateSchema,
  roundToGrid,
  type ProfileUpdateResponse,
} from '../../../../packages/shared/src/index.ts';
import type { AuthAdmin, Db, ProfileDb, RequestContext, Result } from '../types.ts';
import { blocked, fail, ok } from '../types.ts';

export interface ProfileDeps {
  db: Pick<Db, 'profileState'>;
  profile: ProfileDb;
  auth: AuthAdmin;
}

type TextCheck =
  { kind: 'ok' } | { kind: 'blocked'; result: Result<never> } | { kind: 'review'; reason: string };

function checkTexts(entries: [field: string, value: string | null | undefined][]): TextCheck {
  let review: string | null = null;
  for (const [field, value] of entries) {
    if (!value) continue;
    const v = moderateText(value);
    if (v.action === 'block') return { kind: 'blocked', result: blocked(field, v.reason) };
    if (v.action === 'review') review = v.reason;
  }
  return review ? { kind: 'review', reason: review } : { kind: 'ok' };
}

export async function updateProfile(
  deps: ProfileDeps,
  token: string | null,
  raw: unknown,
  _ctx: RequestContext,
): Promise<Result<ProfileUpdateResponse>> {
  const user = token ? await deps.auth.userFromToken(token) : null;
  if (!user) return fail(401, 'not_authenticated');
  const parsed = profileUpdateSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'invalid_input');
  const req = parsed.data;

  const state = await deps.db.profileState(user.id);
  if (!state || !['onboarding', 'active', 'paused'].includes(state.status))
    return fail(409, 'wrong_step');
  const ready =
    req.section === 'basics'
      ? state.consentsComplete
      : req.section === 'preferences'
        ? state.status === 'active' || state.status === 'paused'
        : state.livenessVerified;
  if (!ready) return fail(409, 'wrong_step');

  const done = async (pending = false): Promise<Result<ProfileUpdateResponse>> => {
    const status = await deps.profile.tryCompleteOnboarding(user.id);
    return ok({ ok: true, ...(pending ? { pending: true } : {}), ...(status ? { status } : {}) });
  };

  switch (req.section) {
    case 'basics': {
      const d = req.data;
      const check = checkTexts([
        ['name', d.name],
        ['genderCustom', d.genderCustom],
      ]);
      if (check.kind === 'blocked') return check.result;
      if (check.kind === 'review') {
        await deps.profile.addPendingEdit(user.id, 'basics', d, check.reason);
        return done(true);
      }
      const r = await deps.profile.updateBasics(user.id, {
        name: d.name,
        gender: d.gender,
        genderCustom: d.genderCustom ?? null,
        showGender: d.showGender,
        seeking: d.seeking,
      });
      if (r === 'name_locked') return fail(429, 'change_limited');
      return r === 'ok' ? done() : fail(404, 'not_found');
    }

    case 'intent': {
      const d = req.data;
      await deps.profile.updateIntent(user.id, d.intent, d.tempo, d.dealbreakers);
      return done();
    }

    case 'door_question': {
      const d = req.data;
      if ('customText' in d) {
        const check = checkTexts([['customText', d.customText]]);
        if (check.kind === 'blocked') return check.result;
        if (check.kind === 'review') {
          await deps.profile.addPendingEdit(user.id, 'door_question', d, check.reason);
          return done(true);
        }
      }
      const r = await deps.profile.setDoorQuestion(
        user.id,
        'presetId' in d ? d.presetId : null,
        'customText' in d ? d.customText : null,
      );
      if (r === 'locked') return fail(429, 'change_limited');
      if (r === 'invalid_preset') return fail(400, 'invalid_input');
      return r === 'ok' ? done() : fail(404, 'not_found');
    }

    case 'interests': {
      const r = await deps.profile.setInterests(user.id, req.data.ids);
      if (r === 'invalid') return fail(400, 'invalid_input');
      return r === 'ok' ? done() : fail(404, 'not_found');
    }

    case 'details': {
      const data: Record<string, unknown> = { ...req.data };
      const texts: [string, string][] = [];
      for (const key of MODERATED_DETAIL_KEYS) {
        const v = data[key];
        if (typeof v === 'string') texts.push([key, v]);
        if (Array.isArray(v)) for (const item of v) texts.push([key, String(item)]);
      }
      // Each field is judged on its own: one field under review does not hold back the others.
      const held: Record<string, unknown> = {};
      for (const [field, value] of texts) {
        const v = moderateText(value);
        if (v.action === 'block') return blocked(field, v.reason);
        if (v.action === 'review') held[field] = data[field];
      }
      for (const field of Object.keys(held)) {
        delete data[field];
        await deps.profile.addPendingEdit(user.id, `details.${field}`, held[field], 'commercial');
      }
      await deps.profile.updateDetails(user.id, data, req.visibility ?? {});
      return done(Object.keys(held).length > 0);
    }

    case 'preferences': {
      // Takes effect from the next Round (§6.6, TUR-09).
      await deps.profile.updatePreferences(user.id, req.data);
      return ok({ ok: true });
    }

    case 'location': {
      const d = req.data;
      const grid = d.coords ? roundToGrid(d.coords) : null;
      const r = await deps.profile.setLocation(
        user.id,
        d.cityId,
        d.districtId ?? null,
        grid?.lat ?? null,
        grid?.lng ?? null,
      );
      if (r === 'invalid_city' || r === 'invalid_district') return fail(400, 'invalid_input');
      return r === 'ok' ? done() : fail(404, 'not_found');
    }
  }
}
