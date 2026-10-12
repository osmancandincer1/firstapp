import { assert, assertEquals } from '@std/assert';
import { identifierHash } from '../_shared/crypto.ts';
import {
  photoAction,
  SIGNED_URL_SECONDS,
  viewOwnProfile,
  voiceAction,
  type MediaDeps,
} from '../_shared/services/media.ts';
import { updateProfile, type ProfileDeps } from '../_shared/services/profile.ts';
import type { ImageModeration } from '../_shared/types.ts';
import { ctx, FakeAuth, FakeDb, FakeLiveness, FakeProfileDb, FakeStore, SECRET } from './fakes.ts';

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

class FakeModeration implements ImageModeration {
  signals = {
    labels: [] as { name: string; parent: string | null; confidence: number }[],
    texts: [] as string[],
    faces: [{ ageLow: 26, ageHigh: 33 }],
  };
  analyze() {
    return Promise.resolve(this.signals);
  }
}

function profileDeps(state: Partial<NonNullable<FakeDb['state']>> = {}) {
  const db = new FakeDb();
  db.state = {
    ...db.state!,
    phoneVerified: true,
    birthDate: '1990-01-01',
    consentsComplete: true,
    livenessVerified: true,
    ...state,
  };
  const auth = new FakeAuth();
  auth.addUser('tok', 'user-1');
  const profile = new FakeProfileDb();
  const d: ProfileDeps = { db, profile, auth };
  return { d, db, profile };
}

// --- profile-update -------------------------------------------------------------

Deno.test('profile-update: basics are stored and completion is re-checked', async () => {
  const { d, profile } = profileDeps({ livenessVerified: false });
  const r = await updateProfile(
    d,
    'tok',
    {
      section: 'basics',
      data: { name: ' Ece ', gender: 'woman', showGender: true, seeking: ['men'] },
    },
    ctx,
  );
  assertEquals(r, { ok: true, status: 200, body: { ok: true, status: 'onboarding' } });
  assertEquals((profile.called('updateBasics')[0]!.args[1] as { name: string }).name, 'Ece');
  assertEquals(profile.called('tryCompleteOnboarding').length, 1);
});

Deno.test('profile-update: step order is enforced on the server', async () => {
  const { d } = profileDeps({ consentsComplete: false, livenessVerified: false });
  const basics = {
    section: 'basics',
    data: { name: 'Ece', gender: 'woman', showGender: true, seeking: ['men'] },
  };
  assertEquals((await updateProfile(d, 'tok', basics, ctx)).status, 409);
  const x = profileDeps({ livenessVerified: false });
  assertEquals(
    (
      await updateProfile(
        x.d,
        'tok',
        { section: 'intent', data: { intent: 'unsure', tempo: 'slow', dealbreakers: [] } },
        ctx,
      )
    ).status,
    409,
  );
  assertEquals((await updateProfile(x.d, null, basics, ctx)).status, 401);
  assertEquals((await updateProfile(x.d, 'tok', { section: 'nope' }, ctx)).status, 400);
});

Deno.test(
  'profile-update: contact details in a name or door question are refused with the field (§7.2)',
  async () => {
    const { d, profile } = profileDeps();
    assertEquals(
      await updateProfile(
        d,
        'tok',
        { section: 'door_question', data: { customText: 'Instagramdan yaz: eceyilmaz' } },
        ctx,
      ),
      {
        ok: false,
        status: 400,
        error: 'text_blocked',
        details: { field: 'customText', reason: 'contact_info' },
      },
    );
    assertEquals(profile.called('setDoorQuestion').length, 0);
  },
);

Deno.test('PRO-08: text needing review is held and the published value stays', async () => {
  const { d, profile } = profileDeps();
  const r = await updateProfile(
    d,
    'tok',
    {
      section: 'details',
      data: { about: 'Saatlik ücret konuşuruz', occupation: 'Mimar', height: 170 },
    },
    ctx,
  );
  assertEquals(r.ok && r.body.pending, true);
  assertEquals(profile.called('addPendingEdit')[0]!.args.slice(1), [
    'details.about',
    'Saatlik ücret konuşuruz',
    'commercial',
  ]);
  assertEquals(profile.called('updateDetails')[0]!.args[1], { occupation: 'Mimar', height: 170 });
});

Deno.test('profile-update: change limits and invalid choices', async () => {
  const { d, profile } = profileDeps();
  profile.results.updateBasics = 'name_locked';
  const basics = {
    section: 'basics',
    data: { name: 'Ece', gender: 'woman', showGender: true, seeking: ['men'] },
  };
  assertEquals(await updateProfile(d, 'tok', basics, ctx), {
    ok: false,
    status: 429,
    error: 'change_limited',
  });
  profile.results.setDoorQuestion = 'locked';
  assertEquals(
    (await updateProfile(d, 'tok', { section: 'door_question', data: { presetId: UUID(9) } }, ctx))
      .status,
    429,
  );
  profile.results.setDoorQuestion = 'invalid_preset';
  assertEquals(
    (await updateProfile(d, 'tok', { section: 'door_question', data: { presetId: UUID(9) } }, ctx))
      .status,
    400,
  );
  profile.results.setInterests = 'invalid';
  const ids = [1, 2, 3, 4, 5].map(UUID);
  assertEquals(
    (await updateProfile(d, 'tok', { section: 'interests', data: { ids } }, ctx)).status,
    400,
  );
});

Deno.test('profile-update: coordinates are rounded to ~1 km before storage (§13.6)', async () => {
  const { d, profile } = profileDeps();
  await updateProfile(
    d,
    'tok',
    { section: 'location', data: { cityId: 34, coords: { lat: 41.008237, lng: 28.978358 } } },
    ctx,
  );
  assertEquals(profile.called('setLocation')[0]!.args.slice(1), [34, null, 41.01, 28.98]);
  profile.results.setLocation = 'invalid_district';
  assertEquals(
    (
      await updateProfile(
        d,
        'tok',
        { section: 'location', data: { cityId: 34, districtId: 5 } },
        ctx,
      )
    ).status,
    400,
  );
});

Deno.test('profile-update: intent card and interests', async () => {
  const { d, profile } = profileDeps();
  assert(
    (
      await updateProfile(
        d,
        'tok',
        {
          section: 'intent',
          data: {
            intent: 'long_term',
            tempo: 'chat_first',
            dealbreakers: [{ field: 'smoking', accepted: ['never'] }],
          },
        },
        ctx,
      )
    ).ok,
  );
  assertEquals(profile.called('updateIntent')[0]!.args.slice(1, 3), ['long_term', 'chat_first']);
  assert(
    (
      await updateProfile(
        d,
        'tok',
        { section: 'interests', data: { ids: [1, 2, 3, 4, 5].map(UUID) } },
        ctx,
      )
    ).ok,
  );
});

// --- photos -----------------------------------------------------------------------

function mediaDeps(withModeration = true) {
  const x = profileDeps();
  const store = new FakeStore();
  const moderation = new FakeModeration();
  const faces = new FakeLiveness();
  const d: MediaDeps = {
    env: { hmacSecret: SECRET },
    db: x.db,
    profile: x.profile,
    auth: (x.d as ProfileDeps).auth,
    store,
    moderation: withModeration ? moderation : null,
    faces: withModeration ? faces : null,
  };
  return { ...x, d, store, moderation, faces };
}

const enc = new TextEncoder();
function jpeg(width: number, height: number, exif = 'Exif\0\0GPSLatitude') {
  const seg = (m: number, p: Uint8Array) => [
    0xff,
    m,
    (p.length + 2) >> 8,
    (p.length + 2) & 255,
    ...p,
  ];
  return new Uint8Array([
    0xff,
    0xd8,
    ...seg(0xe1, enc.encode(exif)),
    ...seg(
      0xc0,
      new Uint8Array([8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]),
    ),
    ...seg(0xda, new Uint8Array([1, 1, 0, 0, 0x3f, 0])),
    0x11,
    0x22,
    0xff,
    0xd9,
  ]);
}

Deno.test('photo upload: a slot and a one-time quarantine upload URL', async () => {
  const { d, profile } = mediaDeps();
  assertEquals(await photoAction(d, 'tok', { action: 'upload_url' }), {
    ok: true,
    status: 200,
    body: {
      ok: true,
      id: UUID(1),
      bucket: 'quarantine',
      path: 'p1/photos/x.jpg',
      token: 'upload-token',
    },
  });
  profile.results.photoCreate = null;
  assertEquals(
    (await photoAction(d, 'tok', { action: 'upload_url' })).ok ? 'ok' : 'limit',
    'limit',
  );
});

Deno.test(
  'photo process: a clean photo of the user is published without metadata (PRO-02, VER-02)',
  async () => {
    const { d, db, profile, store, faces } = mediaDeps();
    store.objects.set('quarantine/p1/photos/x.jpg', jpeg(1200, 1500));
    faces.matches = ['face-1'];
    db.faceOwnerResult = ['self'];
    const r = await photoAction(d, 'tok', { action: 'process', photoId: UUID(1) });
    assertEquals(r, { ok: true, status: 200, body: { ok: true, status: 'approved' } });
    const published = store.objects.get('public-photos/p1/photos/x.jpg')!;
    assert(
      published && !new TextDecoder('latin1').decode(published).includes('GPS'),
      'no EXIF in the published copy',
    );
    assert(!store.objects.has('quarantine/p1/photos/x.jpg'), 'the quarantine copy is removed');
    const fin = profile.called('photoFinish')[0]!.args[0] as Record<string, unknown>;
    assertEquals(
      [fin.status, fin.faceMatched, fin.publicPath, fin.width],
      ['approved', true, 'p1/photos/x.jpg', 1200],
    );
    assertEquals(db.called('faceOwners')[0]!.args[1], [
      await identifierHash(SECRET, 'face', 'face-1'),
    ]);
  },
);

Deno.test(
  'photo process: a main photo of someone else is rejected with a reason (§6.4)',
  async () => {
    const { d, store, profile } = mediaDeps();
    store.objects.set('quarantine/p1/photos/x.jpg', jpeg(1200, 1500));
    const r = await photoAction(d, 'tok', { action: 'process', photoId: UUID(1) });
    assertEquals(r.ok && r.body, { ok: true, status: 'rejected', reason: 'not_you' });
    assertEquals(store.objects.size, 0, 'nothing is published or kept');
    assertEquals(
      (profile.called('photoFinish')[0]!.args[0] as { reason: string }).reason,
      'not_you',
    );
  },
);

Deno.test(
  'photo process: explicit content and bad files are rejected; minors go to review',
  async () => {
    const a = mediaDeps();
    a.store.objects.set('quarantine/p1/photos/x.jpg', jpeg(1200, 1500));
    a.moderation.signals.labels = [{ name: 'Explicit Nudity', parent: null, confidence: 97 }];
    const r1 = await photoAction(a.d, 'tok', { action: 'process', photoId: UUID(1) });
    assertEquals(r1.ok && r1.body, { ok: true, status: 'rejected', reason: 'explicit' });

    const b = mediaDeps();
    b.store.objects.set('quarantine/p1/photos/x.jpg', jpeg(600, 400));
    const r2 = await photoAction(b.d, 'tok', { action: 'process', photoId: UUID(1) });
    assertEquals(r2.ok && r2.body, { ok: true, status: 'rejected', reason: 'too_small' });

    const c = mediaDeps();
    c.store.objects.set('quarantine/p1/photos/x.jpg', jpeg(1200, 1500));
    c.moderation.signals.faces = [{ ageLow: 8, ageHigh: 12 }];
    const r3 = await photoAction(c.d, 'tok', { action: 'process', photoId: UUID(1) });
    assertEquals(r3.ok && r3.body, { ok: true, status: 'review', reason: 'possible_minor' });
    assert(c.store.objects.has('quarantine/p1/photos/x.jpg'), 'kept in quarantine for a human');
    assert(
      !c.store.objects.has('public-photos/p1/photos/x.jpg'),
      'PRO-01: never published while in review',
    );
  },
);

Deno.test(
  'photo process: without a moderation provider nothing is published automatically (§0.9)',
  async () => {
    const { d, store } = mediaDeps(false);
    store.objects.set('quarantine/p1/photos/x.jpg', jpeg(1200, 1500));
    const r = await photoAction(d, 'tok', { action: 'process', photoId: UUID(1) });
    assertEquals(r.ok && r.body, { ok: true, status: 'review', reason: 'under_review' });
    assert(
      !new TextDecoder('latin1')
        .decode(store.objects.get('quarantine/p1/photos/x.jpg')!)
        .includes('GPS'),
      'even the copy waiting for review has no metadata',
    );
  },
);

Deno.test('photo process: only the owner’s pending photo, and only after liveness', async () => {
  const { d, profile } = mediaDeps();
  profile.results.photoGet = null;
  assertEquals((await photoAction(d, 'tok', { action: 'process', photoId: UUID(1) })).status, 404);
  const x = mediaDeps();
  x.db.state = { ...x.db.state!, livenessVerified: false };
  assertEquals((await photoAction(x.d, 'tok', { action: 'upload_url' })).status, 409);
  assertEquals((await photoAction(x.d, null, { action: 'upload_url' })).status, 401);
});

Deno.test('photo reorder, caption and delete', async () => {
  const { d, profile, store } = mediaDeps();
  assert((await photoAction(d, 'tok', { action: 'reorder', ids: [UUID(1), UUID(3)] })).ok);
  profile.results.photoReorder = 'invalid';
  assertEquals((await photoAction(d, 'tok', { action: 'reorder', ids: [UUID(1)] })).status, 400);

  assertEquals(
    await photoAction(d, 'tok', { action: 'caption', photoId: UUID(1), caption: 'snap: ece' }),
    {
      ok: false,
      status: 400,
      error: 'text_blocked',
      details: { field: 'caption', reason: 'contact_info' },
    },
  );
  assert(
    (await photoAction(d, 'tok', { action: 'caption', photoId: UUID(1), caption: 'Kapadokya' })).ok,
  );
  assert((await photoAction(d, 'tok', { action: 'caption', photoId: UUID(1), caption: '' })).ok);
  assertEquals(
    profile.called('photoCaption').map((c) => c.args[2]),
    ['Kapadokya', null],
  );

  assert((await photoAction(d, 'tok', { action: 'delete', photoId: UUID(1) })).ok);
  assertEquals(store.removed, ['quarantine/p1/photos/x.jpg', 'public-photos/p1/photos/x.jpg']);
  profile.results.photoDelete = null;
  assertEquals((await photoAction(d, 'tok', { action: 'delete', photoId: UUID(1) })).status, 404);
});

// --- voice ------------------------------------------------------------------------

function m4a(ms: number) {
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

Deno.test('voice card: 5–20 seconds are published, others rejected (§6.4)', async () => {
  const ok = mediaDeps();
  ok.store.objects.set('quarantine/p1/voice/v.m4a', m4a(12_000));
  ok.profile.results.voiceFinish = ['p1/voice/old.m4a'];
  const r = await voiceAction(ok.d, 'tok', { action: 'process', voiceId: UUID(2) });
  assertEquals(r.ok && r.body, { ok: true, status: 'approved' });
  assert(ok.store.objects.has('public-voice/p1/voice/v.m4a'));
  assert(
    ok.store.removed.includes('public-voice/p1/voice/old.m4a'),
    'the previous card is removed',
  );

  for (const ms of [3_000, 25_000]) {
    const x = mediaDeps();
    x.store.objects.set('quarantine/p1/voice/v.m4a', m4a(ms));
    const rr = await voiceAction(x.d, 'tok', { action: 'process', voiceId: UUID(2) });
    assertEquals(rr.ok && rr.body, { ok: true, status: 'rejected', reason: 'duration' });
    assertEquals(x.store.objects.size, 0);
  }
  const bad = mediaDeps();
  bad.store.objects.set('quarantine/p1/voice/v.m4a', enc.encode('not audio'));
  const rb = await voiceAction(bad.d, 'tok', { action: 'process', voiceId: UUID(2) });
  assertEquals(rb.ok && rb.body, { ok: true, status: 'rejected', reason: 'unsupported_type' });
});

Deno.test('voice card: upload URL needs a valid prompt; delete removes files', async () => {
  const { d, profile, store } = mediaDeps();
  assert((await voiceAction(d, 'tok', { action: 'upload_url', promptId: UUID(7) })).ok);
  profile.results.voiceCreate = null;
  assertEquals(
    (await voiceAction(d, 'tok', { action: 'upload_url', promptId: UUID(7) })).status,
    400,
  );
  assert((await voiceAction(d, 'tok', { action: 'delete' })).ok);
  assertEquals(store.removed, ['quarantine/p1/voice/v.m4a', 'public-voice/p1/voice/v.m4a']);
});

// --- preview ------------------------------------------------------------------------

Deno.test(
  'profile-view: the public projection plus short-lived URLs for own media (PRO-05)',
  async () => {
    const { d, store } = mediaDeps();
    const r = await viewOwnProfile(d, 'tok');
    assertEquals(r.ok && r.body.preview, { name: 'Ece', age: 30 });
    assertEquals(Object.keys(r.ok ? r.body.media : {}).sort(), [UUID(1), UUID(3)]);
    assert(store.signed.every((s) => s.ttl === SIGNED_URL_SECONDS && SIGNED_URL_SECONDS <= 900));
    assertEquals((await viewOwnProfile(d, null)).status, 401);
  },
);

Deno.test(
  'profile-update: remaining paths (held basics, blocked details, missing profile)',
  async () => {
    const { d, profile } = profileDeps();
    const held = await updateProfile(
      d,
      'tok',
      {
        section: 'basics',
        data: {
          name: 'Ücretli',
          gender: 'self_described',
          genderCustom: 'Akışkan',
          showGender: false,
          seeking: ['men'],
        },
      },
      ctx,
    );
    assertEquals(held.ok && held.body.pending, true);
    assertEquals(profile.called('updateBasics').length, 0, 'held name is not published (PRO-08)');

    assertEquals(
      await updateProfile(d, 'tok', { section: 'details', data: { about: 'siktir' } }, ctx),
      {
        ok: false,
        status: 400,
        error: 'text_blocked',
        details: { field: 'about', reason: 'profanity' },
      },
    );
    assertEquals(
      await updateProfile(
        d,
        'tok',
        { section: 'details', data: { music: ['wp: 05321234567'] } },
        ctx,
      ),
      {
        ok: false,
        status: 400,
        error: 'text_blocked',
        details: { field: 'music', reason: 'contact_info' },
      },
    );

    for (const [method, section] of [
      [
        'updateBasics',
        {
          section: 'basics',
          data: { name: 'Ece', gender: 'woman', showGender: true, seeking: ['men'] },
        },
      ],
      ['setDoorQuestion', { section: 'door_question', data: { presetId: UUID(1) } }],
      ['setInterests', { section: 'interests', data: { ids: [1, 2, 3, 4, 5].map(UUID) } }],
      ['setLocation', { section: 'location', data: { cityId: 34 } }],
    ] as const) {
      const x = profileDeps();
      (x.profile.results as Record<string, unknown>)[method] = 'not_found';
      assertEquals((await updateProfile(x.d, 'tok', section, ctx)).status, 404, method);
    }
    const banned = profileDeps({ status: 'banned' });
    assertEquals(
      (await updateProfile(banned.d, 'tok', { section: 'location', data: { cityId: 34 } }, ctx))
        .status,
      409,
    );
  },
);

// --- mood and "İki doğru, bir yalan" (D-066) -------------------------------------------

Deno.test('profile-update: a mood is set and cleared; unknown moods are refused', async () => {
  const { d, profile } = profileDeps();
  const set = await updateProfile(d, 'tok', { section: 'mood', data: { mood: 'walk' } }, ctx);
  assertEquals(set, { ok: true, status: 200, body: { ok: true } });
  await updateProfile(d, 'tok', { section: 'mood', data: { mood: null } }, ctx);
  assertEquals(
    profile.called('updateMood').map((c) => c.args[1]),
    ['walk', null],
  );
  const bad = await updateProfile(d, 'tok', { section: 'mood', data: { mood: 'party' } }, ctx);
  assertEquals(bad.status, 400);
});

Deno.test('profile-update: two truths one lie is checked, moderated and removable', async () => {
  const statements = ['Hiç deniz görmedim.', 'Üç kez Kars’a gittim.', 'Fotoğrafım dergide çıktı.'];
  const { d, profile } = profileDeps();
  const r = await updateProfile(
    d,
    'tok',
    { section: 'two_truths', data: { statements, lie: 2 } },
    ctx,
  );
  assertEquals(r.status, 200);
  assertEquals(profile.called('updateTwoTruths')[0]!.args.slice(1), [statements, 2]);

  for (const data of [
    { statements: statements.slice(0, 2), lie: 0 },
    { statements: ['kısa', ...statements.slice(1)], lie: 0 },
    { statements, lie: 3 },
    { statements: [statements[0], statements[0], statements[1]], lie: 0 },
  ]) {
    assertEquals((await updateProfile(d, 'tok', { section: 'two_truths', data }, ctx)).status, 400);
  }

  const contact = await updateProfile(
    d,
    'tok',
    {
      section: 'two_truths',
      data: { statements: [statements[0], 'Instagram: @ece_kars_99', statements[2]], lie: 1 },
    },
    ctx,
  );
  assertEquals(contact.status, 400);
  assert(!contact.ok && contact.error === 'text_blocked');
  assertEquals(profile.called('updateTwoTruths').length, 1);

  await updateProfile(d, 'tok', { section: 'two_truths', data: { statements: null } }, ctx);
  assertEquals(profile.called('updateTwoTruths')[1]!.args.slice(1), [null, null]);
});
