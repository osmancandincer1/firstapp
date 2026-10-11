/**
 * Replaces storage paths in public profiles with short-lived signed URLs
 * (§13.7, PRO-05). Raw paths of other people's media never leave the server.
 */
import type { MediaStore } from '../types.ts';

export const VIEW_URL_SECONDS = 600;

type Json = Record<string, unknown>;

interface PhotoRef {
  id: string;
  path?: string;
  caption?: string;
  url?: string;
}
interface VoiceRef {
  path?: string;
  url?: string;
}

/** Collects every photo and voice path found in the given public profiles. */
function collect(profiles: (Json | null | undefined)[]) {
  const photos = new Set<string>();
  const voices = new Set<string>();
  for (const p of profiles) {
    if (!p) continue;
    for (const ph of (p.photos as PhotoRef[] | undefined) ?? []) if (ph.path) photos.add(ph.path);
    const v = p.voice as VoiceRef | undefined;
    if (v?.path) voices.add(v.path);
  }
  return { photos: [...photos], voices: [...voices] };
}

/**
 * Signs the media of many profiles with two storage calls and returns new
 * profile objects where `path` is replaced by `url`.
 */
export async function signProfiles(
  store: MediaStore,
  profiles: (Json | null | undefined)[],
): Promise<(Json | null)[]> {
  const { photos, voices } = collect(profiles);
  const [photoUrls, voiceUrls] = await Promise.all([
    store.signedUrls('public-photos', photos, VIEW_URL_SECONDS),
    store.signedUrls('public-voice', voices, VIEW_URL_SECONDS),
  ]);
  return profiles.map((p) => {
    if (!p) return null;
    const out: Json = { ...p };
    out.photos = ((p.photos as PhotoRef[] | undefined) ?? [])
      .map(({ path, ...rest }) => ({ ...rest, url: path ? photoUrls[path] : undefined }))
      .filter((ph) => ph.url);
    const v = p.voice as (VoiceRef & Json) | undefined;
    if (v) {
      const { path, ...rest } = v;
      out.voice = path && voiceUrls[path] ? { ...rest, url: voiceUrls[path] } : undefined;
      if (!out.voice) delete out.voice;
    }
    delete out.id;
    return out;
  });
}

/** Signs the `profile` field of each item in a list (cards, answers, tables). */
export async function signItems<T extends Json>(
  store: MediaStore,
  items: T[],
  extraVoice?: (item: T) => string | null,
) {
  const signed = await signProfiles(
    store,
    items.map((i) => i.profile as Json | null),
  );
  const extra = extraVoice ? items.map(extraVoice).filter((p): p is string => Boolean(p)) : [];
  const extraUrls = extra.length
    ? await store.signedUrls('public-voice', extra, VIEW_URL_SECONDS)
    : {};
  return items.map((item, i) => {
    const out: Json = { ...item, profile: signed[i] };
    const vp = extraVoice?.(item);
    if (vp) {
      out.voiceUrl = extraUrls[vp];
      delete out.voicePath;
    }
    return out;
  });
}
