import { CHUNK_SIZE, chunkedStore, type KeyValueStore } from './secureStorage';

jest.mock('./env', () => ({
  env: { APP_ENV: 'local', SUPABASE_URL: 'http://supabase.test', SUPABASE_ANON_KEY: 'anon-key' },
}));
const mockGetSession = jest.fn();
jest.mock('./supabase', () => ({ supabase: { auth: { getSession: () => mockGetSession() } } }));

function memory(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => Promise.resolve(map.get(k) ?? null),
    setItem: (k, v) => Promise.resolve(void map.set(k, v)),
    removeItem: (k) => Promise.resolve(void map.delete(k)),
  };
}

describe('chunkedStore', () => {
  it('round-trips values larger than one chunk', async () => {
    const base = memory();
    const store = chunkedStore(base);
    const value = 'x'.repeat(CHUNK_SIZE * 2 + 10);
    await store.setItem('sb-auth-token', value);
    expect(base.map.get('sb-auth-token.n')).toBe('3');
    expect(await store.getItem('sb-auth-token')).toBe(value);
  });

  it('removes leftover chunks when a value shrinks, and on delete', async () => {
    const base = memory();
    const store = chunkedStore(base);
    await store.setItem('k', 'y'.repeat(CHUNK_SIZE * 3));
    await store.setItem('k', 'short');
    expect([...base.map.keys()].sort()).toEqual(['k.0', 'k.n']);
    await store.removeItem('k');
    expect(base.map.size).toBe(0);
    expect(await store.getItem('k')).toBeNull();
  });

  it('treats a partial write as missing and sanitizes keys', async () => {
    const base = memory();
    const store = chunkedStore(base);
    await store.setItem('sb:auth/token', 'z'.repeat(CHUNK_SIZE + 1));
    expect(base.map.has('sb_auth_token.1')).toBe(true);
    base.map.delete('sb_auth_token.1');
    expect(await store.getItem('sb:auth/token')).toBeNull();
  });
});

describe('callFunction', () => {
  const { callFunction } = require('./api') as typeof import('./api');
  const response = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

  beforeEach(() => mockGetSession.mockReset());

  it('calls unauthenticated endpoints with the anon key', async () => {
    const fetchFn = jest.fn(() => response(200, { ok: true }));
    const r = await callFunction('email-otp-request', { a: 1 }, { auth: false, fetchFn });
    expect(r).toEqual({ ok: true, data: { ok: true } });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://supabase.test/functions/v1/email-otp-request');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer anon-key');
    expect(init.body).toBe('{"a":1}');
  });

  it('locally, points signed storage URLs at the app’s Supabase URL (Docker host is unreachable)', async () => {
    const signed = 'http://kong:8000/storage/v1/object/sign/public-photos/p/1.jpg?token=t';
    const fetchFn = jest.fn(() =>
      response(200, { media: { a: signed }, list: [{ url: signed }], other: 'http://kong:8000/x' }),
    );
    const r = await callFunction('profile-view', {}, { auth: false, fetchFn });
    expect(r).toEqual({
      ok: true,
      data: {
        media: { a: 'http://supabase.test/storage/v1/object/sign/public-photos/p/1.jpg?token=t' },
        list: [
          { url: 'http://supabase.test/storage/v1/object/sign/public-photos/p/1.jpg?token=t' },
        ],
        other: 'http://kong:8000/x',
      },
    });
  });

  it('uses the session token, or reports not_authenticated without one', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await callFunction('x', {}, { fetchFn: jest.fn() })).toEqual({
      ok: false,
      error: 'not_authenticated',
    });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'user-token' } } });
    const fetchFn = jest.fn(() => response(200, {}));
    await callFunction('x', {}, { fetchFn });
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer user-token');
  });

  it('maps server errors, unknown errors and network failures', async () => {
    expect(
      await callFunction(
        'x',
        {},
        { auth: false, fetchFn: () => response(429, { error: 'rate_limited', retryAt: 'T' }) },
      ),
    ).toEqual({ ok: false, error: 'rate_limited', retryAt: 'T' });
    expect(
      await callFunction(
        'x',
        {},
        { auth: false, fetchFn: () => response(500, { error: 'weird' }) },
      ),
    ).toEqual({
      ok: false,
      error: 'internal',
    });
    expect(
      await callFunction(
        'x',
        {},
        { auth: false, fetchFn: () => Promise.resolve(new Response('not json', { status: 502 })) },
      ),
    ).toEqual({ ok: false, error: 'internal' });
    expect(
      await callFunction(
        'x',
        {},
        { auth: false, fetchFn: () => Promise.reject(new TypeError('offline')) },
      ),
    ).toEqual({
      ok: false,
      error: 'network',
    });
  });
});

describe('getDeviceId', () => {
  it('uses the platform identifier', async () => {
    const { getDeviceId, platform } = require('./device') as typeof import('./device');
    expect(platform).toBe('ios');
    expect(await getDeviceId()).toBe('ios:ios-test-id');
  });
});
