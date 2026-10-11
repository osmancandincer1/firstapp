import {
  DEALBREAKER_FIELDS,
  DEALBREAKERS_MAX,
  DETAIL_CHOICES,
  INTENTS,
  intentSchema,
  PETS,
  TEMPOS,
  type DealbreakerField,
} from '@nokuzo/shared';
import { space } from '@nokuzo/design-tokens';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Banner, Button, ChipGroup } from '@/components';
import { ProfileFormScreen, SaveNotice, useSaveSection, type FormMode } from './ProfileFormScreen';
import { useInitialValues } from './useInitialValues';
import { useMyProfile } from './queries';

type Intent = (typeof INTENTS)[number];
type Tempo = (typeof TEMPOS)[number];
type Dealbreakers = Partial<Record<DealbreakerField, string[]>>;

const valuesOf = (field: DealbreakerField): readonly string[] =>
  field === 'pets' ? PETS : DETAIL_CHOICES[field];

/** §6.4 Niyet Kartı: intent, pace and up to three must-haves. */
export function IntentScreen({ mode = 'onboarding' }: { mode?: FormMode }) {
  const { t } = useTranslation();
  const me = useMyProfile();
  const [intent, setIntent] = useState<Intent | null>(null);
  const [tempo, setTempo] = useState<Tempo | null>(null);
  const [musts, setMusts] = useState<Dealbreakers>({});
  const [limitHit, setLimitHit] = useState(false);
  const { save, pending, error, heldForReview } = useSaveSection(mode);

  useInitialValues(me.data, (p) => {
    setIntent(p.intent as Intent | null);
    setTempo(p.tempo as Tempo | null);
    setMusts(Object.fromEntries(p.dealbreakers.map((d) => [d.field, d.accepted])));
  });

  const toggleField = (field: DealbreakerField) => {
    setMusts((m) => {
      if (field in m) {
        return Object.fromEntries(Object.entries(m).filter(([f]) => f !== field)) as Dealbreakers;
      }
      if (Object.keys(m).length >= DEALBREAKERS_MAX) {
        setLimitHit(true);
        return m;
      }
      setLimitHit(false);
      return { ...m, [field]: [] };
    });
  };
  const toggleValue = (field: DealbreakerField, value: string) =>
    setMusts((m) => {
      const cur = m[field] ?? [];
      return {
        ...m,
        [field]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
      };
    });

  const data = {
    intent,
    tempo,
    dealbreakers: Object.entries(musts).map(([field, accepted]) => ({ field, accepted })),
  };
  const valid = intentSchema.safeParse(data);
  const optionLabel = (field: DealbreakerField, v: string) =>
    t(`profile.details.options.${field}.${v}`);

  return (
    <ProfileFormScreen
      loading={me.isPending}
      mode={mode}
      step="intent"
      title={t('profile.intent.title')}
      subtitle={t('profile.intent.subtitle')}
      testID="intent"
      footer={
        <Button
          label={t('common.continue')}
          disabled={!valid.success}
          loading={pending}
          onPress={() => valid.success && void save({ section: 'intent', data: valid.data })}
        />
      }
    >
      <AppText variant="label">{t('profile.intent.intentLabel')}</AppText>
      <ChipGroup<Intent>
        label={t('profile.intent.intentLabel')}
        options={INTENTS.map((v) => ({ value: v, label: t(`profile.intent.intents.${v}`) }))}
        selected={intent ? [intent] : []}
        onToggle={setIntent}
      />
      <AppText variant="label">{t('profile.intent.tempoLabel')}</AppText>
      <ChipGroup<Tempo>
        label={t('profile.intent.tempoLabel')}
        options={TEMPOS.map((v) => ({ value: v, label: t(`profile.intent.tempos.${v}`) }))}
        selected={tempo ? [tempo] : []}
        onToggle={setTempo}
      />
      <AppText variant="label">{t('profile.intent.dealbreakers')}</AppText>
      <AppText variant="caption" tone="secondary">
        {t('profile.intent.dealbreakersHelp')}
      </AppText>
      <ChipGroup<DealbreakerField>
        label={t('profile.intent.dealbreakers')}
        multiple
        options={DEALBREAKER_FIELDS.map((f) => ({
          value: f,
          label: t(`profile.details.fields.${f}`),
        }))}
        selected={Object.keys(musts) as DealbreakerField[]}
        onToggle={toggleField}
        testID="dealbreaker-fields"
      />
      {limitHit ? <Banner tone="warning" message={t('profile.intent.limit')} /> : null}
      {(Object.keys(musts) as DealbreakerField[]).map((field) => (
        <View key={field} style={styles.group}>
          <AppText variant="label">{t(`profile.details.fields.${field}`)}</AppText>
          <ChipGroup<string>
            label={t(`profile.details.fields.${field}`)}
            multiple
            options={valuesOf(field).map((v) => ({ value: v, label: optionLabel(field, v) }))}
            selected={musts[field] ?? []}
            onToggle={(v) => toggleValue(field, v)}
          />
        </View>
      ))}
      <SaveNotice error={error} heldForReview={heldForReview} />
    </ProfileFormScreen>
  );
}

const styles = StyleSheet.create({ group: { gap: space(1) } });
