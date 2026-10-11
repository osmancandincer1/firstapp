import { roundToGrid } from '@nokuzo/shared';
import * as Location from 'expo-location';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, Banner, Button, ChipGroup, Input, Skeleton } from '@/components';
import { ProfileFormScreen, SaveNotice, useSaveSection, type FormMode } from './ProfileFormScreen';
import { useInitialValues } from './useInitialValues';
import { useCities, useDistricts, useMyProfile } from './queries';

/**
 * §6.1 step 13 / §13.6: city (and district where the city is open), plus an
 * optional approximate location. Coordinates are rounded to ~1 km on the
 * device before they leave it, and again on the server.
 */
export function LocationScreen({ mode = 'onboarding' }: { mode?: FormMode }) {
  const { t } = useTranslation();
  const me = useMyProfile();
  const cities = useCities();
  const districts = useDistricts();
  const [query, setQuery] = useState('');
  const [cityId, setCityId] = useState<number | null>(null);
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState(false);
  const { save, pending, error, heldForReview } = useSaveSection(mode);

  useInitialValues(me.data, (p) => {
    setCityId(p.cityId);
    setDistrictId(p.districtId);
  });

  const folded = query.toLocaleLowerCase('tr');
  const cityOptions = useMemo(
    () =>
      (cities.data ?? [])
        .filter(
          (c) => !folded || c.name.toLocaleLowerCase('tr').includes(folded) || c.id === cityId,
        )
        .map((c) => ({ value: String(c.id), label: c.name })),
    [cities.data, folded, cityId],
  );
  const districtOptions = (districts.data ?? [])
    .filter((d) => d.city_id === cityId)
    .map((d) => ({ value: String(d.id), label: d.name }));

  const locateMe = async () => {
    setLocError(false);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      setLocError(true);
      return;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setCoords(roundToGrid({ lat: pos.coords.latitude, lng: pos.coords.longitude }));
  };

  const ready = cityId !== null && (districtOptions.length === 0 || districtId !== null);

  return (
    <ProfileFormScreen
      loading={me.isPending}
      mode={mode}
      step="location"
      title={t('profile.location.title')}
      subtitle={t('profile.location.subtitle')}
      testID="location"
      footer={
        <Button
          label={t('common.continue')}
          disabled={!ready}
          loading={pending}
          onPress={() =>
            cityId !== null &&
            void save({
              section: 'location',
              data: { cityId, districtId, ...(coords ? { coords } : {}) },
            })
          }
        />
      }
    >
      <Input
        label={t('profile.location.search')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />
      <AppText variant="label">{t('profile.location.city')}</AppText>
      {cities.isPending ? (
        <Skeleton height={44} />
      ) : (
        <ChipGroup<string>
          label={t('profile.location.city')}
          options={cityOptions}
          selected={cityId ? [String(cityId)] : []}
          onToggle={(v) => {
            setCityId(Number(v));
            setDistrictId(null);
          }}
          testID="cities"
        />
      )}
      {districtOptions.length > 0 ? (
        <>
          <AppText variant="label">{t('profile.location.district')}</AppText>
          <ChipGroup<string>
            label={t('profile.location.district')}
            options={districtOptions}
            selected={districtId ? [String(districtId)] : []}
            onToggle={(v) => setDistrictId(Number(v))}
          />
        </>
      ) : null}
      <Button
        variant="secondary"
        label={t('profile.location.useLocation')}
        onPress={() => void locateMe()}
      />
      <AppText variant="caption" tone="secondary">
        {t('profile.location.locationHelp')}
      </AppText>
      {coords ? <Banner message={t('profile.location.locationOn')} testID="location-on" /> : null}
      {locError ? <Banner tone="warning" message={t('profile.location.permissionDenied')} /> : null}
      <SaveNotice error={error} heldForReview={heldForReview} />
    </ProfileFormScreen>
  );
}
