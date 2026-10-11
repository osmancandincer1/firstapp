import type {
  MediaResult,
  ProfileUpdate,
  ProfileUpdateResponse,
  ProfileViewResponse,
  UploadTarget,
} from '@nokuzo/shared';

import { callFunction, type ApiResult } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export interface MyPhoto {
  id: string;
  position: number;
  status: 'pending' | 'approved' | 'rejected' | 'review';
  rejectReason: string | null;
  faceMatched: boolean;
  caption: string | null;
}

/** The signed-in user's own profile (my_profile()), including hidden fields. */
export interface MyProfile {
  id: string;
  status: string;
  name: string | null;
  gender: string | null;
  genderCustom: string | null;
  showGender: boolean;
  seeking: string[];
  intent: string | null;
  tempo: string | null;
  dealbreakers: { field: string; accepted: string[] }[];
  cityId: number | null;
  districtId: number | null;
  hasLocation: boolean;
  doorQuestion: { presetId: string | null; customText: string | null } | null;
  interestIds: string[];
  details: Record<string, unknown>;
  visibility: Record<string, boolean>;
  photos: MyPhoto[];
  voice: { id: string; status: string; promptId: string | null; durationMs: number | null } | null;
  pendingEdits: { field: string; status: string; reason: string | null }[];
}

export async function fetchMyProfile(): Promise<MyProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_profile');
  if (error) throw new Error(error.message);
  return data as MyProfile | null;
}

export interface Preset {
  id: string;
  category: string;
  text_tr: string;
  text_en: string;
}
export interface Interest {
  id: string;
  category: string;
  label_tr: string;
  label_en: string;
}
export interface VoicePrompt {
  id: string;
  text_tr: string;
  text_en: string;
}
export interface City {
  id: number;
  name: string;
}
export interface District {
  id: number;
  city_id: number;
  name: string;
}

async function select<T>(table: string, columns: string, order: string): Promise<T[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from(table).select(columns).order(order);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export const fetchPresets = () =>
  select<Preset>('question_presets', 'id, category, text_tr, text_en', 'sort');
export const fetchInterests = () =>
  select<Interest>('interests', 'id, category, label_tr, label_en', 'sort');
export const fetchVoicePrompts = () =>
  select<VoicePrompt>('voice_prompts', 'id, text_tr, text_en', 'sort');
export const fetchCities = () => select<City>('cities', 'id, name', 'name');
export const fetchDistricts = () => select<District>('districts', 'id, city_id, name', 'name');

export function updateSection(update: ProfileUpdate): Promise<ApiResult<ProfileUpdateResponse>> {
  return callFunction<ProfileUpdateResponse>('profile-update', update);
}

export const viewProfile = () => callFunction<ProfileViewResponse>('profile-view', {});

export const requestPhotoUpload = () =>
  callFunction<UploadTarget>('profile-photo', { action: 'upload_url' });
export const processPhoto = (photoId: string) =>
  callFunction<MediaResult>('profile-photo', { action: 'process', photoId });
export const reorderPhotos = (ids: string[]) =>
  callFunction<{ ok: true }>('profile-photo', { action: 'reorder', ids });
export const captionPhoto = (photoId: string, caption: string) =>
  callFunction<{ ok: true }>('profile-photo', { action: 'caption', photoId, caption });
export const deletePhoto = (photoId: string) =>
  callFunction<{ ok: true }>('profile-photo', { action: 'delete', photoId });

export const requestVoiceUpload = (promptId: string) =>
  callFunction<UploadTarget>('profile-voice', { action: 'upload_url', promptId });
export const processVoice = (voiceId: string) =>
  callFunction<MediaResult>('profile-voice', { action: 'process', voiceId });
export const deleteVoice = () => callFunction<{ ok: true }>('profile-voice', { action: 'delete' });

/** Uploads bytes with the one-time token issued by the server (quarantine bucket only). */
export async function uploadToQuarantine(
  target: UploadTarget,
  bytes: Uint8Array,
  contentType: string,
): Promise<ApiResult<true>> {
  if (!supabase) return { ok: false, error: 'not_configured' };
  const { error } = await supabase.storage
    .from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, bytes.buffer as ArrayBuffer, { contentType });
  return error ? { ok: false, error: 'network' } : { ok: true, data: true };
}
