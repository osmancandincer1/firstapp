import { assertEquals } from '@std/assert';
import { CONSENT_TYPES } from '../../../packages/shared/src/index.ts';
import { ipHash } from '../_shared/crypto.ts';
import {
  recordConsents,
  setBirthDate,
  type OnboardingDeps,
} from '../_shared/services/onboarding.ts';
import { ctx, env, FakeAuth, FakeDb, SECRET } from './fakes.ts';

function deps(state: Partial<NonNullable<FakeDb['state']>> = {}) {
  const db = new FakeDb();
  db.state = { ...db.state!, phoneVerified: true, ...state };
  const auth = new FakeAuth();
  auth.addUser('tok', 'user-1');
  const d: OnboardingDeps = { env, db, auth };
  return { d, db };
}

Deno.test('birth date: an adult date is stored', async () => {
  const { d, db } = deps();
  assertEquals(await setBirthDate(d, 'tok', { birthDate: '1995-04-12' }, ctx), {
    ok: true,
    status: 200,
    body: { ok: true },
  });
  assertEquals(db.called('setBirthDate')[0]!.args, ['user-1', '1995-04-12']);
});

Deno.test('birth date: under 18 is refused with a 24-hour wait (AUTH-01)', async () => {
  const { d, db } = deps();
  db.birthDateResult = 'underage';
  assertEquals(await setBirthDate(d, 'tok', { birthDate: '2010-01-01' }, ctx), {
    ok: false,
    status: 403,
    error: 'underage',
    retryAt: '2026-10-12T12:00:00.000Z',
  });
});

Deno.test(
  'birth date: the database decides even if the request looks fine (client bypass, AUTH-01)',
  async () => {
    const { d, db } = deps();
    db.birthDateResult = 'age_locked';
    assertEquals((await setBirthDate(d, 'tok', { birthDate: '1990-01-01' }, ctx)).status, 429);
    db.birthDateResult = 'already_set';
    assertEquals((await setBirthDate(d, 'tok', { birthDate: '1990-01-01' }, ctx)).status, 409);
    db.birthDateResult = 'not_found';
    assertEquals((await setBirthDate(d, 'tok', { birthDate: '1990-01-01' }, ctx)).status, 400);
  },
);

Deno.test('birth date: malformed, future and skipped-step requests are refused', async () => {
  const { d, db } = deps();
  for (const birthDate of ['01.01.1990', '1990-02-30', '2030-01-01', '1890-01-01']) {
    assertEquals((await setBirthDate(d, 'tok', { birthDate }, ctx)).status, 400);
  }
  assertEquals(db.called('setBirthDate').length, 0);
  assertEquals(
    (await setBirthDate(deps({ phoneVerified: false }).d, 'tok', { birthDate: '1990-01-01' }, ctx))
      .status,
    409,
  );
  assertEquals(
    (
      await setBirthDate(
        deps({ birthDate: '1990-01-01' }).d,
        'tok',
        { birthDate: '1990-01-01' },
        ctx,
      )
    ).status,
    409,
  );
  assertEquals((await setBirthDate(d, null, { birthDate: '1990-01-01' }, ctx)).status, 401);
});

const all = (granted: (t: string) => boolean, version = 'v1') =>
  CONSENT_TYPES.map((type) => ({ type, version, granted: granted(type) }));

function consentDeps() {
  const x = deps({ birthDate: '1990-01-01' });
  x.db.versions = Object.fromEntries(CONSENT_TYPES.map((t) => [t, 'v1']));
  return x;
}

Deno.test(
  'consents: all required consents are recorded with version and IP hash (AUTH-07)',
  async () => {
    const { d, db } = consentDeps();
    const choices = all((t) => t !== 'marketing');
    assertEquals((await recordConsents(d, 'tok', { consents: choices }, ctx)).ok, true);
    const [, stored, ip] = db.called('insertConsents')[0]!.args;
    assertEquals(stored, choices);
    assertEquals(ip, await ipHash(SECRET, ctx.ip));
  },
);

Deno.test('consents: a declined required consent or an old version is refused', async () => {
  const { d, db } = consentDeps();
  assertEquals(await recordConsents(d, 'tok', { consents: all((t) => t !== 'biometric') }, ctx), {
    ok: false,
    status: 400,
    error: 'consents_incomplete',
  });
  assertEquals(await recordConsents(d, 'tok', { consents: all(() => true, 'v0') }, ctx), {
    ok: false,
    status: 400,
    error: 'consents_outdated',
  });
  assertEquals(db.called('insertConsents').length, 0);
});

Deno.test('consents: no published documents means the step stays closed (§17)', async () => {
  const { d, db } = consentDeps();
  db.versions = {};
  assertEquals((await recordConsents(d, 'tok', { consents: all(() => true) }, ctx)).status, 503);
});

Deno.test('consents: requires the birth-date step first', async () => {
  const { d } = deps();
  assertEquals((await recordConsents(d, 'tok', { consents: all(() => true) }, ctx)).status, 409);
  assertEquals((await recordConsents(d, 'tok', { consents: [] }, ctx)).status, 400);
});
