-- Phase 1 database tests: RLS, OTP, rate limits, identifiers, bans, age gate,
-- devices, consents and liveness outcomes. Run with: npx supabase test db
begin;
select plan(57);

-- Test helpers -----------------------------------------------------------------
create function pg_temp.h(t text) returns text language sql as $$ select md5(t) || md5(t || '#') $$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

-- Structure ----------------------------------------------------------------------
select is(
  (select count(*)::int from pg_tables where schemaname in ('public', 'private') and not rowsecurity),
  0, 'every public and private table has RLS enabled');

select is((select count(*)::int from public.profiles), 2, 'a profile is created for each new auth user');
select is((select status::text from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'),
  'onboarding', 'new profiles start in onboarding');

-- Acceptance: an unverified user sees no other profile (AUTH-09) ------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select is((select count(*)::int from public.profiles), 1, 'a user sees exactly one profile: their own');
select is((select user_id from public.profiles),
  '11111111-1111-1111-1111-111111111111'::uuid, 'the visible profile is their own');
select throws_ok('select risk_score from public.profiles', '42501', null,
  'the risk score is not readable by the user');
select throws_ok($$update public.profiles set verified_at = now()$$, '42501', null,
  'VER-05: a user cannot mark themselves verified');
select throws_ok($$update public.profiles set status = 'active'$$, '42501', null,
  'a user cannot change their account status');
select throws_ok($$insert into public.profiles (user_id) values ('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'a user cannot create profiles');
select throws_ok($$insert into public.consents (profile_id, type, version, granted)
  select id, 'terms', 'v1', true from public.profiles$$, '42501', null,
  'consents are written only by the server');
select throws_ok('select * from public.bans', '42501', null, 'bans are not readable by users');
select throws_ok('select * from public.ban_identifiers', '42501', null, 'ban identifiers are not readable');
select throws_ok('select * from public.verifications', '42501', null, 'verifications are server-only');
select throws_ok('select * from private.otp_challenges', '42501', null, 'the private schema is closed');
select throws_ok($$select public.srv_rate_limit_hit('x', 60, 1)$$, '42501', null,
  'server functions cannot be called by users');
reset role;

set local role anon;
select throws_ok('select id from public.profiles', '42501', null, 'anonymous users cannot read profiles');
select lives_ok('select * from public.legal_documents', 'legal documents are public');
select lives_ok('select * from public.current_legal_documents()', 'anyone can see which documents apply');
reset role;

-- Rate limits (AUTH-03) -------------------------------------------------------------
select results_eq(
  $$select public.srv_rate_limit_hit('otp:ip:1', 3600, 3) from generate_series(1, 4)$$,
  $$values (true), (true), (true), (false)$$,
  'the fourth request within an hour is refused');
select ok(public.srv_rate_limit_hit('otp:device:1', 3600, 3), 'buckets are counted separately');
update private.rate_limit_events set created_at = now() - interval '61 minutes' where bucket = 'otp:ip:1';
select ok(public.srv_rate_limit_hit('otp:ip:1', 3600, 3), 'requests older than the window no longer count');

-- One-time codes (AUTH-02) ----------------------------------------------------------
select is(public.srv_otp_create('email', pg_temp.h('a'), pg_temp.h('111111'), 600), 'created', 'a code is issued');
select is(public.srv_otp_verify('email', pg_temp.h('a'), pg_temp.h('111111'), 5, 900), 'ok', 'the right code works');
select is(public.srv_otp_verify('email', pg_temp.h('a'), pg_temp.h('111111'), 5, 900), 'not_found',
  'a used code cannot be reused');

do $$ begin perform public.srv_otp_create('email', pg_temp.h('a'), pg_temp.h('222222'), 600); end $$;
do $$ begin perform public.srv_otp_create('email', pg_temp.h('a'), pg_temp.h('333333'), 600); end $$;
select is(public.srv_otp_verify('email', pg_temp.h('a'), pg_temp.h('222222'), 5, 900), 'invalid',
  'a new code replaces the previous one');
select is(public.srv_otp_verify('email', pg_temp.h('a'), pg_temp.h('333333'), 5, 900), 'ok',
  'the latest code works');

do $$ begin perform public.srv_otp_create('email', pg_temp.h('a'), pg_temp.h('444444'), 600); end $$;
update private.otp_challenges set expires_at = now() - interval '1 second'
 where target_hash = pg_temp.h('a') and consumed_at is null;
select is(public.srv_otp_verify('email', pg_temp.h('a'), pg_temp.h('444444'), 5, 900), 'expired',
  'an expired code is refused');

do $$ begin perform public.srv_otp_create('email', pg_temp.h('b'), pg_temp.h('555555'), 600); end $$;
select results_eq(
  $$select public.srv_otp_verify('email', pg_temp.h('b'), pg_temp.h('000000'), 5, 900)
    from generate_series(1, 5)$$,
  $$values ('invalid'), ('invalid'), ('invalid'), ('invalid'), ('locked')$$,
  'the fifth wrong code locks the address');
select is(public.srv_otp_verify('email', pg_temp.h('b'), pg_temp.h('555555'), 5, 900), 'locked',
  'while locked even a correct code is refused');
select is(public.srv_otp_create('email', pg_temp.h('b'), pg_temp.h('666666'), 600), 'locked',
  'while locked no new code is issued');
select ok((select locked_until between now() + interval '14 minutes' and now() + interval '16 minutes'
           from private.otp_locks where target_hash = pg_temp.h('b')), 'the lock lasts 15 minutes');
update private.otp_locks set locked_until = now() - interval '1 second' where target_hash = pg_temp.h('b');
select is(public.srv_otp_create('email', pg_temp.h('b'), pg_temp.h('777777'), 600), 'created',
  'after the lock a new code can be issued');

do $$ begin perform public.srv_otp_create('phone', pg_temp.h('+905321234567'), pg_temp.h('121212'), 600,
  '11111111-1111-1111-1111-111111111111'); end $$;
select is(public.srv_otp_verify('phone', pg_temp.h('+905321234567'), pg_temp.h('121212'), 5, 900,
  '22222222-2222-2222-2222-222222222222'), 'not_found', 'a phone code works only for the account that requested it');

-- Identifiers: one phone, one account (AUTH-05) ---------------------------------------
select results_eq(
  $$values
     (public.srv_bind_identifier('11111111-1111-1111-1111-111111111111', 'phone', pg_temp.h('p1'))),
     (public.srv_bind_identifier('11111111-1111-1111-1111-111111111111', 'phone', pg_temp.h('p1'))),
     (public.srv_bind_identifier('22222222-2222-2222-2222-222222222222', 'phone', pg_temp.h('p1')))$$,
  $$values ('bound'), ('already_yours'), ('taken')$$,
  'a phone number belongs to one account');
select is(public.srv_mark_phone_verified('22222222-2222-2222-2222-222222222222', pg_temp.h('p1'), '67'),
  'taken', 'another account cannot verify a taken number');
select is((select phone_verified_at from public.profiles where user_id = '22222222-2222-2222-2222-222222222222'),
  null, 'the phone step stays open for that account');
select is(public.srv_mark_phone_verified('11111111-1111-1111-1111-111111111111', pg_temp.h('p1'), '67'),
  'ok', 'the owner completes the phone step');
select ok((select phone_verified_at is not null and phone_last2 = '67' from public.profiles
           where user_id = '11111111-1111-1111-1111-111111111111'), 'phone verification is stored');

-- Ban lookup (BAN-01/02 at the database level) ----------------------------------------
insert into public.bans (id, reason_code) values ('33333333-3333-3333-3333-333333333333', 'fraud');
insert into public.ban_identifiers (ban_id, type, hash) values
  ('33333333-3333-3333-3333-333333333333', 'email', pg_temp.h('banned@gmail.com')),
  ('33333333-3333-3333-3333-333333333333', 'device', pg_temp.h('dev-banned')),
  ('33333333-3333-3333-3333-333333333333', 'face', pg_temp.h('face-banned'));
select is(public.srv_ban_lookup(jsonb_build_array(
    jsonb_build_object('type', 'phone', 'hash', pg_temp.h('x')),
    jsonb_build_object('type', 'email', 'hash', pg_temp.h('banned@gmail.com')))),
  '33333333-3333-3333-3333-333333333333'::uuid, 'any banned identifier matches');
select is(public.srv_ban_lookup(jsonb_build_array(
    jsonb_build_object('type', 'phone', 'hash', pg_temp.h('banned@gmail.com')))),
  null, 'the identifier type must match');

-- Age gate (AUTH-01) ------------------------------------------------------------------
select is(public.srv_set_birth_date('22222222-2222-2222-2222-222222222222',
    ((now() at time zone 'Europe/Istanbul')::date - interval '17 years')::date),
  'underage', 'an under-18 birth date is refused on the server');
select is(public.srv_set_birth_date('22222222-2222-2222-2222-222222222222', '1990-01-01'),
  'age_locked', 'after an under-age attempt the account waits 24 hours');
select is(public.srv_set_birth_date('11111111-1111-1111-1111-111111111111',
    ((now() at time zone 'Europe/Istanbul')::date + 1)), 'invalid', 'a future date is refused');
select is(public.srv_set_birth_date('11111111-1111-1111-1111-111111111111',
    ((now() at time zone 'Europe/Istanbul')::date - interval '18 years')::date),
  'ok', 'someone turning 18 today is accepted');
select is(public.srv_set_birth_date('11111111-1111-1111-1111-111111111111', '1990-01-01'),
  'already_set', 'the birth date cannot be changed by the user');

-- Devices (BAN-05) ----------------------------------------------------------------------
select is(public.srv_register_device('22222222-2222-2222-2222-222222222222', 'android',
  pg_temp.h('dev-banned'), '0.1.0'), 'review', 'a banned device triggers review');
select ok((select risk_score = 85 and status = 'onboarding' from public.profiles
           where user_id = '22222222-2222-2222-2222-222222222222'),
  'a device match alone raises risk to 85 but does not block');
select is((select count(*)::int from private.review_queue where reason = 'banned_device_match'), 1,
  'the account lands in the review queue');

-- Consents and onboarding state -----------------------------------------------------------
-- Independent of the local seed: start from no documents and drafts disallowed.
delete from public.legal_documents;
update public.feature_flags set value = 'false' where key = 'legal.allow_draft_documents';
insert into public.legal_documents (type, version, is_draft)
select t, 'draft-1', true from unnest(enum_range(null::public.consent_type)) t;
insert into public.consents (profile_id, type, version, granted)
select p.id, t, 'draft-1', t <> 'marketing'
from public.profiles p, unnest(enum_range(null::public.consent_type)) t
where p.user_id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select is((public.my_onboarding_state() ->> 'consentsComplete')::boolean, false,
  'draft documents do not count unless explicitly allowed');
select is((select count(*)::int from public.current_legal_documents()), 0,
  'drafts are not offered unless explicitly allowed');
reset role;
update public.feature_flags set value = 'true' where key = 'legal.allow_draft_documents';
set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select ok(public.my_onboarding_state() @>
  '{"status": "onboarding", "phoneVerified": true, "phoneLast2": "67", "consentsComplete": true,
    "livenessVerified": false, "idRequired": false}'::jsonb,
  'the onboarding state reflects what the server knows (later phases add keys)');
reset role;

-- Liveness outcomes (VER-01/03, BAN-03/10) --------------------------------------------------
insert into public.verifications (profile_id, kind, provider, provider_ref)
select id, 'liveness', 'mock', 'sess-a' from public.profiles where user_id = '11111111-1111-1111-1111-111111111111';
select is(public.srv_liveness_finish('11111111-1111-1111-1111-111111111111', 'mock', 'sess-a', 'passed',
  97.5, 25, 31, pg_temp.h('face-a')), 'passed', 'a passed check is stored');
select ok((select verified_at is not null from public.profiles
           where user_id = '11111111-1111-1111-1111-111111111111'), 'the account is now verified');
select is(public.srv_face_owners('22222222-2222-2222-2222-222222222222',
    array[pg_temp.h('face-a'), pg_temp.h('face-banned'), pg_temp.h('unknown')]),
  array['active_other', 'banned'], 'face matches resolve to their owners');

insert into public.verifications (profile_id, kind, provider, provider_ref)
select id, 'liveness', 'mock', 'sess-b' from public.profiles where user_id = '22222222-2222-2222-2222-222222222222';
do $$ begin perform public.srv_bind_identifier('22222222-2222-2222-2222-222222222222', 'email', pg_temp.h('b@example.com')); end $$;
select is(public.srv_liveness_finish('22222222-2222-2222-2222-222222222222', 'mock', 'sess-b', 'banned_face',
  96, 30, 35, null, array[pg_temp.h('face-banned')]), 'banned_face', 'a banned face is refused');
select ok((select status = 'banned' from public.profiles where user_id = '22222222-2222-2222-2222-222222222222')
  and public.srv_ban_lookup(jsonb_build_array(jsonb_build_object('type', 'email', 'hash', pg_temp.h('b@example.com')))) is not null,
  'ban evasion bans the new account and its identifiers');

select ok(public.srv_webhook_seen('veriff', 'evt-1') and not public.srv_webhook_seen('veriff', 'evt-1'),
  'VER-06: a webhook event is processed only once');

select * from finish();
rollback;
