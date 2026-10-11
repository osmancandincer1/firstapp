import { assert, assertEquals } from '@std/assert';
import { identifierHash } from '../_shared/crypto.ts';
import {
  completeLiveness,
  startLiveness,
  type LivenessDeps,
} from '../_shared/services/liveness.ts';
import { ctx, env, FakeAuth, FakeDb, FakeLiveness, SECRET } from './fakes.ts';

function deps() {
  const db = new FakeDb();
  db.state = {
    ...db.state!,
    phoneVerified: true,
    birthDate: '1990-01-01',
    consentsComplete: true,
    basicsComplete: true,
  };
  const auth = new FakeAuth();
  auth.addUser('tok', 'user-1');
  const provider = new FakeLiveness();
  const d: LivenessDeps = { env, db, auth, liveness: provider, faces: provider };
  return { d, db, provider };
}
const finish = (db: FakeDb) => db.called('livenessFinish')[0]!.args[0] as Record<string, unknown>;

Deno.test('liveness start: creates a session for an eligible user', async () => {
  const { d, db } = deps();
  assertEquals(await startLiveness(d, 'tok', ctx), {
    ok: true,
    status: 200,
    body: { ok: true, sessionId: 'session-12345', provider: 'mock' },
  });
  assertEquals(db.called('livenessCreate')[0]!.args, ['user-1', 'mock', 'session-12345']);
});

Deno.test(
  'liveness start: needs completed consents, and is off without a provider (§0.9)',
  async () => {
    const { d, db } = deps();
    db.state = { ...db.state!, consentsComplete: false };
    assertEquals((await startLiveness(d, 'tok', ctx)).status, 409);
    const x = deps();
    x.d.liveness = null;
    assertEquals(await startLiveness(x.d, 'tok', ctx), {
      ok: false,
      status: 503,
      error: 'service_unavailable',
    });
    assertEquals((await startLiveness(x.d, null, ctx)).status, 401);
  },
);

Deno.test('liveness start: three failures in 24 hours mean a cooldown (VER-01)', async () => {
  const { d, db } = deps();
  const h = (n: number) => new Date(ctx.now.getTime() - n * 3_600_000);
  db.failures = [h(5), h(3), h(1)];
  assertEquals(await startLiveness(d, 'tok', ctx), {
    ok: false,
    status: 429,
    error: 'liveness_cooldown',
    retryAt: new Date(h(5).getTime() + 24 * 3_600_000).toISOString(),
  });
});

Deno.test('liveness complete: a live adult with a new face passes and is indexed', async () => {
  const { d, db, provider } = deps();
  assertEquals(await completeLiveness(d, 'tok', { sessionId: 'session-12345' }, ctx), {
    ok: true,
    status: 200,
    body: { ok: true, outcome: 'passed' },
  });
  assertEquals(provider.indexed, ['u_user-1']);
  const f = finish(db);
  assertEquals(f.outcome, 'passed');
  assertEquals(f.faceHash, await identifierHash(SECRET, 'face', 'face-new'));
  assert(!JSON.stringify(f).includes('"1,2,3"') && !('image' in f), 'the frame is never stored');
});

Deno.test(
  'liveness complete: low confidence fails without trusting face matches (VER-01)',
  async () => {
    const { d, db, provider } = deps();
    provider.result = { confidence: 50, referenceImage: new Uint8Array([1]) };
    provider.matches = ['face-banned'];
    const r = await completeLiveness(d, 'tok', { sessionId: 'session-12345' }, ctx);
    assertEquals(r, { ok: true, status: 200, body: { ok: true, outcome: 'failed' } });
    assertEquals(db.called('faceOwners').length, 0);
    assertEquals(provider.indexed.length, 0);
    assertEquals(finish(db).outcome, 'failed_low_confidence');
  },
);

Deno.test('liveness complete: the third failure tells the user when to retry', async () => {
  const { d, db, provider } = deps();
  provider.result = { confidence: 10, referenceImage: null };
  const h = (n: number) => new Date(ctx.now.getTime() - n * 3_600_000);
  db.failures = [h(2), h(1), ctx.now];
  const r = await completeLiveness(d, 'tok', { sessionId: 'session-12345' }, ctx);
  assertEquals(r.ok && r.body.retryAt, new Date(h(2).getTime() + 24 * 3_600_000).toISOString());
});

Deno.test(
  'liveness complete: a banned face is refused and reported generically (BAN-03)',
  async () => {
    const { d, db, provider } = deps();
    provider.matches = ['face-banned'];
    db.faceOwnerResult = ['banned'];
    const r = await completeLiveness(d, 'tok', { sessionId: 'session-12345' }, ctx);
    assertEquals(r, { ok: true, status: 200, body: { ok: true, outcome: 'blocked' } });
    const f = finish(db);
    assertEquals(f.outcome, 'banned_face');
    assertEquals(f.matchedHashes, [await identifierHash(SECRET, 'face', 'face-banned')]);
    assertEquals(provider.indexed.length, 0);
  },
);

Deno.test(
  'liveness complete: a face already on another account stops sign-up (VER-03)',
  async () => {
    const { d, db, provider } = deps();
    provider.matches = ['face-other'];
    db.faceOwnerResult = ['active_other'];
    const r = await completeLiveness(d, 'tok', { sessionId: 'session-12345' }, ctx);
    assertEquals(r.ok && r.body.outcome, 'blocked');
    assertEquals(finish(db).outcome, 'duplicate_face');

    // A race caught by the database (unique face) gives the same answer.
    const x = deps();
    x.db.finishResult = 'duplicate_face';
    const r2 = await completeLiveness(x.d, 'tok', { sessionId: 'session-12345' }, ctx);
    assertEquals(r2.ok && r2.body.outcome, 'blocked');
  },
);

Deno.test('liveness complete: an age estimate under 21 asks for an ID (VER-04)', async () => {
  const { d, db, provider } = deps();
  provider.age = { low: 19, high: 24 };
  const r = await completeLiveness(d, 'tok', { sessionId: 'session-12345' }, ctx);
  assertEquals(r.ok && r.body.outcome, 'needs_id');
  assertEquals(finish(db).ageLow, 19);
});

Deno.test('liveness complete: unknown sessions and bad input are refused', async () => {
  const { d, db } = deps();
  db.finishResult = 'unknown_session';
  assertEquals((await completeLiveness(d, 'tok', { sessionId: 'session-99999' }, ctx)).status, 400);
  assertEquals((await completeLiveness(d, 'tok', {}, ctx)).status, 400);
  const x = deps();
  x.db.state = { ...x.db.state!, livenessVerified: true };
  assertEquals(
    (await completeLiveness(x.d, 'tok', { sessionId: 'session-12345' }, ctx)).status,
    409,
  );
});

Deno.test(
  'liveness start: needs the basics step first, and allows a repeat check (VER-07)',
  async () => {
    const { d, db } = deps();
    db.state = { ...db.state!, basicsComplete: false };
    assertEquals((await startLiveness(d, 'tok', ctx)).status, 409);
    db.state = { ...db.state!, status: 'active', livenessVerified: true, reverifyRequired: true };
    assert((await startLiveness(d, 'tok', ctx)).ok);
    db.state = { ...db.state!, reverifyRequired: false };
    assertEquals((await startLiveness(d, 'tok', ctx)).status, 409);
  },
);
