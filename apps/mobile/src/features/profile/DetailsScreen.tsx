import {
  ABOUT_MAX,
  DETAIL_CHOICES,
  detailsSchema,
  FAVORITES_MAX,
  LANGUAGES,
  PETS,
  SHORT_TEXT_MAX,
  type DetailKey,
} from '@nokuzo/shared';
import { space } from '@nokuzo/design-tokens';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, Checkbox, ChipGroup, Input } from '@/components';
import { ProfileFormScreen, SaveNotice, useSaveSection } from './ProfileFormScreen';
import { useInitialValues } from './useInitialValues';
import { useCities, useMyProfile } from './queries';

type Values = Partial<Record<DetailKey, unknown>>;
const CHOICE_KEYS = Object.keys(DETAIL_CHOICES) as (keyof typeof DETAIL_CHOICES)[];
const TEXT_KEYS = ['school', 'occupation', 'workplace'] as const;
const LIST_KEYS = ['music', 'films', 'books'] as const;

/** "1,2, 3" → ["1","2","3"]; empty → null (clears the field). */
export function splitFavorites(text: string): string[] | null {
  const items = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, FAVORITES_MAX);
  return items.length ? items : null;
}

/**
 * §6.4 optional fields, each with its own "show on profile" switch. Only
 * changed fields are sent; an emptied field is sent as null so it is removed.
 */
export function DetailsScreen() {
  const { t } = useTranslation();
  const me = useMyProfile();
  const cities = useCities();
  const [values, setValues] = useState<Values>({});
  const [visibility, setVisibility] = useState<Partial<Record<DetailKey, boolean>>>({});
  const [initial, setInitial] = useState<Values>({});
  // Raw text of the favourites inputs; turned into lists only when saving.
  const [favText, setFavText] = useState<Record<(typeof LIST_KEYS)[number], string>>({
    music: '',
    films: '',
    books: '',
  });
  const { save, pending, error, heldForReview } = useSaveSection('edit');

  useInitialValues(me.data, (p) => {
    setValues(p.details as Values);
    setInitial(p.details as Values);
    setVisibility(p.visibility as Partial<Record<DetailKey, boolean>>);
    const d = p.details as Values;
    setFavText({
      music: ((d.music as string[] | undefined) ?? []).join(', '),
      films: ((d.films as string[] | undefined) ?? []).join(', '),
      books: ((d.books as string[] | undefined) ?? []).join(', '),
    });
  });

  const set = (key: DetailKey, value: unknown) => setValues((v) => ({ ...v, [key]: value }));
  const current: Values = {
    ...values,
    music: splitFavorites(favText.music),
    films: splitFavorites(favText.films),
    books: splitFavorites(favText.books),
  };
  const changed = Object.fromEntries(
    (Object.keys({ ...initial, ...current }) as DetailKey[])
      .filter((k) => JSON.stringify(current[k] ?? null) !== JSON.stringify(initial[k] ?? null))
      .map((k) => [k, current[k] ?? null]),
  );
  const parsed = detailsSchema.safeParse(changed);
  const fieldLabel = (k: DetailKey) => t(`profile.details.fields.${k}`);

  const visibleSwitch = (k: DetailKey) => (
    <Checkbox
      label={`${fieldLabel(k)}: ${t('profile.details.show')}`}
      checked={visibility[k] ?? true}
      onChange={(on) => setVisibility((v) => ({ ...v, [k]: on }))}
      testID={`visible-${k}`}
    />
  );

  return (
    <ProfileFormScreen
      loading={me.isPending}
      mode="edit"
      step="interests"
      title={t('profile.details.title')}
      subtitle={t('profile.details.subtitle')}
      testID="details"
      footer={
        <Button
          label={t('common.continue')}
          disabled={!parsed.success}
          loading={pending}
          onPress={() =>
            parsed.success && void save({ section: 'details', data: parsed.data, visibility })
          }
        />
      }
    >
      <Card>
        <Input
          label={fieldLabel('height')}
          value={values.height ? String(values.height) : ''}
          onChangeText={(v) => set('height', v ? Number(v.replace(/\D/g, '')) : null)}
          keyboardType="number-pad"
          maxLength={3}
        />
        {visibleSwitch('height')}
      </Card>
      {CHOICE_KEYS.map((k) => (
        <Card key={k}>
          <AppText variant="label">{fieldLabel(k)}</AppText>
          <ChipGroup<string>
            label={fieldLabel(k)}
            options={DETAIL_CHOICES[k].map((o) => ({
              value: o,
              label: t(`profile.details.options.${k}.${o}`),
            }))}
            selected={values[k] ? [values[k] as string] : []}
            onToggle={(o) => set(k, values[k] === o ? null : o)}
          />
          {visibleSwitch(k)}
        </Card>
      ))}
      <Card>
        <AppText variant="label">{fieldLabel('pets')}</AppText>
        <ChipGroup<string>
          label={fieldLabel('pets')}
          multiple
          options={PETS.map((o) => ({ value: o, label: t(`profile.details.options.pets.${o}`) }))}
          selected={(values.pets as string[] | undefined) ?? []}
          onToggle={(o) => {
            const cur = (values.pets as string[] | undefined) ?? [];
            const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o];
            set('pets', next.length ? next : null);
          }}
        />
        {visibleSwitch('pets')}
      </Card>
      <Card>
        <AppText variant="label">{fieldLabel('languages')}</AppText>
        <ChipGroup<string>
          label={fieldLabel('languages')}
          multiple
          options={LANGUAGES.map((o) => ({ value: o, label: t(`profile.languages.${o}`) }))}
          selected={(values.languages as string[] | undefined) ?? []}
          onToggle={(o) => {
            const cur = (values.languages as string[] | undefined) ?? [];
            const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o];
            set('languages', next.length ? next : null);
          }}
        />
        {visibleSwitch('languages')}
      </Card>
      <Card>
        <AppText variant="label">{fieldLabel('hometown_city_id')}</AppText>
        <ChipGroup<string>
          label={fieldLabel('hometown_city_id')}
          options={(cities.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
          selected={values.hometown_city_id ? [String(values.hometown_city_id)] : []}
          onToggle={(id) =>
            set('hometown_city_id', values.hometown_city_id === Number(id) ? null : Number(id))
          }
        />
        {visibleSwitch('hometown_city_id')}
      </Card>
      {TEXT_KEYS.map((k) => (
        <Card key={k}>
          <Input
            label={fieldLabel(k)}
            value={(values[k] as string | undefined) ?? ''}
            onChangeText={(v) => set(k, v.trim() ? v : null)}
            maxLength={SHORT_TEXT_MAX}
          />
          {visibleSwitch(k)}
        </Card>
      ))}
      {LIST_KEYS.map((k) => (
        <Card key={k}>
          <Input
            label={fieldLabel(k)}
            help={t('profile.details.favoritesHelp')}
            value={favText[k]}
            onChangeText={(v) => setFavText((f) => ({ ...f, [k]: v }))}
          />
          {visibleSwitch(k)}
        </Card>
      ))}
      <Card>
        <Input
          label={fieldLabel('about')}
          value={(values.about as string | undefined) ?? ''}
          onChangeText={(v) => set('about', v.trim() ? v : null)}
          maxLength={ABOUT_MAX}
          showCounter
          multiline
        />
        {visibleSwitch('about')}
      </Card>
      <View style={styles.spacer} />
      <SaveNotice error={error} heldForReview={heldForReview} />
    </ProfileFormScreen>
  );
}

const styles = StyleSheet.create({ spacer: { height: space(1) } });
