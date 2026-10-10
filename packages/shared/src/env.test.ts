import { isDemoAllowed, parsePublicEnv, serviceStatus } from './env';

describe('parsePublicEnv', () => {
  it('defaults to local with every service unset', () => {
    const env = parsePublicEnv({});
    expect(env.APP_ENV).toBe('local');
    expect(serviceStatus(env)).toEqual({ supabase: 'NEEDS_SETUP', sentry: 'NEEDS_SETUP' });
  });

  it('treats blank values as unset', () => {
    const env = parsePublicEnv({ SUPABASE_URL: '', SENTRY_DSN: '   ' });
    expect(env.SUPABASE_URL).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('reports configured services as ready', () => {
    const env = parsePublicEnv({
      APP_ENV: 'staging',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_ANON_KEY: 'anon',
      SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0',
    });
    expect(serviceStatus(env)).toEqual({ supabase: 'ready', sentry: 'ready' });
  });

  it('needs both Supabase URL and anon key', () => {
    const env = parsePublicEnv({ SUPABASE_URL: 'http://127.0.0.1:54321' });
    expect(serviceStatus(env).supabase).toBe('NEEDS_SETUP');
  });

  it('rejects unknown environments and malformed URLs', () => {
    expect(() => parsePublicEnv({ APP_ENV: 'prod' })).toThrow();
    expect(() => parsePublicEnv({ SUPABASE_URL: 'not a url' })).toThrow();
  });

  it('refuses secret keys in client configuration', () => {
    expect(() => parsePublicEnv({ SUPABASE_SERVICE_ROLE_KEY: 'x' })).toThrow(
      /must never be exposed/,
    );
    expect(() => parsePublicEnv({ HASH_HMAC_SECRET: 'x' })).toThrow(/must never be exposed/);
  });
});

describe('isDemoAllowed', () => {
  it('allows demo data only outside production', () => {
    expect(isDemoAllowed('local')).toBe(true);
    expect(isDemoAllowed('staging')).toBe(true);
    expect(isDemoAllowed('production')).toBe(false);
  });
});
