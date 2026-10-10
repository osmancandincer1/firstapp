import { assert, assertEquals, assertRejects, assertThrows } from '@std/assert';
import { Webhook } from 'standardwebhooks';
import { ConfigError, parseServerEnv } from '../_shared/env.ts';
import { beforeUserCreated, GENERIC_REFUSAL } from '../_shared/hook.ts';
import { bearerToken, clientIp, handler } from '../_shared/http.ts';
import { AwsLiveness, MockLiveness } from '../_shared/providers/faces.ts';
import {
  LogEmail,
  LogSms,
  mapTwilioLineType,
  NoLookup,
  ProviderError,
  ResendEmail,
  TwilioLookup,
  TwilioSms,
} from '../_shared/providers/messaging.ts';
import { fail, ok } from '../_shared/types.ts';
import { FakeDb, hashOf, SECRET } from './fakes.ts';

// --- env ---------------------------------------------------------------------
const base = {
  APP_ENV: 'local',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  HASH_HMAC_SECRET: SECRET,
};

Deno.test('env: services without keys are null (NEEDS_SETUP), never faked', () => {
  const e = parseServerEnv({
    ...base,
    EMAIL_PROVIDER: 'resend',
    SMS_PROVIDER: 'twilio',
    LIVENESS_PROVIDER: 'aws',
  });
  assertEquals([e.email, e.sms, e.liveness, e.authHookSecret], [null, null, null, null]);
});

Deno.test('env: development stand-ins only work in local', () => {
  const local = parseServerEnv({
    ...base,
    EMAIL_PROVIDER: 'log',
    SMS_PROVIDER: 'log',
    LIVENESS_PROVIDER: 'mock',
  });
  assertEquals(
    [local.email?.provider, local.sms?.provider, local.liveness?.provider],
    ['log', 'log', 'mock'],
  );
  const devOnly: [string, string][] = [
    ['EMAIL_PROVIDER', 'log'],
    ['SMS_PROVIDER', 'log'],
    ['LIVENESS_PROVIDER', 'mock'],
  ];
  for (const [k, v] of devOnly) {
    for (const appEnv of ['staging', 'production']) {
      assertThrows(() => parseServerEnv({ ...base, APP_ENV: appEnv, [k]: v }), ConfigError);
    }
  }
});

Deno.test('env: real providers are configured from their keys', () => {
  const e = parseServerEnv({
    ...base,
    APP_ENV: 'production',
    EMAIL_PROVIDER: 'resend',
    EMAIL_API_KEY: 're_x',
    EMAIL_FROM: 'Nokuzo <no-reply@nokuzo.com>',
    SMS_PROVIDER: 'twilio',
    SMS_API_KEY: 'AC1:tok',
    SMS_SENDER_ID: 'MG1',
    LIVENESS_PROVIDER: 'aws',
    AWS_ACCESS_KEY_ID: 'a',
    AWS_SECRET_ACCESS_KEY: 's',
    AWS_REGION: 'eu-central-1',
    REKOGNITION_COLLECTION_ID: 'faces',
  });
  assertEquals(e.sms, { provider: 'twilio', accountSid: 'AC1', authToken: 'tok', senderId: 'MG1' });
  assertEquals(e.liveness?.provider, 'aws');
  assertEquals(e.email?.provider, 'resend');
  assertThrows(() =>
    parseServerEnv({ ...base, SMS_PROVIDER: 'twilio', SMS_API_KEY: 'nocolon', SMS_SENDER_ID: 'x' }),
  );
});

Deno.test('env: a short or missing HMAC secret is refused', () => {
  assertThrows(() => parseServerEnv({ ...base, HASH_HMAC_SECRET: 'short' }));
  assertThrows(() => parseServerEnv({ ...base, HASH_HMAC_SECRET: '' }));
});

// --- http ----------------------------------------------------------------------
const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('http://f', { method: 'POST', body, headers });

Deno.test('http: method, JSON and error shapes', async () => {
  const h = handler(() =>
    Promise.resolve(fail(429, 'rate_limited', new Date('2026-10-11T13:00:00Z'))),
  );
  assertEquals((await h(new Request('http://f'))).status, 405);
  assertEquals(await (await h(post('{nope'))).json(), { error: 'invalid_input' });
  const r = await h(post('{}'));
  assertEquals(
    [r.status, await r.json()],
    [429, { error: 'rate_limited', retryAt: '2026-10-11T13:00:00.000Z' }],
  );
  assertEquals(r.headers.get('cache-control'), 'no-store');
});

Deno.test('http: unexpected errors become a bare 500 without details', async () => {
  const reports: string[] = [];
  const h = handler(() => Promise.reject(new Error('db down')), { report: (m) => reports.push(m) });
  const r = await h(post('{"email":"secret@example.com"}'));
  assertEquals([r.status, await r.json()], [500, { error: 'internal' }]);
  assert(reports[0]!.includes('db down') && !reports[0]!.includes('secret@example.com'));
});

Deno.test('http: responses are padded to the minimum duration', async () => {
  let clock = 1000;
  const slept: number[] = [];
  const h = handler(
    () => {
      clock += 120;
      return Promise.resolve(ok({ ok: true }));
    },
    { minDurationMs: 700, now: () => clock, sleep: (ms) => (slept.push(ms), Promise.resolve()) },
  );
  await h(post('{}'));
  assertEquals(slept, [580]);
});

Deno.test('http: token and client IP extraction', () => {
  assertEquals(bearerToken(post('{}', { Authorization: 'Bearer abc.def' })), 'abc.def');
  assertEquals(bearerToken(post('{}')), null);
  assertEquals(clientIp(post('{}', { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })), '1.2.3.4');
  assertEquals(clientIp(post('{}', { 'cf-connecting-ip': '5.6.7.8' })), '5.6.7.8');
  assertEquals(clientIp(post('{}')), 'unknown');
});

// --- providers ---------------------------------------------------------------------
function recordingFetch(status = 200, json: unknown = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = ((url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(json), { status }));
  }) as typeof fetch;
  return { f, calls };
}

Deno.test('Resend: posts the message and hides response bodies on failure', async () => {
  const { f, calls } = recordingFetch();
  await new ResendEmail('re_key', 'Nokuzo <a@b.co>', f).send('x@y.co', 'Konu', 'Metin');
  assertEquals(calls[0]!.url, 'https://api.resend.com/emails');
  assertEquals(JSON.parse(calls[0]!.init.body as string), {
    from: 'Nokuzo <a@b.co>',
    to: ['x@y.co'],
    subject: 'Konu',
    text: 'Metin',
  });
  const bad = recordingFetch(422, { message: 'x@y.co is invalid' });
  const err = await assertRejects(
    () => new ResendEmail('k', 'f', bad.f).send('x@y.co', 's', 't'),
    ProviderError,
  );
  assert(!err.message.includes('x@y.co'));
});

Deno.test('Twilio SMS: uses a Messaging Service or a sender, with basic auth', async () => {
  const a = recordingFetch(201);
  await new TwilioSms('AC1', 'tok', 'MG123', a.f).send('+905321234567', 'kod');
  const form = new URLSearchParams(a.calls[0]!.init.body as string);
  assertEquals(
    [form.get('To'), form.get('MessagingServiceSid'), form.get('From')],
    ['+905321234567', 'MG123', null],
  );
  assertEquals(
    (a.calls[0]!.init.headers as Record<string, string>).Authorization,
    `Basic ${btoa('AC1:tok')}`,
  );
  const b = recordingFetch(201);
  await new TwilioSms('AC1', 'tok', 'NOKUZO', b.f).send('+905321234567', 'kod');
  assertEquals(new URLSearchParams(b.calls[0]!.init.body as string).get('From'), 'NOKUZO');
  await assertRejects(
    () => new TwilioSms('AC1', 'tok', 'X', recordingFetch(400).f).send('+90', 't'),
    ProviderError,
  );
});

Deno.test('Twilio Lookup: line types map to policy categories; failures are unknown', async () => {
  assertEquals(
    ['mobile', 'landline', 'fixedVoip', 'nonFixedVoip', 'tollFree', 'unknown', null].map(
      mapTwilioLineType,
    ),
    ['mobile', 'landline', 'voip', 'voip', 'other', 'unknown', 'unknown'],
  );
  const okLookup = recordingFetch(200, { line_type_intelligence: { type: 'nonFixedVoip' } });
  assertEquals(await new TwilioLookup('AC1', 'tok', okLookup.f).lineType('+905321234567'), 'voip');
  assert(okLookup.calls[0]!.url.includes('Fields=line_type_intelligence'));
  assertEquals(
    await new TwilioLookup('AC1', 'tok', recordingFetch(500).f).lineType('+90'),
    'unknown',
  );
  assertEquals(await new NoLookup().lineType(), 'unknown');
});

Deno.test('log senders print instead of sending', async () => {
  const lines: string[] = [];
  await new LogEmail((l) => lines.push(l)).send('a@b.co', 'S', 'T');
  await new LogSms((l) => lines.push(l)).send('+90', 'T');
  assertEquals(lines.length, 2);
});

Deno.test('AWS liveness: maps session results, searches, ages and indexing', async () => {
  const replies: Record<string, unknown> = {
    CreateFaceLivenessSessionCommand: { SessionId: 's-1' },
    GetFaceLivenessSessionResultsCommand: {
      Status: 'SUCCEEDED',
      Confidence: 97.1,
      ReferenceImage: { Bytes: new Uint8Array([9]) },
    },
    SearchFacesByImageCommand: { FaceMatches: [{ Face: { FaceId: 'f-1' } }, { Face: {} }] },
    IndexFacesCommand: { FaceRecords: [{ Face: { FaceId: 'f-new' } }] },
    DetectFacesCommand: { FaceDetails: [{ AgeRange: { Low: 22, High: 29 } }] },
  };
  const sent: string[] = [];
  const client = {
    send: (c: unknown) => (
      sent.push((c as object).constructor.name),
      Promise.resolve(replies[(c as object).constructor.name])
    ),
  };
  const aws = new AwsLiveness(client, 'faces');
  assertEquals(await aws.createSession(), 's-1');
  assertEquals(await aws.getResult('s-1'), {
    confidence: 97.1,
    referenceImage: new Uint8Array([9]),
  });
  assertEquals(await aws.search(new Uint8Array([9]), 90), ['f-1']);
  assertEquals(await aws.index(new Uint8Array([9]), 'u_1'), 'f-new');
  assertEquals(await aws.ageLow(new Uint8Array([9])), { low: 22, high: 29 });

  replies.GetFaceLivenessSessionResultsCommand = { Status: 'EXPIRED' };
  assertEquals(await aws.getResult('s-1'), { confidence: 0, referenceImage: null });
  replies.DetectFacesCommand = { FaceDetails: [] };
  assertEquals(await aws.ageLow(new Uint8Array([9])), null);
});

Deno.test(
  'AWS liveness: a frame without a face matches nothing; other errors propagate',
  async () => {
    const err = (name: string) => ({
      send: () => Promise.reject(Object.assign(new Error('x'), { name })),
    });
    assertEquals(
      await new AwsLiveness(err('InvalidParameterException'), 'c').search(new Uint8Array(), 90),
      [],
    );
    await assertRejects(() =>
      new AwsLiveness(err('ThrottlingException'), 'c').search(new Uint8Array(), 90),
    );
    await assertRejects(() =>
      new AwsLiveness({ send: () => Promise.resolve({}) }, 'c').createSession(),
    );
  },
);

Deno.test('mock liveness: always live, adult and unmatched (local only)', async () => {
  const m = new MockLiveness();
  const s = await m.createSession();
  assert(s.startsWith('mock-'));
  assertEquals((await m.getResult(s)).confidence, 99);
  assertEquals(await m.search(), []);
  assertEquals(await m.index(new Uint8Array(), 'u_1'), 'mock-face-u_1');
  assertEquals(await m.ageLow(), { low: 25, high: 32 });
});

// --- auth hook ----------------------------------------------------------------------
const hookSecret = 'v1,whsec_' + btoa('a-very-secret-signing-key-123456');

function signed(payload: unknown, secret = hookSecret) {
  const body = JSON.stringify(payload);
  const id = 'msg_1';
  const ts = new Date();
  const sig = new Webhook(secret.replace('v1,whsec_', '')).sign(id, ts, body);
  return new Request('http://f', {
    method: 'POST',
    body,
    headers: {
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(ts.getTime() / 1000)),
      'webhook-signature': sig,
    },
  });
}

Deno.test(
  'auth hook: refuses unsigned calls and banned or disposable emails generically',
  async () => {
    const db = new FakeDb();
    db.bans.add(`email:${await hashOf('email', 'eceyilmaz@gmail.com')}`);
    const deps = {
      hmacSecret: SECRET,
      hookSecret,
      db,
      disposableDomains: new Set(['mailinator.com']),
    };

    assertEquals(
      (await beforeUserCreated(deps, new Request('http://f', { method: 'POST', body: '{}' })))
        .status,
      401,
    );
    assertEquals((await beforeUserCreated({ ...deps, hookSecret: null }, signed({}))).status, 503);

    const banned = await beforeUserCreated(
      deps,
      signed({ user: { email: 'Ece.Yilmaz@gmail.com' } }),
    );
    assertEquals([banned.status, (await banned.json()).error.message], [403, GENERIC_REFUSAL]);
    assertEquals(
      (await beforeUserCreated(deps, signed({ user: { email: 'x@mailinator.com' } }))).status,
      400,
    );

    const fine = await beforeUserCreated(
      deps,
      signed({ user: { email: 'someone@privaterelay.appleid.com' } }),
    );
    assertEquals([fine.status, await fine.json()], [200, {}]);
  },
);
