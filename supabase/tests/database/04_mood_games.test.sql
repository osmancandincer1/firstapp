-- Mood tag and "İki doğru, bir yalan" (D-064, D-066).
begin;
select plan(13);

create function pg_temp.uid(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.pid(n int) returns uuid language sql as $$
  select id from public.profiles where user_id = pg_temp.uid(n) $$;
create function pg_temp.mk(p_n int, p_gender text, p_seeking text[], p_city smallint)
returns uuid language plpgsql as $$
declare v_pid uuid;
begin
  insert into auth.users (id, email) values (pg_temp.uid(p_n), 'm' || p_n || '@example.com');
  update public.profiles set
    status = 'active', gender = p_gender, seeking = p_seeking, intent = 'unsure', tempo = 'chat_first',
    birth_date = ((now() at time zone 'Europe/Istanbul')::date - interval '30 years' - interval '10 days')::date,
    verified_at = now(), phone_verified_at = now(), city_id = p_city, name = 'M' || p_n,
    last_active_at = now(), onboarding_completed_at = now()
  where user_id = pg_temp.uid(p_n) returning id into v_pid;
  perform private.ensure_preferences(v_pid);
  return v_pid;
end $$;

do $$ begin
  perform pg_temp.mk(501, 'man', array['women'], 12::smallint);
  perform pg_temp.mk(502, 'woman', array['men'], 12::smallint);
  perform pg_temp.mk(503, 'woman', array['men'], 12::smallint);
end $$;

-- Mood -------------------------------------------------------------------------------------------
select is(public.srv_update_mood(pg_temp.uid(502), 'coffee'), 'ok', 'a mood can be set');
select is(public.srv_public_profile(pg_temp.pid(502)) ->> 'mood', 'coffee', 'this week''s mood is public');
update public.profiles set mood_set_at = now() - interval '8 days' where id = pg_temp.pid(502);
select is(public.srv_public_profile(pg_temp.pid(502)) ->> 'mood', null, 'a mood from an earlier week is no longer shown');
do $$ begin perform public.srv_update_mood(pg_temp.uid(502), 'coffee'); end $$;
do $$ begin perform public.srv_update_mood(pg_temp.uid(502), null); end $$;
select is((select mood from public.profiles where id = pg_temp.pid(502)), null, 'a mood can be cleared');

-- Same mood: a reason and a small bonus ---------------------------------------------------------------
do $$ begin perform public.srv_update_mood(pg_temp.uid(501), 'walk'); end $$;
do $$ begin perform public.srv_update_mood(pg_temp.uid(502), 'walk'); end $$;
select ok((private.tur_reasons(pg_temp.pid(501), pg_temp.pid(502)) -> 'all') ? 'same_mood',
  '"Neden bu kişi?" says when both chose the same mood');
select ok(not (private.tur_reasons(pg_temp.pid(501), pg_temp.pid(503)) -> 'all') ? 'same_mood',
  'no mood reason without a shared mood');
create temp table mb as select public.srv_generate_tur(pg_temp.pid(501), private.tur_date_at(now()) + 9, 'welcome') as id;
select ok((select score from public.tur_cards where batch_id = (select id from mb) and candidate_id = pg_temp.pid(502))
          > (select score from public.tur_cards where batch_id = (select id from mb) and candidate_id = pg_temp.pid(503)),
  'the same mood ranks a little higher (tur.mood_bonus)');

-- Two truths, one lie ------------------------------------------------------------------------------------
select is(public.srv_update_two_truths(pg_temp.uid(502),
  array['Hiç deniz görmedim, gerçekten.', 'Üç kez Kars’a gittim.', 'Fotoğrafım dergide çıktı.'], 0::smallint),
  'ok', 'the game is saved');
select is(public.srv_public_profile(pg_temp.pid(502)) -> 'twoTruths' ->> 'lie', '0', 'the public profile carries the game');
select throws_ok(
  $$select public.srv_update_two_truths(pg_temp.uid(502), array['kısa', 'Üç kez Kars’a gittim.', 'Fotoğrafım dergide çıktı.'], 1::smallint)$$,
  '23514', null, 'each statement is 8–80 characters');
select throws_ok(
  $$select public.srv_update_two_truths(pg_temp.uid(502), array['Bir cümle burada.', 'İki cümle burada.'], 1::smallint)$$,
  '23514', null, 'exactly three statements');
do $$ begin perform public.srv_update_two_truths(pg_temp.uid(502), null, null); end $$;
select is(public.srv_public_profile(pg_temp.pid(502)) -> 'twoTruths', null, 'the game can be removed');

-- Access -----------------------------------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(501), 'role', 'authenticated')::text, true); end $$;
select is((select count(*)::int from public.profile_games), 0, 'games are not readable directly');
reset role;

select * from finish();
rollback;
