import * as Sentry from '@sentry/react-native';

import type { PublicEnv } from '@nokuzo/shared';

/**
 * Starts Sentry only when a DSN is configured (NEEDS_SETUP otherwise — see
 * docs/SETUP.md). Personal data is never attached (§13.1: "Kişisel veri
 * temizleme açık").
 */
export function initSentry(env: PublicEnv): boolean {
  if (!env.SENTRY_DSN) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.APP_ENV,
    sendDefaultPii: false,
    tracesSampleRate: env.APP_ENV === 'production' ? 0.1 : 1,
    beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : crumb),
  });
  return true;
}
