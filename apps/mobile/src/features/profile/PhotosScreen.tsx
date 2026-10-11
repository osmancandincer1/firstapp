import { CAPTION_MAX, PHOTOS_MAX, PHOTOS_MIN } from '@nokuzo/shared';
import { radius, space } from '@nokuzo/design-tokens';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Banner, Button, Card, Input, Skeleton } from '@/components';
import { useTheme } from '@/design/theme';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import { useOnboardingState } from '@/features/onboarding/gate';
import { useAdvance } from '@/features/onboarding/useAdvance';
import type { ClientErrorCode } from '@/lib/api';
import { isTooSmall, needsCrop, prepareImage } from '@/lib/media';
import {
  captionPhoto,
  deletePhoto,
  processPhoto,
  reorderPhotos,
  requestPhotoUpload,
  uploadToQuarantine,
  type MyPhoto,
} from './api';
import { CropModal } from './CropModal';
import { ProfileFormScreen, type FormMode } from './ProfileFormScreen';
import { useMyProfile, useProfileView, useRefreshProfile } from './queries';

type Notice = { kind: 'error'; error: ClientErrorCode } | { kind: 'reason'; reason: string } | null;

/** A picked photo waiting in the tray until the user confirms. */
export interface TrayItem {
  key: string;
  uri: string;
  width: number;
  height: number;
  /** Set when sending failed before the server could judge the photo. */
  error?: ClientErrorCode;
}

export type TrayCheck = 'ok' | 'crop' | 'too_small';
export const trayCheck = (i: TrayItem): TrayCheck =>
  isTooSmall(i.width, i.height) ? 'too_small' : needsCrop(i.width, i.height) ? 'crop' : 'ok';

/** Moves `id` by `delta` within the live photo order (rejected photos excluded). */
export function moved(ids: string[], id: string, delta: number): string[] {
  const i = ids.indexOf(id);
  const j = Math.max(0, Math.min(ids.length - 1, i + delta));
  if (i < 0 || i === j) return ids;
  const next = [...ids];
  next.splice(i, 1);
  next.splice(j, 0, id);
  return next;
}

/**
 * §6.1 step 9 / §6.4: 3–6 photos, statuses and reasons, order, captions.
 * Several photos are picked at once and wait side by side in a tray; tapping
 * one opens a quick crop (required only when the shape does not fit the 4:5
 * frame). Nothing is uploaded until "Onayla ve ekle".
 */
export function PhotosScreen({ mode = 'onboarding' }: { mode?: FormMode }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const advance = useAdvance();
  const refresh = useRefreshProfile();
  const me = useMyProfile();
  const view = useProfileView();
  const state = useOnboardingState();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [tray, setTray] = useState<TrayItem[]>([]);
  const [cropping, setCropping] = useState<TrayItem | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const photos = me.data?.photos ?? [];
  const live = photos.filter((p) => p.status !== 'rejected');
  const liveIds = live.map((p) => p.id);
  const complete = Boolean(state.data?.photosComplete);
  const room = PHOTOS_MAX - live.length - tray.length;
  const blocked = tray.filter((i) => trayCheck(i) !== 'ok');

  const run = useCallback(
    async (work: () => Promise<Notice>) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      const n = await work();
      await refresh();
      setNotice(n);
      setBusy(false);
    },
    [busy, refresh],
  );

  const pick = async () => {
    setNotice(null);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: room,
      orderedSelection: true,
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const stamp = Date.now();
    const added = picked.assets.slice(0, room).map((a, n) => ({
      key: `${stamp}-${n}`,
      uri: a.uri,
      width: a.width,
      height: a.height,
    }));
    setTray((current) => [...current, ...added]);
  };

  const sendOne = async (item: TrayItem): Promise<'done' | ClientErrorCode> => {
    const prepared = await prepareImage(item.uri, item.width, item.height);
    if (!prepared.ok) return 'invalid_input';
    const target = await requestPhotoUpload();
    if (!target.ok) return target.error;
    const uploaded = await uploadToQuarantine(target.data, prepared.bytes, 'image/jpeg');
    if (!uploaded.ok) return uploaded.error;
    const result = await processPhoto(target.data.id);
    // Approved, rejected (with a reason) or in review: the server now lists it.
    return result.ok ? 'done' : result.error;
  };

  /** Uploads the tray one by one; the server's verdict then shows in the list above. */
  const confirm = () =>
    run(async () => {
      const queue = tray.filter((i) => trayCheck(i) === 'ok');
      const failed: TrayItem[] = [];
      setProgress({ done: 0, total: queue.length });
      for (const [n, item] of queue.entries()) {
        const outcome = await sendOne(item);
        if (outcome !== 'done') failed.push({ ...item, error: outcome });
        setProgress({ done: n + 1, total: queue.length });
      }
      setProgress(null);
      setTray(failed);
      return failed.length ? { kind: 'error', error: failed[0]!.error! } : null;
    });

  const reorder = (ids: string[]) =>
    run(async () => {
      const r = await reorderPhotos(ids);
      return r.ok ? null : { kind: 'error', error: r.error };
    });
  const remove = (id: string) =>
    run(async () => {
      const r = await deletePhoto(id);
      return r.ok ? null : { kind: 'error', error: r.error };
    });
  const saveCaption = (id: string, caption: string) =>
    run(async () => {
      const r = await captionPhoto(id, caption);
      if (r.ok) return null;
      return r.error === 'text_blocked' && r.reason
        ? { kind: 'reason', reason: `caption:${r.reason}` }
        : { kind: 'error', error: r.error };
    });

  const reasonText = (reason: string) =>
    reason.startsWith('caption:')
      ? t(`profile.textBlocked.${reason.slice(8)}`)
      : t(`profile.photos.reasons.${reason}`);

  return (
    <ProfileFormScreen
      mode={mode}
      step="photos"
      title={t('profile.photos.title')}
      subtitle={t('profile.photos.subtitle')}
      testID="photos"
      footer={
        <>
          {tray.length ? (
            <Button
              label={t('profile.photos.confirm', { count: tray.length - blocked.length })}
              onPress={() => void confirm()}
              disabled={busy || blocked.length > 0}
              loading={busy}
            />
          ) : null}
          <Button
            variant="secondary"
            label={room <= 0 ? t('profile.photos.limit') : t('profile.photos.add')}
            onPress={() => void pick()}
            // The free slots are only known once the saved photos have loaded.
            disabled={room <= 0 || busy || me.isPending}
          />
          {mode === 'onboarding' && tray.length === 0 ? (
            <Button
              label={t('common.continue')}
              disabled={!complete}
              onPress={() => void advance()}
            />
          ) : null}
        </>
      }
    >
      {me.isPending ? (
        <Skeleton height={160} />
      ) : (
        photos.map((p: MyPhoto, i) => {
          const url = view.data?.media[p.id];
          const statusLabel = t(`profile.photos.status.${p.status}`);
          const liveIndex = liveIds.indexOf(p.id);
          return (
            <Card key={p.id} testID={`photo-${i}`}>
              <View style={styles.row}>
                {url ? (
                  <Image
                    source={{ uri: url }}
                    style={[styles.thumb, { backgroundColor: colors.bgSunken }]}
                    accessibilityLabel={`${t('profile.photos.slot', { index: i + 1 })}, ${statusLabel}`}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: colors.bgSunken }]} />
                )}
                <View style={styles.meta}>
                  <AppText variant="label">
                    {liveIndex === 0
                      ? t('profile.photos.main')
                      : t('profile.photos.slot', { index: i + 1 })}
                  </AppText>
                  <AppText
                    variant="caption"
                    tone={
                      p.status === 'approved'
                        ? 'success'
                        : p.status === 'rejected'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {statusLabel}
                  </AppText>
                  {p.rejectReason ? (
                    <AppText variant="caption" tone="secondary">
                      {reasonText(p.rejectReason)}
                    </AppText>
                  ) : null}
                </View>
              </View>
              {p.status !== 'rejected' ? (
                <>
                  <Input
                    label={t('profile.photos.caption')}
                    defaultValue={p.caption ?? ''}
                    maxLength={CAPTION_MAX}
                    onEndEditing={(e) => {
                      const text = e.nativeEvent.text.trim();
                      if (text !== (p.caption ?? '')) void saveCaption(p.id, text);
                    }}
                  />
                  <View style={styles.actions}>
                    {liveIndex > 0 ? (
                      <Button
                        variant="ghost"
                        label={t('profile.photos.makeMain')}
                        onPress={() => void reorder(moved(liveIds, p.id, -liveIndex))}
                      />
                    ) : null}
                    {liveIndex > 0 ? (
                      <Button
                        variant="ghost"
                        label={t('profile.photos.moveUp')}
                        onPress={() => void reorder(moved(liveIds, p.id, -1))}
                      />
                    ) : null}
                    {liveIndex < liveIds.length - 1 ? (
                      <Button
                        variant="ghost"
                        label={t('profile.photos.moveDown')}
                        onPress={() => void reorder(moved(liveIds, p.id, 1))}
                      />
                    ) : null}
                  </View>
                </>
              ) : null}
              <Button
                variant="danger"
                label={t('profile.photos.delete')}
                onPress={() => void remove(p.id)}
              />
            </Card>
          );
        })
      )}
      {tray.length ? (
        <View style={styles.traySection} testID="tray">
          <AppText variant="label">{t('profile.photos.selected')}</AppText>
          <AppText variant="caption" tone="secondary">
            {t('profile.photos.trayHelp')}
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tray}
          >
            {tray.map((item, n) => {
              const check = trayCheck(item);
              const badge =
                check === 'too_small'
                  ? t('profile.photos.badgeTooSmall')
                  : check === 'crop'
                    ? t('profile.photos.badgeCrop')
                    : item.error
                      ? t('profile.photos.badgeFailed')
                      : null;
              return (
                <View key={item.key} style={styles.trayItem}>
                  <Pressable
                    onPress={() => setCropping(item)}
                    disabled={busy || check === 'too_small'}
                    accessibilityRole="button"
                    accessibilityLabel={[t('profile.photos.selectedN', { index: n + 1 }), badge]
                      .filter(Boolean)
                      .join(', ')}
                    accessibilityHint={
                      check === 'too_small' ? undefined : t('profile.photos.cropHint')
                    }
                    testID={`tray-${n}`}
                  >
                    <Image
                      source={{ uri: item.uri }}
                      style={[
                        styles.trayThumb,
                        { backgroundColor: colors.bgSunken },
                        badge ? { borderColor: colors.warning, borderWidth: 2 } : null,
                      ]}
                      contentFit="cover"
                    />
                  </Pressable>
                  {badge ? (
                    <AppText variant="caption" tone="warning" style={styles.center}>
                      {badge}
                    </AppText>
                  ) : null}
                  <Button
                    variant="ghost"
                    label={t('profile.photos.remove')}
                    onPress={() => setTray((c) => c.filter((x) => x.key !== item.key))}
                    disabled={busy}
                  />
                </View>
              );
            })}
          </ScrollView>
          {blocked.length ? (
            <Banner tone="warning" message={t('profile.photos.fixFirst')} testID="tray-blocked" />
          ) : null}
          {progress ? (
            <AppText accessibilityLiveRegion="polite" testID="tray-progress">
              {t('profile.photos.sending', progress)}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {cropping ? (
        <CropModal
          target={cropping}
          onCancel={() => setCropping(null)}
          onDone={(c) => {
            setTray((list) =>
              list.map((x) => (x.key === cropping.key ? { ...x, ...c, error: undefined } : x)),
            );
            setCropping(null);
          }}
        />
      ) : null}
      {!complete && live.length < PHOTOS_MIN ? (
        <AppText tone="secondary">{t('profile.photos.needMore')}</AppText>
      ) : null}
      {notice?.kind === 'reason' ? (
        <Banner tone="warning" message={reasonText(notice.reason)} testID="photo-notice" />
      ) : null}
      {notice?.kind === 'error' ? <ErrorNotice error={notice.error} /> : null}
      {mode === 'edit' ? (
        <Button
          variant="ghost"
          label={t('profile.home.preview')}
          onPress={() => router.push('/profile/preview')}
        />
      ) : null}
    </ProfileFormScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space(2) },
  thumb: { width: 96, height: 120, borderRadius: radius.sm },
  meta: { flex: 1, gap: space(0.5) },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1) },
  traySection: { gap: space(1) },
  tray: { gap: space(1.5), paddingVertical: space(0.5) },
  trayItem: { width: 96, alignItems: 'center', gap: space(0.5) },
  trayThumb: { width: 96, height: 120, borderRadius: radius.sm },
  center: { textAlign: 'center' },
});
