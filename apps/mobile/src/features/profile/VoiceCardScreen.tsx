import { VOICE_MAX_SECONDS, VOICE_MIN_SECONDS } from '@nokuzo/shared';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, Banner, Button, ChipGroup, Skeleton } from '@/components';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import type { ClientErrorCode } from '@/lib/api';
import { readBytes } from '@/lib/media';
import { deleteVoice, processVoice, requestVoiceUpload, uploadToQuarantine } from './api';
import { ProfileFormScreen } from './ProfileFormScreen';
import { useInitialValues } from './useInitialValues';
import { useMyProfile, useProfileView, useRefreshProfile, useVoicePrompts } from './queries';

/** §6.4 Ses kartı: pick a prompt, record 5–20 s, listen, save. Optional. */
export function VoiceCardScreen() {
  const { t, i18n } = useTranslation();
  const me = useMyProfile();
  const view = useProfileView();
  const prompts = useVoicePrompts();
  const refresh = useRefreshProfile();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder);
  const [promptId, setPromptId] = useState<string | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const existingUrl = me.data?.voice && view.data ? view.data.media[me.data.voice.id] : undefined;
  const player = useAudioPlayer(recordedUri ?? existingUrl ?? null);
  const seconds = Math.floor((rec.durationMillis ?? 0) / 1000);

  useInitialValues(me.data, (p) => {
    if (p.voice?.promptId) setPromptId(p.voice.promptId);
  });

  // Hard stop at the maximum length.
  useEffect(() => {
    if (rec.isRecording && seconds >= VOICE_MAX_SECONDS) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.isRecording, seconds]);

  const start = async () => {
    setNotice(null);
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setNotice(t('profile.voice.permission'));
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    setRecordedUri(null);
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  async function stop() {
    const length = rec.durationMillis ?? 0;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (length < VOICE_MIN_SECONDS * 1000) {
      setNotice(t('profile.voice.tooShort'));
      return;
    }
    setRecordedUri(recorder.uri);
  }

  const upload = async () => {
    if (!promptId || !recordedUri || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const target = await requestVoiceUpload(promptId);
    if (!target.ok) {
      setError(target.error);
    } else {
      const sent = await uploadToQuarantine(target.data, await readBytes(recordedUri), 'audio/mp4');
      const result = sent.ok ? await processVoice(target.data.id) : sent;
      if (!result.ok) setError(result.error);
      else if (result.data.status === 'rejected')
        setNotice(t(`profile.voice.reasons.${result.data.reason ?? 'duration'}`));
      else setRecordedUri(null);
    }
    await refresh();
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    const r = await deleteVoice();
    if (!r.ok) setError(r.error);
    await refresh();
    setBusy(false);
  };

  return (
    <ProfileFormScreen
      mode="edit"
      step="interests"
      title={t('profile.voice.title')}
      subtitle={t('profile.voice.subtitle')}
      testID="voice"
      footer={
        <>
          {rec.isRecording ? (
            <Button label={t('profile.voice.stop')} onPress={() => void stop()} />
          ) : (
            <Button
              variant="secondary"
              label={t('profile.voice.record')}
              onPress={() => void start()}
              disabled={!promptId || busy}
            />
          )}
          <Button
            label={t('profile.voice.upload')}
            onPress={() => void upload()}
            disabled={!recordedUri || !promptId}
            loading={busy}
          />
        </>
      }
    >
      <AppText variant="label">{t('profile.voice.prompt')}</AppText>
      {prompts.isPending ? (
        <Skeleton height={44} />
      ) : (
        <ChipGroup<string>
          label={t('profile.voice.prompt')}
          options={(prompts.data ?? []).map((p) => ({
            value: p.id,
            label: i18n.language === 'en' ? p.text_en : p.text_tr,
          }))}
          selected={promptId ? [promptId] : []}
          onToggle={setPromptId}
        />
      )}
      {rec.isRecording ? (
        <AppText accessibilityLiveRegion="polite">
          {t('profile.voice.recording', { seconds })}
        </AppText>
      ) : null}
      {recordedUri || existingUrl ? (
        <Button
          variant="ghost"
          label={t('profile.voice.play')}
          onPress={() => {
            player.seekTo(0);
            player.play();
          }}
        />
      ) : null}
      {me.data?.voice ? (
        <Button
          variant="danger"
          label={t('profile.voice.remove')}
          onPress={() => void remove()}
          disabled={busy}
        />
      ) : null}
      {notice ? <Banner tone="warning" message={notice} testID="voice-notice" /> : null}
      <ErrorNotice error={error} />
    </ProfileFormScreen>
  );
}
