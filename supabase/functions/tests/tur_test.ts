import { assert, assertEquals } from '@std/assert';
import { answerAction, tablesAction, turAction, type TurDeps } from '../_shared/services/tur.ts';
import { updateProfile } from '../_shared/services/profile.ts';
import type { TurDb } from '../_shared/types.ts';
import { ctx, FakeAuth, FakeDb, FakeProfileDb, FakeStore } from './fakes.ts';

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = (name: string) => ({
  id: UUID(99),
  name,
  age: 31,
  photos: [{ id: UUID(50), path: 'p2/photos/a.jpg', caption: 'Kapadokya' }],
  voice: { path: 'p2/voice/v.m4a', durationMs: 9000 },
});

class FakeTurDb implements TurDb {
  calls: { fn: string; args: unknown[] }[] = [];
  results: Record<string, unknown> = {};
  recent: string[] = [];
  private r<T>(fn: string, fallback: T, ...args: unknown[]): Promise<T> {
    this.calls.push({ fn, args });
    return Promise.resolve((fn in this.results ? this.results[fn] : fallback) as T);
  }
  called(fn: string) {
    return this.calls.filter((c) => c.fn === fn);
  }
  currentTur(...a: unknown[]) {
    return this.r<Record<string, unknown> | null>(
      'currentTur',
      {
        batchId: UUID(1),
        cards: [{ cardId: UUID(2), candidateId: UUID(3), reasons: {}, profile: profile('Mert') }],
      },
      ...a,
    );
  }
  saved(...a: unknown[]) {
    return this.r('saved', [{ candidateId: UUID(3), profile: profile('Mert') }], ...a);
  }
  turAction(...a: unknown[]) {
    return this.r('turAction', 'ok' as const, ...a);
  }
  lessLikeThis(...a: unknown[]) {
    return this.r('lessLikeThis', undefined, ...a);
  }
  recentAnswerTexts(...a: unknown[]) {
    return this.r('recentAnswerTexts', this.recent, ...a);
  }
  answerCreate(...a: unknown[]) {
    return this.r('answerCreate', { result: 'ok', answerId: UUID(7) }, ...a);
  }
  answerRespond(...a: unknown[]) {
    return this.r(
      'answerRespond',
      { result: 'ok', tableId: UUID(8), tableStatus: 'active' as const },
      ...a,
    );
  }
  inbox(...a: unknown[]) {
    return this.r(
      'inbox',
      {
        incoming: [
          {
            answerId: UUID(4),
            text: null,
            voicePath: 'u_x/answers/1.m4a',
            profile: profile('Ece'),
          },
        ],
        outgoing: [{ answerId: UUID(5), status: 'waiting', profile: profile('Deniz') }],
      },
      ...a,
    );
  }
  myTables(...a: unknown[]) {
    return this.r(
      'myTables',
      [{ tableId: UUID(8), status: 'active', profile: profile('Ece') }],
      ...a,
    );
  }
}

function deps(status: 'active' | 'onboarding' = 'active') {
  const db = new FakeDb();
  db.state = { ...db.state!, status };
  const auth = new FakeAuth();
  auth.addUser('tok', 'user-1');
  const tur = new FakeTurDb();
  const store = new FakeStore();
  const d: TurDeps = { db, tur, auth, store };
  return { d, db, tur, store };
}

// --- Round ---------------------------------------------------------------------------

Deno.test('tur view: cards with signed media URLs and no raw storage paths (PRO-05)', async () => {
  const { d, store } = deps();
  const r = await turAction(d, 'tok', { action: 'view' });
  assert(r.ok);
  const card = (r.body.tur as { cards: { profile: Record<string, unknown> }[] }).cards[0]!;
  assertEquals(
    (card.profile.photos as { url: string }[])[0]!.url,
    'https://signed/public-photos/p2/photos/a.jpg?ttl=600',
  );
  assertEquals(
    (card.profile.voice as { url: string }).url,
    'https://signed/public-voice/p2/voice/v.m4a?ttl=600',
  );
  assert(!JSON.stringify(r.body).includes('"path"'), 'storage paths are not exposed');
  assert(!('id' in card.profile), 'internal profile ids are not exposed');
  assert(store.signed.every((s) => s.ttl === 600));
});

Deno.test('tur view: no Round yet', async () => {
  const { d, tur } = deps();
  tur.results.currentTur = null;
  assertEquals(await turAction(d, 'tok', { action: 'view' }), {
    ok: true,
    status: 200,
    body: { ok: true, tur: null },
  });
});

Deno.test('tur: only active accounts, valid actions and clear errors', async () => {
  assertEquals((await turAction(deps('onboarding').d, 'tok', { action: 'view' })).status, 409);
  assertEquals((await turAction(deps().d, null, { action: 'view' })).status, 401);
  const { d, tur } = deps();
  assertEquals((await turAction(d, 'tok', { action: 'pass' })).status, 400);
  assertEquals((await turAction(d, 'tok', { action: 'pass', cardId: UUID(2) })).ok, true);
  tur.results.turAction = 'saved_limit';
  assertEquals(await turAction(d, 'tok', { action: 'save', cardId: UUID(2) }), {
    ok: false,
    status: 409,
    error: 'saved_limit',
  });
  tur.results.turAction = 'not_found';
  assertEquals((await turAction(d, 'tok', { action: 'unsave', cardId: UUID(2) })).status, 404);
  assertEquals((await turAction(d, 'tok', { action: 'less', reasonKey: 'same_intent' })).ok, true);
  assertEquals((await turAction(d, 'tok', { action: 'less', reasonKey: 'made_up' })).status, 400);
  const saved = await turAction(d, 'tok', { action: 'saved' });
  assert(saved.ok && (saved.body.saved as unknown[]).length === 1);
});

// --- Answers -------------------------------------------------------------------------

const send = (text: string) => ({ action: 'send', candidateId: UUID(3), text });

Deno.test('answer: a good text answer is sent', async () => {
  const { d, tur } = deps();
  assertEquals(await answerAction(d, 'tok', send('  Simit-çay, deniz kenarında!  ')), {
    ok: true,
    status: 200,
    body: { ok: true, answerId: UUID(7) },
  });
  assertEquals(
    (tur.called('answerCreate')[0]!.args[0] as { text: string }).text,
    'Simit-çay, deniz kenarında!',
  );
});

Deno.test(
  'answer: emoji-only, short and contact-sharing answers are refused (MAS-01, §7.2)',
  async () => {
    const { d, tur } = deps();
    assertEquals(await answerAction(d, 'tok', send('😂😂😂😂😂😂😂😂😂😂')), {
      ok: false,
      status: 400,
      error: 'answer_invalid',
      details: { reason: 'emoji_only' },
    });
    assertEquals((await answerAction(d, 'tok', send('kısa'))).ok, false);
    assertEquals(await answerAction(d, 'tok', send('Instagramdan yaz bana: ece')), {
      ok: false,
      status: 400,
      error: 'text_blocked',
      details: { field: 'text', reason: 'contact_info' },
    });
    assertEquals(tur.called('answerCreate').length, 0);
  },
);

Deno.test(
  'answer: copy-paste — the 3rd similar answer is sent with a warning, the 4th refused (MAS-03)',
  async () => {
    const text = 'Serpme kahvaltı tabii ki, bol çay ile!';
    const a = deps();
    a.tur.recent = [text, text.toUpperCase()];
    const r = await answerAction(a.d, 'tok', send(text));
    assertEquals(r.ok && r.body.warning, 'similar');
    const b = deps();
    b.tur.recent = [text, text, `${text}.`];
    assertEquals(await answerAction(b.d, 'tok', send(text)), {
      ok: false,
      status: 429,
      error: 'answer_duplicate',
    });
  },
);

Deno.test('answer: server-side refusals map to clear errors (MAS-02)', async () => {
  for (const [result, error, reason] of [
    ['not_in_tur', 'not_in_tur', undefined],
    ['daily_limit', 'answer_limit', 'daily'],
    ['pending_limit', 'answer_limit', 'pending'],
  ] as const) {
    const { d, tur } = deps();
    tur.results.answerCreate = { result };
    const r = await answerAction(d, 'tok', send('Serpme kahvaltı tabii'));
    assertEquals(r.ok ? null : [r.error, r.details?.reason], [error, reason]);
  }
  const { d } = deps();
  assertEquals(
    (await answerAction(d, 'tok', { action: 'send', candidateId: UUID(3) })).status,
    400,
    'text or voice required',
  );
});

function m4a(ms: number) {
  const enc = new TextEncoder();
  const be32 = (n: number) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const box = (type: string, payload: number[]) => [
    ...be32(payload.length + 8),
    ...enc.encode(type),
    ...payload,
  ];
  const mvhd = [
    0,
    0,
    0,
    0,
    ...be32(0),
    ...be32(0),
    ...be32(1000),
    ...be32(ms),
    ...new Array(80).fill(0),
  ];
  return new Uint8Array([
    ...box('ftyp', [...enc.encode('M4A '), 0, 0, 0, 0]),
    ...box('moov', box('mvhd', mvhd)),
  ]);
}

Deno.test(
  'answer: voice answers of 3–20 seconds are published from the sender’s own folder',
  async () => {
    const { d, store, tur } = deps();
    const up = await answerAction(d, 'tok', { action: 'voice_upload_url' });
    assert(up.ok);
    const path = up.body.path as string;
    assert(path.startsWith('u_user-1/answers/'));
    store.objects.set(`quarantine/${path}`, m4a(6_000));
    const r = await answerAction(d, 'tok', {
      action: 'send',
      candidateId: UUID(3),
      voiceId: up.body.id as string,
    });
    assert(r.ok);
    assert(store.objects.has(`public-voice/${path}`));
    assertEquals((tur.called('answerCreate')[0]!.args[0] as { voiceMs: number }).voiceMs, 6_000);

    const short = deps();
    short.store.objects.set(`quarantine/u_user-1/answers/${UUID(9)}.m4a`, m4a(1_500));
    assertEquals(
      await answerAction(short.d, 'tok', {
        action: 'send',
        candidateId: UUID(3),
        voiceId: UUID(9),
      }),
      {
        ok: false,
        status: 400,
        error: 'answer_invalid',
        details: { reason: 'voice_duration' },
      },
    );
    const missing = deps();
    assertEquals(
      (
        await answerAction(missing.d, 'tok', {
          action: 'send',
          candidateId: UUID(3),
          voiceId: UUID(9),
        })
      ).status,
      404,
    );
  },
);

Deno.test('answer: a refused voice answer does not stay published', async () => {
  const { d, store, tur } = deps();
  tur.results.answerCreate = { result: 'not_in_tur' };
  store.objects.set(`quarantine/u_user-1/answers/${UUID(9)}.m4a`, m4a(6_000));
  await answerAction(d, 'tok', { action: 'send', candidateId: UUID(3), voiceId: UUID(9) });
  assertEquals(store.objects.size, 0);
});

Deno.test('inbox: signs profiles and the voice of incoming answers', async () => {
  const { d } = deps();
  const r = await answerAction(d, 'tok', { action: 'inbox' });
  assert(r.ok);
  const incoming = (r.body.incoming as Record<string, unknown>[])[0]!;
  assertEquals(incoming.voiceUrl, 'https://signed/public-voice/u_x/answers/1.m4a?ttl=600');
  assert(!('voicePath' in incoming));
  assertEquals((r.body.outgoing as Record<string, unknown>[])[0]!.status, 'waiting');
});

Deno.test('reciprocate and pass', async () => {
  const { d, tur } = deps();
  assertEquals(
    await answerAction(d, 'tok', {
      action: 'reciprocate',
      answerId: UUID(4),
      message: ' Ben de! ',
    }),
    {
      ok: true,
      status: 200,
      body: { ok: true, tableId: UUID(8), tableStatus: 'active' },
    },
  );
  assertEquals(tur.called('answerRespond')[0]!.args.slice(2), ['reciprocate', 'Ben de!']);
  assertEquals(
    (
      await answerAction(d, 'tok', {
        action: 'reciprocate',
        answerId: UUID(4),
        message: 'wp 05321234567',
      })
    ).ok,
    false,
  );
  tur.results.answerRespond = { result: 'passed' };
  assertEquals((await answerAction(d, 'tok', { action: 'pass', answerId: UUID(4) })).ok, true);
  tur.results.answerRespond = { result: 'not_found' };
  assertEquals((await answerAction(d, 'tok', { action: 'pass', answerId: UUID(4) })).status, 404);
  assertEquals(
    (await answerAction(d, 'tok', { action: 'reciprocate', answerId: UUID(4), message: 'Olur' }))
      .status,
    404,
  );
});

Deno.test('tables list', async () => {
  const { d } = deps();
  const r = await tablesAction(d, 'tok', { action: 'list' });
  assert(r.ok && (r.body.tables as unknown[]).length === 1);
  assertEquals((await tablesAction(d, 'tok', { action: 'other' })).status, 400);
});

Deno.test('preferences are saved for active accounts only (§6.6)', async () => {
  const db = new FakeDb();
  db.state = { ...db.state!, status: 'active', livenessVerified: true };
  const auth = new FakeAuth();
  auth.addUser('tok', 'user-1');
  const profileDb = new FakeProfileDb();
  const prefs = {
    ageMin: 25,
    ageMax: 35,
    distanceKm: 25,
    intents: ['long_term'],
    voiceOnly: false,
  };
  assert(
    (
      await updateProfile(
        { db, auth, profile: profileDb },
        'tok',
        { section: 'preferences', data: prefs },
        ctx,
      )
    ).ok,
  );
  assertEquals(profileDb.called('updatePreferences')[0]!.args[1], prefs);
  db.state = { ...db.state!, status: 'onboarding' };
  assertEquals(
    (
      await updateProfile(
        { db, auth, profile: profileDb },
        'tok',
        { section: 'preferences', data: prefs },
        ctx,
      )
    ).status,
    409,
  );
});
