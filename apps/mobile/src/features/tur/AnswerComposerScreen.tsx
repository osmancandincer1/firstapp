import {
  ANSWER_TEXT_MAX,
  ANSWER_VOICE_MAX_SECONDS,
  ANSWER_VOICE_MIN_SECONDS,
  checkAnswerText,
} from '@nokuzo/shared';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet } from 'react-native';

import { AppText, Banner, Button, Input, Screen, SegmentedControl } from '@/components';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import { uploadToQuarantine } from '@/features/profile/api';
import type { ApiResult } from '@/lib/api';
import { readBytes } from '@/lib/media';
import { requestAnswerVoiceUpload, sendAnswer, type PublicProfile } from './api';
import { PaperPlaneMoment, QuestionCard } from './Moments';
import { PlayVoice } from './PublicProfileView';
import { INBOX_KEY, SAVED_KEY, TUR_KEY, useInvalidate, useSaved, useTur } from './queries';

type Mode = 'text' | 'voice';
type Failure = Extract<ApiResult<unknown>, { ok: false }>;

/** Finds who is being answered in the Round or the saved list (both already cached). */
function useTarget(cardId: string | undefined, candidateId: string | undefined) {
  const tur = useTur();
  const saved = useSaved();
  const fromTur = tur.data?.cards.find((c) => c.cardId === cardId || c.candidateId === candidateId);
  if (fromTur) return { candidateId: fromTur.candidateId, profile: fromTur.profile };
  const fromSaved = saved.data?.find((s) => s.candidateId === candidateId || s.cardId === cardId);
  if (fromSaved) return { candidateId: fromSaved.candidateId, profile: fromSaved.profile };
  return null;
}

/** §8.1 #20: the question on top, text or voice, character counter, send (§4.2). */
export function AnswerComposerScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ cardId?: string; candidateId?: string }>();
  const target = useTarget(params.cardId, params.candidateId);
  const invalidate = useInvalidate();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder);
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ warning?: 'similar' } | null>(null);
  const seconds = Math.floor((rec.durationMillis ?? 0) / 1000);
  const lang = i18n.language === 'en' ? 'en' : 'tr';

  useEffect(() => {
    if (rec.isRecording && seconds >= ANSWER_VOICE_MAX_SECONDS) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.isRecording, seconds]);

  if (!target) {
    return (
      <Screen
        title={t('answer.title')}
        subtitle={t('answer.gone')}
        testID="answer-missing"
        footer={<Button label={t('common.back')} onPress={() => router.back()} />}
      />
    );
  }

  if (sent) {
    return (
      <Screen
        title=""
        testID="answer-sent"
        footer={<Button label={t('answer.backToTur')} onPress={() => router.back()} />}
      >
        <PaperPlaneMoment>
          <AppText variant="display" accessibilityRole="header">
            {t('answer.sentTitle')}
          </AppText>
          <AppText tone="secondary" style={styles.center}>
            {t('answer.sentBody', { name: target.profile?.name ?? '' })}
          </AppText>
          {sent.warning ? <Banner tone="warning" message={t('answer.similarWarning')} /> : null}
        </PaperPlaneMoment>
      </Screen>
    );
  }

  const start = async () => {
    setNotice(null);
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    setRecordedUri(null);
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  async function stop() {
    const length = rec.durationMillis ?? 0;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (length < ANSWER_VOICE_MIN_SECONDS * 1000) {
      setNotice(t('answer.invalid.voice_duration'));
      return;
    }
    setRecordedUri(recorder.uri);
  }

  const textCheck = checkAnswerText(text);

  const submit = async () => {
    if (busy) return;
    setFailure(null);
    if (mode === 'text' && textCheck !== 'ok') {
      setNotice(t(`answer.invalid.${textCheck}`));
      return;
    }
    setNotice(null);
    setBusy(true);
    let result: ApiResult<{ warning?: 'similar' }>;
    if (mode === 'text') {
      result = await sendAnswer({ candidateId: target.candidateId, text: text.trim() });
    } else {
      const up = await requestAnswerVoiceUpload();
      const put = up.ok
        ? await uploadToQuarantine(up.data, await readBytes(recordedUri!), 'audio/mp4')
        : up;
      if (!put.ok) result = put;
      else if (!up.ok) result = up;
      else result = await sendAnswer({ candidateId: target.candidateId, voiceId: up.data.id });
    }
    setBusy(false);
    if (!result.ok) {
      setFailure(result);
      return;
    }
    await invalidate(TUR_KEY, SAVED_KEY, INBOX_KEY);
    setSent({ warning: result.data.warning });
  };

  const question = (target.profile as PublicProfile | null)?.doorQuestion?.[lang];
  const canSend =
    mode === 'text' ? text.trim().length > 0 : Boolean(recordedUri) && !rec.isRecording;

  return (
    <Screen
      title={t('answer.title')}
      subtitle={target.profile?.name}
      testID="answer-composer"
      footer={
        <>
          <Button
            label={t('answer.send')}
            onPress={() => void submit()}
            disabled={!canSend}
            loading={busy}
          />
          <Button variant="ghost" label={t('common.back')} onPress={() => router.back()} />
        </>
      }
    >
      {question ? <QuestionCard kicker={t('profile.preview.door')} question={question} /> : null}
      <SegmentedControl<Mode>
        label={t('answer.mode')}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setNotice(null);
        }}
        options={[
          { value: 'text', label: t('answer.text') },
          { value: 'voice', label: t('answer.voice') },
        ]}
      />
      {mode === 'text' ? (
        <Input
          label={t('answer.textLabel')}
          help={t('answer.textHelp')}
          value={text}
          onChangeText={setText}
          maxLength={ANSWER_TEXT_MAX}
          multiline
          showCounter
          testID="answer-text"
        />
      ) : (
        <>
          <AppText tone="secondary">{t('answer.voiceHelp')}</AppText>
          {rec.isRecording ? (
            <>
              <AppText accessibilityLiveRegion="polite">
                {t('profile.voice.recording', { seconds })}
              </AppText>
              <Button label={t('profile.voice.stop')} onPress={() => void stop()} />
            </>
          ) : (
            <Button
              variant="secondary"
              label={t('profile.voice.record')}
              onPress={() => void start()}
            />
          )}
          {recordedUri ? <PlayVoice url={recordedUri} label={t('profile.voice.play')} /> : null}
          {permissionDenied ? (
            <>
              <Banner tone="warning" message={t('profile.voice.permission')} testID="mic-denied" />
              <Button
                variant="ghost"
                label={t('answer.openSettings')}
                onPress={() => void Linking.openSettings()}
              />
            </>
          ) : null}
        </>
      )}
      {notice ? <Banner tone="warning" message={notice} testID="answer-notice" /> : null}
      <FailureNotice failure={failure} />
    </Screen>
  );
}

/** Answer-specific wording for refusals; everything else uses the shared error text. */
function FailureNotice({ failure }: { failure: Failure | null }) {
  const { t } = useTranslation();
  if (!failure) return null;
  const message =
    failure.error === 'answer_invalid'
      ? t(`answer.invalid.${failure.reason ?? 'too_short'}`)
      : failure.error === 'answer_limit'
        ? t(`answer.limit.${failure.reason ?? 'daily'}`)
        : failure.error === 'text_blocked'
          ? t(`profile.textBlocked.${failure.reason ?? 'profanity'}`)
          : null;
  if (!message) return <ErrorNotice error={failure.error} />;
  return <Banner tone="danger" message={message} testID="error-notice" />;
}

const styles = StyleSheet.create({ center: { textAlign: 'center' } });
