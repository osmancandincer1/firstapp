import { useTranslation } from 'react-i18next';

import { Banner } from '@/components';
import type { ClientErrorCode } from '@/lib/api';

/** Localized message for an API error code; offline gets its own wording (§8.2). */
export function ErrorNotice({ error }: { error: ClientErrorCode | null }) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <Banner
      tone={error === 'network' ? 'warning' : 'danger'}
      message={t(`errors.${error}`)}
      testID="error-notice"
    />
  );
}
