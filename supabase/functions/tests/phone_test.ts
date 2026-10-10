import { assert, assertEquals } from '@std/assert';
import { requestPhoneOtp, verifyPhoneOtp, type PhoneDeps } from '../_shared/services/phone.ts';
import { ctx, env, FakeAuth, FakeDb, FixedLookup, hashOf, Outbox } from './fakes.ts';

function deps(
  lineType: 'mobile' | 'voip' | 'landline' | 'unknown' = 'mobile',
  appEnv: 'local' | 'staging' = 'staging',
) {
  const db = new FakeDb();
  const auth = new FakeAuth();
  auth.addUser('tok', 'user-1', 'a@example.com');
  const sms = new Outbox();
  const d: PhoneDeps = {
    env: { ...env, appEnv },
    db,
    auth,
    sms,
    lookup: new FixedLookup(lineType),
    code: () => '654321',
  };
  return { d, db, sms };
}
const body = (phone: string) => ({ phone, deviceId: 'device-aaaa-1111', locale: 'tr' });

Deno.test('phone request: requires a signed-in user at the phone step', async () => {
  const { d, db } = deps();
  assertEquals((await requestPhoneOtp(d, null, body('05321234567'), ctx)).status, 401);
  db.state = { ...db.state!, phoneVerified: true };
  assertEquals(await requestPhoneOtp(d, 'tok', body('05321234567'), ctx), {
    ok: false,
    status: 409,
    error: 'wrong_step',
  });
});

Deno.test('phone request: a Turkish mobile number in any format gets a code', async () => {
  for (const raw of ['0532 123 45 67', '+90 (532) 123-45-67', '5321234567']) {
    const { d, sms, db } = deps();
    assertEquals(await requestPhoneOtp(d, 'tok', body(raw), ctx), {
      ok: true,
      status: 200,
      body: { ok: true },
    });
    assertEquals(sms.sent, [
      { to: '+905321234567', text: 'Nokuzo kodun: 654321. 10 dk geçerli. Kimseyle paylaşma.' },
    ]);
    assertEquals(db.called('otpCreate')[0]!.args[4], 'user-1', 'the code is bound to the account');
  }
});

Deno.test(
  'phone request: other countries, landlines and malformed numbers are refused',
  async () => {
    const { d } = deps();
    assertEquals(
      (await requestPhoneOtp(d, 'tok', body('+44 7911 123456'), ctx)).ok ? 'ok' : 'refused',
      'refused',
    );
    assertEquals(await requestPhoneOtp(d, 'tok', body('+44 7911 123456'), ctx), {
      ok: false,
      status: 400,
      error: 'unsupported_country',
    });
    assertEquals(await requestPhoneOtp(d, 'tok', body('0212 123 45 67'), ctx), {
      ok: false,
      status: 400,
      error: 'unsupported_line',
    });
    assertEquals(await requestPhoneOtp(d, 'tok', body('12'), ctx), {
      ok: false,
      status: 400,
      error: 'invalid_input',
    });
    assertEquals(await requestPhoneOtp(d, 'tok', body('call me maybe'), ctx), {
      ok: false,
      status: 400,
      error: 'invalid_phone',
    });
  },
);

Deno.test('phone request: VoIP numbers are refused (AUTH-04)', async () => {
  const { d, sms } = deps('voip');
  assertEquals(await requestPhoneOtp(d, 'tok', body('05321234567'), ctx), {
    ok: false,
    status: 400,
    error: 'voip_number',
  });
  assertEquals(sms.sent.length, 0);
});

Deno.test('phone request: an unclassified number passes only in local', async () => {
  assertEquals(
    (await requestPhoneOtp(deps('unknown', 'staging').d, 'tok', body('05321234567'), ctx)).status,
    400,
  );
  assert((await requestPhoneOtp(deps('unknown', 'local').d, 'tok', body('05321234567'), ctx)).ok);
});

Deno.test('phone request: without an SMS provider the step is unavailable, not faked', async () => {
  const { d } = deps();
  d.sms = null;
  assertEquals((await requestPhoneOtp(d, 'tok', body('05321234567'), ctx)).status, 503);
});

Deno.test(
  'phone request: banned or taken numbers get a notice by SMS and the same response (BAN-02, AUTH-05)',
  async () => {
    const phoneHash = await hashOf('phone', '+905321234567');
    for (const setup of ['banned', 'taken'] as const) {
      const { d, db, sms } = deps();
      if (setup === 'banned') db.bans.add(`phone:${phoneHash}`);
      else db.owners.set(`phone:${phoneHash}`, 'someone-else');
      const r = await requestPhoneOtp(d, 'tok', body('+90 532 123 4567'), ctx);
      assertEquals(r, { ok: true, status: 200, body: { ok: true } });
      assertEquals(db.called('otpCreate').length, 0);
      assertEquals(sms.sent.length, 1);
      assert(!sms.sent[0]!.text.includes('654321'));
    }
  },
);

Deno.test('phone request: rate limited per user as well (AUTH-03)', async () => {
  const { d } = deps();
  for (let i = 0; i < 3; i++) {
    assert(
      (await requestPhoneOtp(d, 'tok', body(`053212345${60 + i}`), { ...ctx, ip: `10.0.0.${i}` }))
        .ok,
    );
  }
  const r = await requestPhoneOtp(d, 'tok', body('05321234599'), { ...ctx, ip: '10.0.0.99' });
  assertEquals(r.status, 429);
});

const verifyBody = (code = '654321') => ({
  phone: '05321234567',
  code,
  deviceId: 'device-aaaa-1111',
});

Deno.test('phone verify: the right code completes the step', async () => {
  const { d, db } = deps();
  assertEquals(await verifyPhoneOtp(d, 'tok', verifyBody(), ctx), {
    ok: true,
    status: 200,
    body: { ok: true },
  });
  const [userId, , last2] = db.called('markPhoneVerified')[0]!.args;
  assertEquals([userId, last2], ['user-1', '67']);
  assertEquals(db.called('otpVerify')[0]!.args[5], 'user-1');
});

Deno.test('phone verify: errors and refusals', async () => {
  const cases: [Partial<FakeDb>, string][] = [
    [{ otpVerifyResult: 'invalid' }, 'otp_invalid'],
    [{ otpVerifyResult: 'expired' }, 'otp_expired'],
    [{ otpVerifyResult: 'locked' }, 'otp_locked'],
    [{ markPhoneResult: 'taken' }, 'registration_blocked'],
  ];
  for (const [over, error] of cases) {
    const { d, db } = deps();
    Object.assign(db, over);
    const r = await verifyPhoneOtp(d, 'tok', verifyBody(), ctx);
    assertEquals(r.ok ? null : r.error, error);
  }
  assertEquals((await verifyPhoneOtp(deps().d, null, verifyBody(), ctx)).status, 401);
});

Deno.test('phone verify: a number banned in the meantime bans the account (BAN-10)', async () => {
  const { d, db } = deps();
  db.bans.add(`phone:${await hashOf('phone', '+905321234567')}`);
  const r = await verifyPhoneOtp(d, 'tok', verifyBody(), ctx);
  assertEquals(r, { ok: false, status: 403, error: 'registration_blocked' });
  assertEquals(db.called('banAccount')[0]!.args[1], 'ban_evasion');
  assertEquals(db.called('markPhoneVerified').length, 0);
});
