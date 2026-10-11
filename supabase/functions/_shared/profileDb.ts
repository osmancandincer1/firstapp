/** ProfileDb on the srv_* functions of the profile migration (service role). */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Bucket, MediaStatus, ProfileDb } from './types.ts';

async function rpc<T>(c: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.code ?? ''} ${error.message}`);
  return data as T;
}

export class SupabaseProfileDb implements ProfileDb {
  constructor(private c: SupabaseClient) {}

  updateBasics(userId: string, b: Parameters<ProfileDb['updateBasics']>[1]) {
    return rpc<'ok' | 'name_locked' | 'not_found'>(this.c, 'srv_update_basics', {
      p_user_id: userId,
      p_name: b.name,
      p_gender: b.gender,
      p_gender_custom: b.genderCustom,
      p_show_gender: b.showGender,
      p_seeking: b.seeking,
    });
  }
  updateIntent(userId: string, intent: string, tempo: string, dealbreakers: unknown) {
    return rpc<string>(this.c, 'srv_update_intent', {
      p_user_id: userId,
      p_intent: intent,
      p_tempo: tempo,
      p_dealbreakers: dealbreakers,
    });
  }
  setDoorQuestion(userId: string, presetId: string | null, customText: string | null) {
    return rpc<'ok' | 'locked' | 'invalid_preset' | 'not_found'>(this.c, 'srv_set_door_question', {
      p_user_id: userId,
      p_preset_id: presetId,
      p_custom_text: customText,
    });
  }
  setInterests(userId: string, ids: string[]) {
    return rpc<'ok' | 'invalid' | 'not_found'>(this.c, 'srv_set_interests', {
      p_user_id: userId,
      p_ids: ids,
    });
  }
  updateDetails(
    userId: string,
    data: Record<string, unknown>,
    visibility: Record<string, boolean>,
  ) {
    return rpc<string>(this.c, 'srv_update_details', {
      p_user_id: userId,
      p_data: data,
      p_visibility: visibility,
    });
  }
  setLocation(
    userId: string,
    cityId: number,
    districtId: number | null,
    lat: number | null,
    lng: number | null,
  ) {
    return rpc<'ok' | 'invalid_city' | 'invalid_district' | 'not_found'>(
      this.c,
      'srv_set_location',
      {
        p_user_id: userId,
        p_city_id: cityId,
        p_district_id: districtId,
        p_lat: lat,
        p_lng: lng,
      },
    );
  }
  async addPendingEdit(userId: string, field: string, value: unknown, reason: string) {
    await rpc(this.c, 'srv_add_pending_edit', {
      p_user_id: userId,
      p_field: field,
      p_value: value,
      p_reason: reason,
    });
  }
  tryCompleteOnboarding(userId: string) {
    return rpc<string | null>(this.c, 'srv_try_complete_onboarding', { p_user_id: userId });
  }
  photoCreate(userId: string) {
    return rpc<string | null>(this.c, 'srv_photo_create', { p_user_id: userId });
  }
  photoGet(userId: string, photoId: string) {
    return rpc<{
      id: string;
      status: MediaStatus;
      quarantinePath: string | null;
      isMain: boolean;
    } | null>(this.c, 'srv_photo_get', { p_user_id: userId, p_photo_id: photoId });
  }
  photoFinish(i: Parameters<ProfileDb['photoFinish']>[0]) {
    return rpc<'ok' | 'not_found'>(this.c, 'srv_photo_finish', {
      p_user_id: i.userId,
      p_photo_id: i.photoId,
      p_status: i.status,
      p_reason: i.reason,
      p_face_matched: i.faceMatched,
      p_public_path: i.publicPath,
      p_width: i.width,
      p_height: i.height,
    });
  }
  photoReorder(userId: string, ids: string[]) {
    return rpc<'ok' | 'invalid'>(this.c, 'srv_photo_reorder', { p_user_id: userId, p_ids: ids });
  }
  photoDelete(userId: string, photoId: string) {
    return rpc<string[] | null>(this.c, 'srv_photo_delete', {
      p_user_id: userId,
      p_photo_id: photoId,
    });
  }
  photoCaption(userId: string, photoId: string, caption: string | null) {
    return rpc<'ok' | 'not_found'>(this.c, 'srv_photo_caption', {
      p_user_id: userId,
      p_photo_id: photoId,
      p_caption: caption,
    });
  }
  voiceCreate(userId: string, promptId: string) {
    return rpc<string | null>(this.c, 'srv_voice_create', {
      p_user_id: userId,
      p_prompt_id: promptId,
    });
  }
  voiceGet(userId: string, voiceId: string) {
    return rpc<{ id: string; status: MediaStatus; quarantinePath: string | null } | null>(
      this.c,
      'srv_voice_get',
      {
        p_user_id: userId,
        p_voice_id: voiceId,
      },
    );
  }
  voiceFinish(i: Parameters<ProfileDb['voiceFinish']>[0]) {
    return rpc<string[] | null>(this.c, 'srv_voice_finish', {
      p_user_id: i.userId,
      p_voice_id: i.voiceId,
      p_status: i.status,
      p_reason: i.reason,
      p_duration_ms: i.durationMs,
      p_public_path: i.publicPath,
    });
  }
  voiceDelete(userId: string) {
    return rpc<string[]>(this.c, 'srv_voice_delete', { p_user_id: userId });
  }
  myPublicProfile(userId: string) {
    return rpc<Record<string, unknown> | null>(this.c, 'srv_my_public_profile', {
      p_user_id: userId,
    });
  }
  updatePreferences(userId: string, prefs: unknown) {
    return rpc<string>(this.c, 'srv_update_preferences', { p_user_id: userId, p_prefs: prefs });
  }
  myMedia(userId: string) {
    return rpc<{ id: string; kind: 'photo' | 'voice'; bucket: Bucket; path: string }[]>(
      this.c,
      'srv_my_media',
      {
        p_user_id: userId,
      },
    );
  }
}
