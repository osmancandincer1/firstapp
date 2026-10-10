import { assert, assertEquals, assertNotEquals } from '@std/assert';
import { canonicalEmail } from '../../../packages/shared/src/index.ts';
import { handler } from '../_shared/http.ts';
import {
  registerSession,
  requestEmailOtp,
  verifyEmailOtp,
  type AuthDeps,
} from '../_shared/services/auth.ts';
import { ctx, env, FakeAuth, FakeDb, hashOf, Outbox } from './fakes.ts';

function deps(over: Partial<AuthDeps> = {}) {
  const db = new FakeDb();
  const auth = new FakeAuth();
  const email = new Outbox();
  const d: AuthDeps = {
    env,
    db,
    auth,
    email,
    disposableDomains: new Set(['mailinator.com']),
    code: () => '123456',
    ...over,
  };
  return { d, db, auth, email };
}

const req = (email: string, deviceId = 'device-aaaa-1111') => ({ email, deviceId, locale: 'tr' });

Deno.test('email request: valid address gets exactly one code', async () => {
  const { d, db, email } = deps();
  const r = await requestEmailOtp(d, req('Ece@Example.com'), ctx);
  assertEquals(r, { ok: true, status: 200, body: { ok: true } });
  assertEquals(email.sent.length, 1);
  assertEquals(email.sent[0]!.to, 'ece@example.com');
  assert(email.sent[0]!.text.includes('123456'));
  assertEquals(db.called('otpCreate').length, 1);
});

Deno.test('email request: malformed and disposable addresses are refused (AUTH-04)', async () => {
  const { d, email } = deps();
  assertEquals(await requestEmailOtp(d, req('not-an-email'), ctx), {
    ok: false,
    status: 400,
    error: 'invalid_email',
  });
  assertEquals(await requestEmailOtp(d, req('x@inbox.mailinator.com'), ctx), {
    ok: false,
    status: 400,
    error: 'disposable_email',
  });
  assertEquals(await requestEmailOtp(d, { email: 'a@b.co' }, ctx), {
    ok: false,
    status: 400,
    error: 'invalid_input',
  });
  assertEquals(email.sent.length, 0);
});

Deno.test(
  'email request: without an email provider the feature is off, not faked (§0.9)',
  async () => {
    const { d } = deps({ email: null });
    assertEquals(await requestEmailOtp(d, req('a@example.com'), ctx), {
      ok: false,
      status: 503,
      error: 'service_unavailable',
    });
  },
);

Deno.test(
  'email request: the fourth request in an hour is refused, per IP and per device (AUTH-03)',
  async () => {
    const { d, db } = deps();
    for (let i = 0; i < 3; i++) {
      assert((await requestEmailOtp(d, req(`u${i}@example.com`, 'device-one-xxxx'), ctx)).ok);
    }
    // Same IP, new device and new address: the IP bucket is full.
    assertEquals(
      (await requestEmailOtp(d, req('u9@example.com', 'device-two-xxxx'), ctx)).status,
      429,
    );

    // Fresh limits, different IPs, same device: the device bucket fills on its own.
    db.buckets.clear();
    for (let i = 0; i < 3; i++) {
      assert(
        (
          await requestEmailOtp(d, req(`v${i}@example.com`, 'device-one-xxxx'), {
            ...ctx,
            ip: `198.51.100.${i}`,
          })
        ).ok,
      );
    }
    const r = await requestEmailOtp(d, req('v9@example.com', 'device-one-xxxx'), {
      ...ctx,
      ip: '198.51.100.99',
    });
    assertEquals(r, { ok: false, status: 429, error: 'rate_limited' });
  },
);

Deno.test(
  'email request: banned address in any spelling gets the same answer and no code (BAN-01, BAN-06)',
  async () => {
    for (const variant of [
      'ece.yilmaz@gmail.com',
      'EceYilmaz@gmail.com',
      ' e.ceyilmaz+x@googlemail.com ',
    ]) {
      const { d, db, email } = deps();
      db.bans.add(`email:${await hashOf('email', canonicalEmail('eceyilmaz@gmail.com')!)}`);
      const banned = await requestEmailOtp(d, req(variant), ctx);
      const { d: d2 } = deps();
      const fresh = await requestEmailOtp(d2, req('someone.else@gmail.com'), ctx);
      assertEquals(banned, fresh, 'response bodies are identical');
      assertEquals(db.called('otpCreate').length, 0, 'no code was created');
      assertEquals(email.sent.length, 1, 'the owner gets an explanation instead');
      assert(!/\d{6}/.test(email.sent[0]!.text), 'the explanation contains no code');
    }
  },
);

Deno.test('BAN-06: banned and new addresses take the same minimum time', async () => {
  const timings: number[] = [];
  for (const banned of [true, false]) {
    const { d, db } = deps();
    if (banned) db.bans.add(`email:${await hashOf('email', 'x@example.com')}`);
    const h = handler(({ body, ctx: c }) => requestEmailOtp(d, body, c), { minDurationMs: 150 });
    const t0 = performance.now();
    const res = await h(
      new Request('http://f', { method: 'POST', body: JSON.stringify(req('x@example.com')) }),
    );
    timings.push(performance.now() - t0);
    assertEquals(await res.json(), { ok: true });
  }
  assert(
    timings.every((t) => t >= 145),
    `both padded: ${timings}`,
  );
  assert(Math.abs(timings[0]! - timings[1]!) < 60, `similar: ${timings}`);
});

Deno.test('email request: a locked address is told to wait', async () => {
  const { d, db } = deps();
  db.otpCreateResult = 'locked';
  assertEquals(await requestEmailOtp(d, req('a@example.com'), ctx), {
    ok: false,
    status: 429,
    error: 'otp_locked',
  });
});

const verifyReq = (email: string, code = '123456') => ({
  email,
  code,
  deviceId: 'device-aaaa-1111',
  platform: 'ios',
});

Deno.test(
  'email verify: wrong, expired and locked codes map to clear errors (AUTH-02)',
  async () => {
    for (const [status, error, http] of [
      ['invalid', 'otp_invalid', 400],
      ['not_found', 'otp_invalid', 400],
      ['expired', 'otp_expired', 400],
      ['locked', 'otp_locked', 429],
    ] as const) {
      const { d, db, auth } = deps();
      db.otpVerifyResult = status;
      assertEquals(await verifyEmailOtp(d, verifyReq('a@example.com'), ctx), {
        ok: false,
        status: http,
        error,
      });
      assertEquals(auth.signIns.length, 0);
    }
  },
);

Deno.test('email verify: the right code returns a session and registers the device', async () => {
  const { d, db, auth } = deps();
  const r = await verifyEmailOtp(d, verifyReq('A@Example.com'), ctx);
  assertEquals(r, {
    ok: true,
    status: 200,
    body: { ok: true, session: { access_token: 'at', refresh_token: 'rt' } },
  });
  assertEquals(auth.signIns, ['a@example.com']);
  assertEquals(db.called('registerDevice').length, 1);
  assertEquals(db.called('bindIdentifier')[0]!.args[1], 'email');
});

Deno.test('email verify: a Gmail variant signs into the existing account', async () => {
  const { d, db, auth } = deps();
  db.owners.set(`email:${await hashOf('email', 'eceyilmaz@gmail.com')}`, 'user-1');
  auth.emails.set('user-1', 'ece.yilmaz@gmail.com');
  await verifyEmailOtp(d, verifyReq('EceYilmaz+x@gmail.com'), ctx);
  assertEquals(auth.signIns, ['ece.yilmaz@gmail.com']);
});

Deno.test(
  'email verify: a banned owner sees only the generic refusal and gets no session',
  async () => {
    const { d, db, auth } = deps();
    db.bans.add(`email:${await hashOf('email', 'a@example.com')}`);
    assertEquals(await verifyEmailOtp(d, verifyReq('a@example.com'), ctx), {
      ok: false,
      status: 403,
      error: 'registration_blocked',
    });
    assertEquals(auth.signIns.length, 0);
  },
);

Deno.test('email verify: a banned device alone does not block sign-in (BAN-05)', async () => {
  const { d, db } = deps();
  db.deviceResult = 'review';
  db.bans.add(`device:${await hashOf('device', 'device-aaaa-1111')}`);
  assert((await verifyEmailOtp(d, verifyReq('a@example.com'), ctx)).ok);
  assertEquals(db.called('banAccount').length, 0);
});

Deno.test(
  'session register: a banned Apple/Google subject is ban evasion (BAN-04, BAN-10)',
  async () => {
    const { d, db, auth } = deps();
    auth.addUser('tok', 'user-7', 'new@example.com', [{ provider: 'apple', sub: '000123.abc' }]);
    db.bans.add(`oauth_sub:${await hashOf('oauth_sub', 'apple:000123.abc')}`);
    const r = await registerSession(d, 'tok', { deviceId: 'device-aaaa-1111', platform: 'ios' });
    assertEquals(r, { ok: false, status: 403, error: 'registration_blocked' });
    const ban = db.called('banAccount')[0]!;
    assertEquals(ban.args.slice(0, 2), ['user-7', 'ban_evasion']);
  },
);

Deno.test(
  'session register: needs a valid session and binds email and OAuth identifiers',
  async () => {
    const { d, db, auth } = deps();
    assertEquals((await registerSession(d, null, {})).status, 401);
    assertEquals((await registerSession(d, 'bad', {})).status, 401);
    auth.addUser('tok', 'user-8', 'x@example.com', [{ provider: 'google', sub: '42' }]);
    assertEquals((await registerSession(d, 'tok', { deviceId: 'x' })).status, 400);
    assert(
      (await registerSession(d, 'tok', { deviceId: 'device-aaaa-1111', platform: 'android' })).ok,
    );
    assertEquals(
      db.called('bindIdentifier').map((c) => c.args[1]),
      ['email', 'oauth_sub'],
    );
  },
);

Deno.test('BAN-12: identifier hashes are keyed HMACs, not plain SHA-256', async () => {
  const value = 'eceyilmaz@gmail.com';
  const plain = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  const { identifierHash } = await import('../_shared/crypto.ts');
  const a = await identifierHash('secret-one-secret-one-secret-one-1', 'email', value);
  const b = await identifierHash('secret-two-secret-two-secret-two-2', 'email', value);
  assertNotEquals(a, plain);
  assertNotEquals(a, b);
  assertNotEquals(a, await identifierHash('secret-one-secret-one-secret-one-1', 'phone', value));
  assertEquals(a, await identifierHash('secret-one-secret-one-secret-one-1', 'email', value));
  assert(/^[0-9a-f]{64}$/.test(a));
});
