import { DOOR_QUESTION_MAX, doorQuestionSchema } from '@nokuzo/shared';
import { space } from '@nokuzo/design-tokens';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, ChipGroup, Input, SegmentedControl, Skeleton } from '@/components';
import { ProfileFormScreen, SaveNotice, useSaveSection, type FormMode } from './ProfileFormScreen';
import { useInitialValues } from './useInitialValues';
import { useMyProfile, usePresets } from './queries';

type Tab = 'presets' | 'custom';

/** §4.2 / §6.1 step 11: one Door Question, from the list or written by the user. */
export function DoorQuestionScreen({ mode = 'onboarding' }: { mode?: FormMode }) {
  const { t, i18n } = useTranslation();
  const me = useMyProfile();
  const presets = usePresets();
  const [tab, setTab] = useState<Tab>('presets');
  const [presetId, setPresetId] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const { save, pending, error, heldForReview, clearError } = useSaveSection(mode);

  useInitialValues(me.data, (p) => {
    const dq = p.doorQuestion;
    if (!dq) return;
    if (dq.customText) {
      setTab('custom');
      setCustom(dq.customText);
    } else setPresetId(dq.presetId);
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { value: string; label: string }[]>();
    for (const p of presets.data ?? []) {
      const list = map.get(p.category) ?? [];
      list.push({ value: p.id, label: i18n.language === 'en' ? p.text_en : p.text_tr });
      map.set(p.category, list);
    }
    return [...map.entries()];
  }, [presets.data, i18n.language]);

  const data = tab === 'presets' ? (presetId ? { presetId } : null) : { customText: custom };
  const valid = data ? doorQuestionSchema.safeParse(data) : null;

  return (
    <ProfileFormScreen
      loading={me.isPending}
      mode={mode}
      step="door_question"
      title={t('profile.door.title')}
      subtitle={t('profile.door.subtitle')}
      testID="door-question"
      footer={
        <Button
          label={t('common.continue')}
          disabled={!valid?.success}
          loading={pending}
          onPress={() =>
            valid?.success && void save({ section: 'door_question', data: valid.data })
          }
        />
      }
    >
      <SegmentedControl<Tab>
        label={t('profile.door.title')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'presets', label: t('profile.door.presets') },
          { value: 'custom', label: t('profile.door.custom') },
        ]}
      />
      {tab === 'custom' ? (
        <Input
          label={t('profile.door.customLabel')}
          help={t('profile.door.customHelp')}
          value={custom}
          onChangeText={(v) => {
            setCustom(v);
            clearError();
          }}
          maxLength={DOOR_QUESTION_MAX}
          showCounter
          multiline
        />
      ) : presets.isPending ? (
        <View accessible accessibilityLabel={t('common.loading')} style={styles.group}>
          <Skeleton height={44} />
          <Skeleton height={44} />
        </View>
      ) : (
        grouped.map(([category, options]) => (
          <View key={category} style={styles.group}>
            <AppText variant="label">{t(`profile.door.categories.${category}`)}</AppText>
            <ChipGroup<string>
              label={t(`profile.door.categories.${category}`)}
              options={options}
              selected={presetId ? [presetId] : []}
              onToggle={setPresetId}
            />
          </View>
        ))
      )}
      <SaveNotice error={error} heldForReview={heldForReview} />
    </ProfileFormScreen>
  );
}

const styles = StyleSheet.create({ group: { gap: space(1) } });
