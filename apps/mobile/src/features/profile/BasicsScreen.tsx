import { basicsSchema, GENDERS, NAME_MAX, SEEKING } from '@nokuzo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Checkbox, ChipGroup, Input } from '@/components';
import { ProfileFormScreen, SaveNotice, useSaveSection, type FormMode } from './ProfileFormScreen';
import { useInitialValues } from './useInitialValues';
import { useMyProfile } from './queries';

type Gender = (typeof GENDERS)[number];
type Seeking = (typeof SEEKING)[number];

/** §6.1 step 7 / §6.4: name, gender (with a show switch) and who to see. */
export function BasicsScreen({ mode = 'onboarding' }: { mode?: FormMode }) {
  const { t } = useTranslation();
  const me = useMyProfile();
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [genderCustom, setGenderCustom] = useState('');
  const [showGender, setShowGender] = useState(true);
  const [seeking, setSeeking] = useState<Seeking[]>([]);
  const { save, pending, error, heldForReview, clearError } = useSaveSection(mode);

  useInitialValues(me.data, (p) => {
    setName(p.name ?? '');
    setGender((p.gender as Gender | null) ?? null);
    setGenderCustom(p.genderCustom ?? '');
    setShowGender(p.showGender);
    setSeeking(p.seeking as Seeking[]);
  });

  const data = {
    name,
    gender,
    showGender,
    seeking,
    ...(gender === 'self_described' ? { genderCustom } : {}),
  };
  const valid = basicsSchema.safeParse(data);
  const toggleSeeking = (v: Seeking) =>
    setSeeking((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  const everyone = seeking.length === SEEKING.length;

  return (
    <ProfileFormScreen
      loading={me.isPending}
      mode={mode}
      step="basics"
      title={t('profile.basics.title')}
      subtitle={t('profile.basics.subtitle')}
      testID="basics"
      footer={
        <Button
          label={t('common.continue')}
          disabled={!valid.success}
          loading={pending}
          onPress={() => valid.success && void save({ section: 'basics', data: valid.data })}
        />
      }
    >
      <Input
        label={t('profile.basics.name')}
        help={t('profile.basics.nameHelp')}
        value={name}
        onChangeText={(v) => {
          setName(v);
          clearError();
        }}
        maxLength={NAME_MAX}
        autoComplete="given-name"
        textContentType="givenName"
      />
      <AppText variant="label">{t('profile.basics.gender')}</AppText>
      <ChipGroup<Gender>
        label={t('profile.basics.gender')}
        options={GENDERS.map((g) => ({ value: g, label: t(`profile.basics.genders.${g}`) }))}
        selected={gender ? [gender] : []}
        onToggle={setGender}
      />
      {gender === 'self_described' ? (
        <Input
          label={t('profile.basics.genderCustom')}
          value={genderCustom}
          onChangeText={setGenderCustom}
          maxLength={30}
        />
      ) : null}
      <Checkbox
        label={t('profile.basics.showGender')}
        checked={showGender}
        onChange={setShowGender}
      />
      <AppText variant="label">{t('profile.basics.seeking')}</AppText>
      <ChipGroup<Seeking | 'everyone'>
        label={t('profile.basics.seeking')}
        multiple
        options={[
          ...SEEKING.map((s) => ({ value: s, label: t(`profile.basics.seekingOptions.${s}`) })),
          { value: 'everyone' as const, label: t('profile.basics.everyone') },
        ]}
        selected={everyone ? [...seeking, 'everyone'] : seeking}
        onToggle={(v) =>
          v === 'everyone' ? setSeeking(everyone ? [] : [...SEEKING]) : toggleSeeking(v)
        }
      />
      <SaveNotice error={error} heldForReview={heldForReview} />
    </ProfileFormScreen>
  );
}
