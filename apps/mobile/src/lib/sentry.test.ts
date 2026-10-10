import * as Sentry from '@sentry/react-native';

import { initSentry } from './sentry';

jest.mock('@sentry/react-native', () => ({ init: jest.fn() }));

describe('initSentry', () => {
  beforeEach(() => jest.mocked(Sentry.init).mockClear());

  it('stays off without a DSN (NEEDS_SETUP)', () => {
    expect(initSentry({ APP_ENV: 'local' })).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('starts with PII disabled when a DSN is configured', () => {
    expect(initSentry({ APP_ENV: 'staging', SENTRY_DSN: 'https://k@o0.ingest.sentry.io/1' })).toBe(
      true,
    );
    const options = jest.mocked(Sentry.init).mock.calls[0]?.[0];
    expect(options?.sendDefaultPii).toBe(false);
    expect(options?.environment).toBe('staging');
    expect(options?.beforeBreadcrumb?.({ category: 'console' }, undefined)).toBeNull();
    expect(options?.beforeBreadcrumb?.({ category: 'navigation' }, undefined)).toEqual({
      category: 'navigation',
    });
  });

  it('samples fewer traces in production', () => {
    initSentry({ APP_ENV: 'production', SENTRY_DSN: 'https://k@o0.ingest.sentry.io/1' });
    expect(jest.mocked(Sentry.init).mock.calls[0]?.[0]?.tracesSampleRate).toBe(0.1);
  });
});
