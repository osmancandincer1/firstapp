import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useCities } from './queries';

/**
 * Localized text for one public profile detail (shared by the preview and
 * Round cards). City names are only loaded when a hometown is shown.
 */
export function useDetailText(needsCities = true) {
  const { t } = useTranslation();
  const cities = useCities(needsCities);
  return useCallback(
    (k: string, v: unknown): string => {
      if (Array.isArray(v)) {
        return v
          .map((x) =>
            k === 'pets' || k === 'languages'
              ? t(k === 'pets' ? `profile.details.options.pets.${x}` : `profile.languages.${x}`)
              : String(x),
          )
          .join(', ');
      }
      if (k === 'height') return `${v} cm`;
      if (k === 'about' || k === 'school' || k === 'occupation' || k === 'workplace')
        return String(v);
      if (k === 'hometown_city_id') return cities.data?.find((c) => c.id === v)?.name ?? '';
      return t(`profile.details.options.${k}.${v}`);
    },
    [t, cities.data],
  );
}
