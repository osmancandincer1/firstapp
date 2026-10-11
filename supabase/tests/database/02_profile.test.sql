-- Phase 2 database tests: profile fields, photos, voice card, public projection.
begin;
select plan(55);

create function pg_temp.h(t text) returns text language sql as $$ select md5(t) || md5(t || '#') $$;
create function pg_temp.pid(u uuid) returns uuid language sql as $$ select id from public.profiles where user_id = u $$;
create function pg_temp.presets(n int) returns uuid[] language sql as $$
  select array_agg(id) from (select id from public.question_presets order by sort limit n) s $$;
create function pg_temp.interest_ids(n int) returns uuid[] language sql as $$
  select array_agg(id) from (select id from public.interests order by sort limit n) s $$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@example.com');

-- Content shipped with the app ------------------------------------------------------
select ok((select count(*) >= 80 from public.question_presets), '§4.2: at least 80 door questions');
select ok((select count(*) >= 100 from public.interests), '§6.4: about 120 interests');
select is((select count(*)::int from public.cities), 81, '81 provinces');
select is((select name from public.cities where id = 42), 'Konya', 'plate codes are correct');

-- Clients cannot reach profile tables or media directly ---------------------------------
insert into storage.objects (bucket_id, name) values
  ('quarantine', pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001') || '/photos/x.jpg');
select ok(not exists (select 1 from storage.buckets where id in ('quarantine', 'public-photos', 'public-voice') and public),
  'all media buckets are private (§13.7)');

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-4000-8000-000000000001", "role": "authenticated"}';
select is((select count(*)::int from storage.objects where bucket_id = 'quarantine'), 0,
  'PRO-01: quarantined objects are not listable or readable, not even by their owner');
select throws_ok('select * from public.profile_photos', '42501', null, 'photo rows are not readable directly');
select throws_ok('select * from public.profile_details', '42501', null, 'details are not readable directly');
select throws_ok($$update public.profiles set name = 'X'$$, '42501', null, 'profiles are not writable');
select lives_ok('select * from public.question_presets', 'door question presets are readable');
select throws_ok($$select public.srv_public_profile(gen_random_uuid())$$, '42501', null,
  'the public projection is server-only');
select is(public.my_profile() ->> 'status', 'onboarding', 'my_profile returns the caller''s own profile');
reset role;

-- Basics and the name change limit (§6.4) ----------------------------------------------------
select is(public.srv_update_basics('aaaaaaaa-0000-4000-8000-000000000001', 'Ece', 'woman', null, true,
  array['men']), 'ok', 'basics are stored');
select is(public.srv_update_basics('aaaaaaaa-0000-4000-8000-000000000001', 'Ece Nur', 'self_described', 'Akışkan', false,
  array['men', 'women']), 'ok', 'the name can change freely during sign-up');

-- Intent, door question, interests, details, location ------------------------------------------
select is(public.srv_update_intent('aaaaaaaa-0000-4000-8000-000000000001', 'long_term', 'chat_first',
  '[{"field": "smoking", "accepted": ["never"]}]'), 'ok', 'intent card is stored');
select is(public.srv_set_door_question('aaaaaaaa-0000-4000-8000-000000000001', gen_random_uuid(), null),
  'invalid_preset', 'an unknown preset is refused');
select is(public.srv_set_door_question('aaaaaaaa-0000-4000-8000-000000000001', (pg_temp.presets(1))[1], null),
  'ok', 'a preset door question is stored');
select is(public.srv_set_interests('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.interest_ids(4)), 'invalid',
  'fewer than 5 interests are refused');
select is(public.srv_set_interests('aaaaaaaa-0000-4000-8000-000000000001',
  pg_temp.interest_ids(4) || gen_random_uuid()), 'invalid', 'unknown interests are refused');
select is(public.srv_set_interests('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.interest_ids(6)), 'ok',
  'six interests are stored');
select is(public.srv_set_interests('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.interest_ids(5)), 'ok',
  'the set can be replaced');
select is((select count(*)::int from public.profile_interests
           where profile_id = pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')), 5, 'old interests are removed');

do $$ begin perform public.srv_update_details('aaaaaaaa-0000-4000-8000-000000000001',
  '{"height": 172, "smoking": "never", "occupation": "Mimar"}', '{"height": false}'); end $$;
do $$ begin perform public.srv_update_details('aaaaaaaa-0000-4000-8000-000000000001', '{"occupation": null}', '{}'); end $$;
select is((select data from public.profile_details where profile_id = pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')),
  '{"height": 172, "smoking": "never"}'::jsonb, 'details merge and null clears a field');

select is(public.srv_set_location('aaaaaaaa-0000-4000-8000-000000000001', 34::smallint, null, 41.01, 28.98),
  'ok', 'location is stored');
insert into public.districts (city_id, name) values (6, 'Çankaya');
select is(public.srv_set_location('aaaaaaaa-0000-4000-8000-000000000001', 34::smallint,
  (select id from public.districts where name = 'Çankaya'), null, null), 'invalid_district',
  'a district must belong to the chosen city');

-- Photos -------------------------------------------------------------------------------------
select results_eq(
  $$select public.srv_photo_create('aaaaaaaa-0000-4000-8000-000000000001') is not null from generate_series(1, 7)$$,
  $$values (true), (true), (true), (true), (true), (true), (false)$$,
  '§6.4: at most 6 photos');
select is((select quarantine_path from public.profile_photos where position = 0
           and profile_id = pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')),
  pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001') || '/photos/' ||
  (select id from public.profile_photos where position = 0 and profile_id = pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')) || '.jpg',
  'uploads go to a per-profile quarantine path');

-- approve photos 0–2 (0 face-matched), reject 3, leave 4–5 pending
do $$
declare r record;
begin
  for r in select id, position from public.profile_photos
           where profile_id = pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001') order by position loop
    if r.position < 3 then
      perform public.srv_photo_finish('aaaaaaaa-0000-4000-8000-000000000001', r.id, 'approved', null,
        r.position = 0, 'p/' || r.id || '.jpg', 1200, 1500);
    elsif r.position = 3 then
      perform public.srv_photo_finish('aaaaaaaa-0000-4000-8000-000000000001', r.id, 'rejected', 'no_face',
        false, null, 1200, 1500);
    end if;
  end loop;
end $$;
select is((select reject_reason from public.profile_photos where status = 'rejected'
           and profile_id = pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')),
  'no_face', 'the rejection reason is kept for the user');
select is((select position from public.profile_photos where status = 'rejected'
           and profile_id = pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')), 5::smallint,
  'rejected photos move to the end');
select is((select quarantine_path from public.profile_photos where status = 'approved'
           and profile_id = pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001') order by position limit 1),
  null, 'approved photos no longer point to quarantine');
select is((public.srv_onboarding_state_v2('aaaaaaaa-0000-4000-8000-000000000001') ->> 'photosComplete')::boolean, true,
  'three approved photos with a face-matched main photo complete the step');
select is(public.srv_photo_reorder('aaaaaaaa-0000-4000-8000-000000000001', array[gen_random_uuid()]), 'invalid',
  'reorder needs exactly the user''s photos');

-- Sign-up completion --------------------------------------------------------------------------
select is(public.srv_try_complete_onboarding('aaaaaaaa-0000-4000-8000-000000000001'), 'onboarding',
  'incomplete accounts stay in onboarding');
update public.profiles set phone_verified_at = now(), birth_date = '1995-05-05', verified_at = now()
 where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.feature_flags set value = 'true' where key = 'legal.allow_draft_documents';
delete from public.legal_documents;
insert into public.legal_documents (type, version) select t, 'v1' from unnest(enum_range(null::public.consent_type)) t;
insert into public.consents (profile_id, type, version, granted)
select pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001'), t, 'v1', true from unnest(enum_range(null::public.consent_type)) t;
select is(public.srv_try_complete_onboarding('aaaaaaaa-0000-4000-8000-000000000001'), 'active',
  'a complete account becomes active');

-- Limits that apply after sign-up -------------------------------------------------------------
update public.profiles set name_changed_at = now() where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is(public.srv_update_basics('aaaaaaaa-0000-4000-8000-000000000001', 'Ece', 'woman', null, true, array['men']),
  'name_locked', 'the name changes at most once every 30 days');
select is(public.srv_set_door_question('aaaaaaaa-0000-4000-8000-000000000001', null, 'Beni hangi konsere götürürdün?'),
  'locked', 'the door question changes at most once every 7 days');

-- VER-07: a new main photo on an active profile requires a new liveness check ------------------
select is(public.srv_photo_reorder('aaaaaaaa-0000-4000-8000-000000000001',
  (select array_agg(id order by position desc) from public.profile_photos
   where profile_id = pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001') and status <> 'rejected')), 'ok',
  'photos can be reordered');
select is((select reverify_required from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  true, 'VER-07: changing the main photo requires re-verification');
update public.profiles set verified_at = now() + interval '1 second' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is((select reverify_required from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  false, 'passing liveness again clears the flag');
select ok((select array_length(public.srv_photo_delete('aaaaaaaa-0000-4000-8000-000000000001',
  (select id from public.profile_photos where status = 'pending'
   and profile_id = pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001') limit 1)), 1) = 1),
  'deleting returns the storage paths to remove');

-- What others see (PRO-06, PRO-07) -------------------------------------------------------------
select ok(not (public.srv_public_profile(pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001'))
              ?| array['birthDate', 'birth_date', 'email', 'phone', 'phoneLast2', 'geo_lat', 'geo_lng',
                       'riskScore', 'risk_score', 'userId', 'user_id']),
  'PRO-07: no birth date, contact data, coordinates or risk score in the public profile');
select is((public.srv_public_profile(pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')) -> 'details'),
  '{"smoking": "never"}'::jsonb, 'PRO-06: a hidden field (height) is not returned');
select is((public.srv_public_profile(pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')) ->> 'gender'), null,
  'a hidden gender is not returned');
select is((public.srv_public_profile(pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')) ->> 'age')::int,
  extract(year from age((now() at time zone 'Europe/Istanbul')::date, '1995-05-05'::date))::int,
  'only the age is shown');
select is(jsonb_array_length(public.srv_public_profile(pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')) -> 'photos'), 3,
  'PRO-01: only approved photos appear, never pending or rejected ones');
select is(public.srv_public_profile(pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')) ->> 'city', 'İstanbul',
  'the city is shown when no district is set');

-- PRO-08: an edit under review keeps the published value -------------------------------------
do $$ begin perform public.srv_add_pending_edit('aaaaaaaa-0000-4000-8000-000000000001', 'about', '"Saatlik ücretle"', 'commercial'); end $$;
select is((select data ->> 'about' from public.profile_details
           where profile_id = pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')), null,
  'PRO-08: the pending text is not published');
set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(jsonb_array_length(public.my_profile() -> 'pendingEdits'), 1, 'the user sees the edit waiting for review');
reset role;

-- Voice card ------------------------------------------------------------------------------------
select is(public.srv_voice_create('aaaaaaaa-0000-4000-8000-000000000001', gen_random_uuid()), null,
  'a voice card needs a valid prompt');
select ok(public.srv_voice_finish('aaaaaaaa-0000-4000-8000-000000000001',
  public.srv_voice_create('aaaaaaaa-0000-4000-8000-000000000001', (select id from public.voice_prompts limit 1)),
  'approved', null, 12000, 'v/1.m4a') is not null, 'a processed voice card is published');
select is((select count(*)::int from private.review_queue where reason = 'voice_spot_check'), 1,
  'published voice cards are queued for a spot check (§7.2)');
select ok(public.srv_public_profile(pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')) -> 'voice' ? 'durationMs',
  'the voice card appears on the public profile');

select ok((select bool_and(m ->> 'bucket' in ('public-photos', 'quarantine', 'public-voice'))
           from jsonb_array_elements(public.srv_my_media('aaaaaaaa-0000-4000-8000-000000000001')) m),
  'own media paths carry their bucket');
select is(public.srv_my_public_profile('aaaaaaaa-0000-4000-8000-000000000001'),
  public.srv_public_profile(pg_temp.pid('aaaaaaaa-0000-4000-8000-000000000001')),
  'the preview is exactly what others would see');

-- Another user's data stays invisible ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-4000-8000-000000000002", "role": "authenticated"}';
select is(public.my_profile() ->> 'name', null, 'user B sees only their own (empty) profile');
reset role;

select * from finish();
rollback;
