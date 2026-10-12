#!/usr/bin/env node
/**
 * Demo people for LOCAL testing only (APP.md §0: demo data never in production).
 *
 *   node scripts/demo-people.mjs seed  --for you@example.com [--count 30]
 *   node scripts/demo-people.mjs tur   --for you@example.com   # regenerate today's Round now
 *   node scripts/demo-people.mjs chat  --for you@example.com   # demo people at your tables write a message
 *   node scripts/demo-people.mjs fun                            # give demo people a mood and a two-truths game
 *   node scripts/demo-people.mjs reply                          # demo people reciprocate answers sent to them
 *   node scripts/demo-people.mjs clean                          # delete every demo person
 *
 * `seed` creates verified, active people around the target user: most match
 * them mutually (same city, gender, age and intent filters), the rest are
 * deliberately outside the filters so the Round can be checked for leaks.
 * A few of the matching people answer the target's door question, so the
 * Answers inbox and "Karşılık ver" → table can be tried at once.
 *
 * Talks to the local stack only (`npx supabase status`); any non-local URL is refused.
 */
import { execSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';

import { createClient } from '@supabase/supabase-js';

const DEMO_DOMAIN = 'demo.nokuzo.test';
const args = process.argv.slice(2);
const command = args[0];
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

// --- Local stack only ------------------------------------------------------------------
const status = JSON.parse(
  execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
);
const apiUrl = new URL(status.API_URL);
if (!['127.0.0.1', 'localhost'].includes(apiUrl.hostname)) {
  console.error(
    `Refusing to run against ${apiUrl.host}: demo people are for the local stack only.`,
  );
  process.exit(1);
}
const db = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

// --- Deterministic randomness (same people on every run) -------------------------------------
let seed = 20261012;
const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (list) => list[Math.floor(rand() * list.length)];
const pickSome = (list, n) => [...list].sort(() => rand() - 0.5).slice(0, n);
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const WOMEN = [
  'Elif',
  'Zeynep',
  'Defne',
  'Ece',
  'Selin',
  'Melis',
  'İrem',
  'Duru',
  'Asya',
  'Ceren',
  'Naz',
  'Gizem',
  'Pelin',
  'Buse',
  'Damla',
  'Yağmur',
  'Ezgi',
  'Derya',
  'Sena',
  'Ayşe',
  'Merve',
  'Nehir',
];
const MEN = [
  'Mert',
  'Can',
  'Emre',
  'Kaan',
  'Burak',
  'Arda',
  'Deniz',
  'Onur',
  'Barış',
  'Ozan',
  'Kerem',
  'Umut',
];
const MOODS = ['coffee', 'walk', 'game_night', 'concert', 'quiet'];
// [truth, truth, lie] sets; the lie's position is shuffled when stored.
const TWO_TRUTHS = [
  ['Üç farklı ülkede yaşadım.', 'Sabah kahvesiz konuşamam.', 'Hiç uçağa binmedim.'],
  ['Bir kez maratonu bitirdim.', 'Kedimin adı Pamuk.', 'Akrebe dokunmuştum, korkmadım.'],
  ['Çocukken TRT’de bir yarışmaya çıktım.', 'Gitar çalabiliyorum.', 'Sushi’yi hayatımda tatmadım.'],
  ['Ardahan’da kar 2 metreyi gördü.', 'Bir yılda 40 kitap okudum.', 'Yüzme bilmiyorum.'],
  ['Kendi ekmeğimi kendim yapıyorum.', 'Bir konserde sahneye çıkarıldım.', 'Hiç deniz görmedim.'],
];

/** About half get this week's mood, about half the game. */
async function giveFun(userId) {
  if (rand() < 0.6)
    await must(db.rpc('srv_update_mood', { p_user_id: userId, p_mood: pick(MOODS) }), 'mood');
  if (rand() < 0.6) {
    const [a, b, lieText] = pick(TWO_TRUTHS);
    const lie = between(0, 2);
    const statements = [a, b];
    statements.splice(lie, 0, lieText);
    await must(
      db.rpc('srv_update_two_truths', { p_user_id: userId, p_statements: statements, p_lie: lie }),
      'two truths',
    );
  }
}

const ANSWERS = [
  'Kesinlikle serpme! Ama simidi de masadan eksik etmem, çay da demli olsun.',
  'Geçen hafta arkadaşımın kedisi pizzamı çaldı, hâlâ gülüyorum.',
  'Pazar sabahı sahilde yürüyüş, sonra uzun bir kahvaltı. Senin favorin ne?',
  'Bunu yüz yüze anlatmak lazım, kısa bir cevaba sığmaz :)',
  'Açık hava konseri olsun, gerisi detay. En son kimi dinledin?',
  'Mersin’de en sevdiğim yer Kızkalesi, gün batımında özellikle.',
];
const OCCUPATIONS = [
  'Mimar',
  'Öğretmen',
  'Yazılımcı',
  'Hemşire',
  'Grafik tasarımcı',
  'Veteriner',
  'Avukat',
  'Psikolog',
];
const ABOUT = [
  'Kitap, kahve ve uzun yürüyüşler. Hafta sonları genelde doğadayım.',
  'Yeni tarifler denemeyi seviyorum; mutfakta biraz dağınığım.',
  'Kamp, fotoğraf ve iyi bir sohbet. Plan yapmayı severim ama sürprizlere de açığım.',
  'Deniz kenarında büyüdüm, yüzmeden duramam.',
];

// --- Placeholder photos: generated PNGs, no real person ------------------------------------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const PALETTES = [
  ['#FFB070', '#9C2A17'],
  ['#FFC58A', '#B83A1E'],
  ['#FF9E5E', '#7A1A10'],
  ['#FF8A2A', '#3A140C'],
  ['#FFD08A', '#C2401F'],
  ['#F2662C', '#2A0F09'],
  ['#FFB48A', '#8A1E12'],
  ['#E8843C', '#4A170D'],
];
/** 864×1080 (4:5, short side ≥ 800) gradient with a light silhouette. */
function photoPng(palette) {
  const [w, h] = [864, 1080];
  const [a, b] = palette.map(hex);
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2;
      const head = (x - w / 2) ** 2 + (y - h * 0.4) ** 2 < (w * 0.17) ** 2;
      const body = ((x - w / 2) / (w * 0.33)) ** 2 + ((y - h * 0.95) / (h * 0.3)) ** 2 < 1;
      const o = y * (w * 3 + 1) + 1 + x * 3;
      for (let c = 0; c < 3; c++) {
        const base = a[c] + (b[c] - a[c]) * t;
        raw[o + c] = head || body ? Math.round(base * 0.15 + 245 * 0.85) : Math.round(base);
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Helpers ---------------------------------------------------------------------------------
const istanbulNow = () =>
  new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
/** Round date in effect now: today after 21:00 Istanbul, otherwise yesterday (same rule as SQL). */
function turDate() {
  const d = istanbulNow();
  if (d.getHours() < 21) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const birthDateFor = (age) => {
  const d = istanbulNow();
  return `${d.getFullYear() - age - 1}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`;
};
const ageOf = (birth) => {
  const b = new Date(birth);
  const n = istanbulNow();
  return (
    n.getFullYear() -
    b.getFullYear() -
    (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0)
  );
};

async function targetProfile(email) {
  if (!email) throw new Error('Use --for <email of your test account>.');
  const users = await must(db.auth.admin.listUsers({ perPage: 1000 }), 'list users');
  const user = users.users.find((u) => u.email === email);
  if (!user) throw new Error(`No account with ${email}.`);
  const p = await must(
    db.from('profiles').select('*').eq('user_id', user.id).single(),
    'target profile',
  );
  if (p.status !== 'active')
    throw new Error(`${email} has not finished sign-up yet (status ${p.status}).`);
  const prefs = await must(
    db.from('preferences').select('*').eq('profile_id', p.id).single(),
    'target preferences',
  );
  const interests = (
    await must(
      db.from('profile_interests').select('interest_id').eq('profile_id', p.id),
      'interests',
    )
  ).map((r) => r.interest_id);
  return { user, profile: p, prefs, interests };
}

async function demoUsers() {
  const users = await must(db.auth.admin.listUsers({ perPage: 1000 }), 'list users');
  return users.users.filter((u) => u.email?.endsWith(`@${DEMO_DOMAIN}`));
}

/** Regenerates the target's Round for now (removes today's batches first). */
async function refreshTur(targetId) {
  const date = turDate();
  await must(
    db.from('tur_batches').delete().eq('profile_id', targetId).eq('tur_date', date),
    'clear Round',
  );
  const batch = await must(
    db.rpc('srv_generate_tur', { p_profile_id: targetId, p_tur_date: date, p_kind: 'welcome' }),
    'generate Round',
  );
  const cards = await must(db.from('tur_cards').select('id').eq('batch_id', batch), 'cards');
  return cards.length;
}

// --- Commands ----------------------------------------------------------------------------------
async function seedPeople() {
  const target = await targetProfile(opt('for'));
  const count = Number(opt('count', '30'));
  const t = target.profile;
  const tAge = ageOf(t.birth_date);
  const bucket = { woman: 'women', man: 'men' }[t.gender] ?? 'nonbinary';
  const wantWomen = t.seeking.includes('women');
  const presets = (await must(db.from('question_presets').select('id'), 'presets')).map(
    (r) => r.id,
  );
  const allInterests = (await must(db.from('interests').select('id'), 'interests')).map(
    (r) => r.id,
  );
  const otherCities = (
    await must(db.from('cities').select('id').neq('id', t.city_id), 'cities')
  ).map((r) => r.id);
  const existing = (await demoUsers()).length;

  // ~60% match the target both ways; the rest break exactly one rule each.
  const plan = Array.from({ length: count }, (_, i) => {
    const r = i / count;
    if (r < 0.6) return 'match';
    return ['wrong_intent', 'wrong_gender', 'other_city', 'too_old'][i % 4];
  });

  const made = [];
  for (const [i, kind] of plan.entries()) {
    const n = existing + i + 1;
    const gender =
      kind === 'wrong_gender' ? (wantWomen ? 'man' : 'woman') : wantWomen ? 'woman' : 'man';
    const name = pick(gender === 'woman' ? WOMEN : MEN);
    const age =
      kind === 'too_old'
        ? Math.min(99, t.prefs?.age_max ?? target.prefs.age_max) + between(3, 8)
        : between(Math.max(18, target.prefs.age_min), Math.min(target.prefs.age_max, 99));
    const intent = kind === 'wrong_intent' ? 'long_term' : pick(target.prefs.intents);
    const email = `demo-${n}@${DEMO_DOMAIN}`;

    const created = await must(
      db.auth.admin.createUser({ email, email_confirm: true }),
      `create ${email}`,
    );
    const { id } = await must(
      db.from('profiles').select('id').eq('user_id', created.user.id).single(),
      'new profile',
    );
    const now = new Date();
    await must(
      db
        .from('profiles')
        .update({
          status: 'active',
          name,
          gender,
          seeking: [bucket],
          birth_date: birthDateFor(age),
          intent,
          tempo: pick(['meet_soon', 'chat_first', 'slow']),
          city_id: kind === 'other_city' ? pick(otherCities) : t.city_id,
          phone_verified_at: now.toISOString(),
          phone_last2: String(between(10, 99)),
          verified_at: now.toISOString(),
          onboarding_completed_at: now.toISOString(),
          last_active_at: new Date(now.getTime() - between(0, 72) * 3_600_000).toISOString(),
          reply_median_minutes: between(20, 600),
        })
        .eq('id', id),
      'profile',
    );
    // Their own filters accept the target (unless this person is meant to stay out).
    await must(
      db.from('preferences').insert({
        profile_id: id,
        age_min: Math.max(18, Math.min(age, tAge) - 4),
        age_max: Math.min(99, Math.max(age, tAge) + 4),
        distance_km: null,
        intents: kind === 'wrong_intent' ? ['long_term'] : [...new Set([intent, t.intent])],
        voice_only: false,
      }),
      'preferences',
    );
    // People meant to match also meet the target's must-haves (§6.4), which are strict filters.
    const mustHaves =
      kind === 'match'
        ? Object.fromEntries(
            (t.dealbreakers ?? []).map((rule) => [
              rule.field,
              ['pets', 'languages'].includes(rule.field)
                ? [pick(rule.accepted)]
                : pick(rule.accepted),
            ]),
          )
        : {};
    await must(
      db.from('profile_details').insert({
        profile_id: id,
        data: {
          height: gender === 'woman' ? between(155, 178) : between(168, 192),
          occupation: pick(OCCUPATIONS),
          smoking: pick(['never', 'social', 'never', 'trying_to_quit']),
          alcohol: pick(['never', 'rarely', 'socially']),
          sports: pick(['sometimes', 'regularly', 'never']),
          first_date: pick(['coffee', 'walk', 'dinner', 'art_music']),
          wants_children: pick(['want', 'not_sure', 'maybe', 'dont_want']),
          about: pick(ABOUT),
          ...mustHaves,
        },
      }),
      'details',
    );
    await must(
      db.from('door_questions').insert({ profile_id: id, preset_id: pick(presets) }),
      'door question',
    );
    await giveFun(created.user.id);
    // Some shared interests with the target so "Neden bu kişi?" has something to say.
    const interests = [
      ...new Set([...pickSome(target.interests, between(0, 2)), ...pickSome(allInterests, 5)]),
    ].slice(0, 8);
    await must(
      db
        .from('profile_interests')
        .insert(interests.map((interest_id) => ({ profile_id: id, interest_id }))),
      'interests',
    );
    for (let k = 0; k < 3; k++) {
      const photoId = crypto.randomUUID();
      const path = `${id}/photos/${photoId}.png`;
      await must(
        db.storage
          .from('public-photos')
          .upload(path, photoPng(PALETTES[(n + k) % PALETTES.length]), {
            contentType: 'image/png',
          }),
        'photo upload',
      );
      await must(
        db.from('profile_photos').insert({
          id: photoId,
          profile_id: id,
          position: k,
          status: 'approved',
          public_path: path,
          face_matched: k === 0,
          width: 864,
          height: 1080,
        }),
        'photo row',
      );
    }
    made.push({ id, userId: created.user.id, name, kind });
    process.stdout.write(kind === 'match' ? '+' : '·');
  }
  console.log(
    `\n${made.length} demo people added (${made.filter((m) => m.kind === 'match').length} match ${t.name}).`,
  );

  // A few matching people answer the target first (they need the target in their own Round).
  const date = turDate();
  let answered = 0;
  for (const m of made.filter((x) => x.kind === 'match').slice(0, 4)) {
    await must(
      db.rpc('srv_generate_tur', { p_profile_id: m.id, p_tur_date: date, p_kind: 'welcome' }),
      'demo Round',
    );
    const r = await must(
      db.rpc('srv_answer_create', {
        p_user_id: m.userId,
        p_candidate: t.id,
        p_text: ANSWERS[answered % ANSWERS.length],
        p_voice_path: null,
        p_voice_ms: null,
      }),
      'demo answer',
    );
    if (r?.result === 'ok') answered++;
  }
  console.log(`${answered} of them answered ${t.name}'s door question (see Cevaplar).`);
  console.log(`${t.name}'s Round now has ${await refreshTur(t.id)} cards.`);
}

const CHAT_LINES = [
  'Bu arada hafta sonu ne yapıyorsun?',
  'Az önce aklıma geldin, o kahve yeri gerçekten güzel miydi?',
  'Benim günüm yoğun geçti, seninki nasıldı?',
  'Bir film önerin var mı? Bu akşam boşum.',
  'Haha, buna gerçekten güldüm 😄',
];

/** Each demo person with an open table with the target writes one message (Realtime check). */
async function chat() {
  const target = await targetProfile(opt('for'));
  const me = target.profile.id;
  const tables = await must(
    db
      .from('tables')
      .select('id, a_id, b_id')
      .eq('status', 'active')
      .or(`a_id.eq.${me},b_id.eq.${me}`),
    'tables',
  );
  let n = 0;
  for (const t of tables) {
    const other = t.a_id === me ? t.b_id : t.a_id;
    const { user_id: userId } = await must(
      db.from('profiles').select('user_id').eq('id', other).single(),
      'profile',
    );
    const r = await must(
      db.rpc('srv_message_send', {
        p_user_id: userId,
        p_table_id: t.id,
        p_client_id: crypto.randomUUID(),
        p_kind: 'text',
        p_body: pick(CHAT_LINES),
      }),
      'send',
    );
    if (r.result === 'ok') n += 1;
  }
  console.log(`${n} demo people wrote at ${target.profile.name}'s tables.`);
}

async function reply() {
  const demos = await demoUsers();
  const byProfile = new Map();
  for (const u of demos) {
    const p = await must(
      db.from('profiles').select('id, name').eq('user_id', u.id).single(),
      'demo profile',
    );
    byProfile.set(p.id, { userId: u.id, name: p.name });
  }
  const pending = await must(
    db
      .from('answers')
      .select('id, to_id')
      .eq('status', 'pending')
      .in('to_id', [...byProfile.keys()]),
    'answers',
  );
  for (const a of pending) {
    const demo = byProfile.get(a.to_id);
    const r = await must(
      db.rpc('srv_answer_respond', {
        p_user_id: demo.userId,
        p_answer_id: a.id,
        p_action: 'reciprocate',
        p_message: 'Cevabına bayıldım! Sen anlat bakalım, hafta sonu ne yapıyorsun?',
      }),
      'reciprocate',
    );
    console.log(`${demo.name} reciprocated → table ${r.tableStatus}`);
  }
  if (!pending.length)
    console.log('No answers waiting for demo people. Answer someone in the Round first.');
}

async function clean() {
  const demos = await demoUsers();
  for (const u of demos) {
    const p = await must(
      db.from('profiles').select('id').eq('user_id', u.id).maybeSingle(),
      'demo profile',
    );
    if (p) {
      const files = await must(
        db.storage.from('public-photos').list(`${p.id}/photos`),
        'list photos',
      );
      if (files.length)
        await must(
          db.storage.from('public-photos').remove(files.map((f) => `${p.id}/photos/${f.name}`)),
          'remove photos',
        );
    }
    await must(db.auth.admin.deleteUser(u.id), `delete ${u.email}`);
  }
  console.log(`${demos.length} demo people deleted.`);
}

try {
  if (command === 'seed') await seedPeople();
  else if (command === 'tur') {
    const t = await targetProfile(opt('for'));
    console.log(`${t.profile.name}'s Round now has ${await refreshTur(t.profile.id)} cards.`);
  } else if (command === 'reply') await reply();
  else if (command === 'chat') await chat();
  else if (command === 'clean') await clean();
  else if (command === 'fun') {
    const demos = await demoUsers();
    for (const u of demos) await giveFun(u.id);
    console.log(`${demos.length} demo people got a mood and/or a game.`);
  } else {
    console.log(
      'Usage: node scripts/demo-people.mjs <seed|tur|fun|chat|reply|clean> [--for email] [--count n]',
    );
    process.exit(1);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
