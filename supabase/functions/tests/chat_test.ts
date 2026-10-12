import { assert, assertEquals } from '@std/assert';
import { chatAction } from '../_shared/services/chat.ts';
import { tablesAction, type TurDeps } from '../_shared/services/tur.ts';
import { FakeAuth, FakeDb, FakeStore, FakeTurDb, UUID } from './fakes.ts';

function deps(status: 'active' | 'onboarding' = 'active') {
  const db = new FakeDb();
  db.state = { ...db.state!, status };
  const auth = new FakeAuth();
  auth.addUser('tok', 'user-1');
  const tur = new FakeTurDb();
  const d: TurDeps = { db, tur, auth, store: new FakeStore() };
  return { d, tur };
}
const send = (text: string) => ({ action: 'send', tableId: UUID(8), clientId: UUID(9), text });

Deno.test('chat: a message is sent with its pattern flags (SOH-04..06)', async () => {
  const { d, tur } = deps();
  const r = await chatAction(d, 'tok', send(' Selam! WhatsApp’tan da yazabilirsin '));
  assertEquals(r.status, 200);
  const input = tur.called('messageSend')[0]!.args[0] as Record<string, unknown>;
  assertEquals(input.body, 'Selam! WhatsApp’tan da yazabilirsin');
  assertEquals(input.clientId, UUID(9));
  assertEquals(input.flags, { offPlatform: true });
  await chatAction(d, 'tok', send('Şuna bak www.ornek.com'));
  assertEquals((tur.called('messageSend')[1]!.args[0] as { flags: unknown }).flags, { link: true });
});

Deno.test('chat: server refusals map to clear errors', async () => {
  for (const [result, status, error] of [
    ['not_active', 409, 'table_closed'],
    ['link_blocked', 403, 'link_blocked'],
    ['not_found', 404, 'not_found'],
  ] as const) {
    const { d, tur } = deps();
    tur.results.messageSend = { result };
    const r = await chatAction(d, 'tok', send('Selam'));
    assertEquals(r.status, status);
    assert(!r.ok && r.error === error);
  }
  const { d } = deps();
  assertEquals((await chatAction(d, 'tok', send('   '))).status, 400);
  assertEquals((await chatAction(d, 'tok', { action: 'shout', tableId: UUID(8) })).status, 400);
  assertEquals((await chatAction(deps('onboarding').d, 'tok', send('Selam'))).status, 409);
  assertEquals((await chatAction(d, null, send('Selam'))).status, 401);
});

Deno.test('chat: farewell, its note moderated; reopen and block', async () => {
  const { d, tur } = deps();
  const bye = { action: 'farewell', tableId: UUID(8), key: 'take_care' };
  assertEquals((await chatAction(d, 'tok', { ...bye, note: 'Sana iyi şanslar' })).status, 200);
  assertEquals(tur.called('tableFarewell')[0]!.args.slice(1), [
    UUID(8),
    'take_care',
    'Sana iyi şanslar',
  ]);
  const rude = await chatAction(d, 'tok', { ...bye, note: 'instagram: @ben' });
  assert(!rude.ok && rude.error === 'text_blocked');
  assertEquals(tur.called('tableFarewell').length, 1);
  tur.results.tableFarewell = 'already_closed';
  assertEquals((await chatAction(d, 'tok', bye)).status, 409);

  const reopen = await chatAction(d, 'tok', { action: 'reopen', tableId: UUID(8) });
  assert(reopen.ok && reopen.body.result === 'waiting_other');
  tur.results.tableReopen = 'too_late';
  const late = await chatAction(d, 'tok', { action: 'reopen', tableId: UUID(8) });
  assert(!late.ok && late.error === 'reopen_too_late');

  assertEquals((await chatAction(d, 'tok', { action: 'block', tableId: UUID(8) })).status, 200);
  assertEquals((await chatAction(d, 'tok', { action: 'read', tableId: UUID(8) })).status, 200);
});

Deno.test('tables: the list carries the break; Mola start, limit and end', async () => {
  const { d, tur } = deps();
  const list = await tablesAction(d, 'tok', { action: 'list' });
  assert(list.ok && (list.body.pause as { perMonth: number }).perMonth === 2);
  const start = await tablesAction(d, 'tok', { action: 'pause', days: 3 });
  assert(start.ok && start.body.until);
  assertEquals(tur.called('pauseStart')[0]!.args[1], 3);
  assertEquals((await tablesAction(d, 'tok', { action: 'pause', days: 8 })).status, 400);
  tur.results.pauseStart = { result: 'limit' };
  const limit = await tablesAction(d, 'tok', { action: 'pause', days: 2 });
  assert(!limit.ok && limit.error === 'pause_limit');
  assertEquals((await tablesAction(d, 'tok', { action: 'pause_end' })).status, 200);
});
