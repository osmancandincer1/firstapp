import { minTouchTarget, space } from '@nokuzo/design-tokens';
import {
  VOICE_MESSAGE_MAX_SECONDS,
  VOICE_MESSAGE_MIN_SECONDS,
  type ChatMessage,
} from '@nokuzo/shared';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, FlameGradient, Icon } from '@/components';
import { MicrophoneIcon, PaperPlaneTiltIcon, PauseIcon, PlayIcon, XIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { uploadToQuarantine } from '@/features/profile/api';
import type { ClientErrorCode } from '@/lib/api';
import { readBytes } from '@/lib/media';
import { requestVoiceUpload, sendVoice, voiceUrl } from './api';

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Records a voice message (1–60 s, SOH-10) and sends it. The server checks the
 * length again; a recording that fails to send stays here to try again.
 */
export function VoiceRecorder({
  tableId,
  onSent,
  onError,
  onRecording,
}: {
  tableId: string;
  onSent: (m: ChatMessage) => void;
  onError: (e: ClientErrorCode | 'voice_duration' | 'mic_denied' | null) => void;
  /** Lets the composer hide the text field while recording. */
  onRecording: (recording: boolean) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [busy, setBusy] = useState(false);
  const recording = state.isRecording;
  const ms = state.durationMillis ?? 0;
  useEffect(() => onRecording(recording), [recording, onRecording]);

  const start = async () => {
    onError(null);
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) return onError('mic_denied');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    // The longest message is a minute: it is sent when the minute is up.
    limit.current = setTimeout(() => void finish(true), VOICE_MESSAGE_MAX_SECONDS * 1000);
  };

  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(limit.current ?? undefined), []);

  const finish = async (send: boolean) => {
    clearTimeout(limit.current ?? undefined);
    // Read from the recorder itself: a timer callback would see an old render's state.
    const length = recorder.currentTime * 1000;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!send) return;
    if (length < VOICE_MESSAGE_MIN_SECONDS * 1000) return onError('voice_duration');
    setBusy(true);
    const up = await requestVoiceUpload(tableId);
    const stored = up.ok
      ? await uploadToQuarantine(up.data, await readBytes(recorder.uri!), 'audio/mp4')
      : up;
    const r = up.ok && stored.ok ? await sendVoice(tableId, randomUUID(), up.data.id) : null;
    setBusy(false);
    if (!up.ok) return onError(up.error);
    if (!stored.ok) return onError(stored.error);
    if (r && !r.ok) return onError(r.reason === 'voice_duration' ? 'voice_duration' : r.error);
    if (r?.ok) onSent(r.data.message);
  };

  if (!recording) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.voice.record')}
        disabled={busy}
        onPress={() => void start()}
        style={[styles.round, busy && styles.dim]}
        testID="voice-record"
      >
        <FlameGradient style={StyleSheet.absoluteFill} />
        <Icon icon={MicrophoneIcon} size={20} color={colors.onAccent} />
      </Pressable>
    );
  }
  return (
    <View style={styles.recording} accessibilityLiveRegion="polite">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.voice.cancel')}
        onPress={() => void finish(false)}
        style={styles.round}
      >
        <Icon icon={XIcon} size={20} color={colors.textSecondary} />
      </Pressable>
      <View style={[styles.dot, { backgroundColor: colors.danger }]} />
      <AppText variant="label">{t('chat.voice.recording', { time: mmss(ms) })}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.voice.send')}
        onPress={() => void finish(true)}
        style={styles.round}
      >
        <FlameGradient style={StyleSheet.absoluteFill} />
        <Icon icon={PaperPlaneTiltIcon} size={20} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

/** Plays a fetched URL as soon as it mounts. */
function Player({ url, onEnd, tone }: { url: string; onEnd: () => void; tone: string }) {
  const { t } = useTranslation();
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    player.play();
  }, [player]);
  useEffect(() => {
    if (status.didJustFinish) onEnd();
  }, [status.didJustFinish, onEnd]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={status.playing ? t('chat.voice.pause') : t('chat.voice.play')}
      onPress={() => (status.playing ? player.pause() : player.play())}
      hitSlop={8}
    >
      <Icon icon={status.playing ? PauseIcon : PlayIcon} size={26} color={tone} />
    </Pressable>
  );
}

/** A voice message in the chat: a play button and its length; the URL is fetched on first play. */
export function VoiceBody({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const tone = mine ? colors.onAccent : colors.accentPrimary;

  const load = async () => {
    setFailed(false);
    const r = await voiceUrl(message.id);
    if (r.ok) setUrl(r.data.url);
    else setFailed(true);
  };

  return (
    <View style={styles.voice}>
      {url ? (
        <Player url={url} tone={tone} onEnd={() => setUrl(null)} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chat.voice.play')}
          onPress={() => void load()}
          hitSlop={8}
        >
          <Icon icon={PlayIcon} size={26} color={tone} />
        </Pressable>
      )}
      <View style={[styles.wave, { backgroundColor: tone }]} />
      <AppText variant="caption" tone={mine ? 'onAccent' : 'secondary'}>
        {failed ? t('chat.voice.failed') : mmss(message.flags.durationMs ?? 0)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  round: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: minTouchTarget / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
  recording: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(1) },
  dot: { width: 10, height: 10, borderRadius: 5 },
  voice: { flexDirection: 'row', alignItems: 'center', gap: space(1), minWidth: 160 },
  wave: { flex: 1, height: 3, borderRadius: 2, opacity: 0.5 },
});
