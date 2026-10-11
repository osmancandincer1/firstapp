-- Phase 3 database tests: the Round, answers and tables.
begin;
select plan(55);

create function pg_temp.uid(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.pid(n int) returns uuid language sql as $$
  select id from public.profiles where user_id = pg_temp.uid(n) $$;

-- An active, verified member who can take part in Rounds.
create function pg_temp.mk(p_n int, p_gender text, p_seeking text[], p_age int, p_intent text, p_city smallint)
returns uuid language plpgsql as $$
declare v_pid uuid;
begin
  insert into auth.users (id, email) values (pg_temp.uid(p_n), 'u' || p_n || '@example.com');
  update public.profiles set
    status = 'active', gender = p_gender, seeking = p_seeking, intent = p_intent, tempo = 'chat_first',
    birth_date = ((now() at time zone 'Europe/Istanbul')::date - make_interval(years => p_age) - interval '10 days')::date,
    verified_at = now(), phone_verified_at = now(), city_id = p_city, name = 'U' || p_n,
    last_active_at = now(), onboarding_completed_at = now()
  where user_id = pg_temp.uid(p_n) returning id into v_pid;
  perform private.ensure_preferences(v_pid);
  return v_pid;
end $$;

create function pg_temp.today() returns date language sql as $$ select private.tur_date_at(now()) $$;
create function pg_temp.cards(p_batch uuid) returns uuid[] language sql as $$
  select coalesce(array_agg(candidate_id order by candidate_id), '{}') from public.tur_cards where batch_id = p_batch $$;
create function pg_temp.card_of(p_viewer int, p_candidate int) returns uuid language sql as $$
  select tc.id from public.tur_cards tc join public.tur_batches tb on tb.id = tc.batch_id
  where tb.profile_id = pg_temp.pid(p_viewer) and tc.candidate_id = pg_temp.pid(p_candidate)
  order by tc.created_at desc limit 1 $$;

-- Viewer V and twelve candidates, each testing one rule ---------------------------------------
do $$ begin
  perform pg_temp.mk(1, 'woman', array['men'], 30, 'long_term', 34::smallint);   -- V
  perform pg_temp.mk(11, 'man', array['women'], 31, 'long_term', 34::smallint);  -- eligible
  perform pg_temp.mk(12, 'man', array['women'], 31, 'serious_unhurried', 34::smallint); -- eligible (neighbour intent)
  perform pg_temp.mk(13, 'man', array['men'], 31, 'long_term', 34::smallint);    -- not looking for women
  perform pg_temp.mk(14, 'man', array['women'], 45, 'long_term', 34::smallint);  -- outside V's age range
  perform pg_temp.mk(15, 'man', array['women'], 31, 'long_term', 34::smallint);  -- V outside his age range
  perform pg_temp.mk(16, 'man', array['women'], 31, 'friendship', 34::smallint); -- intent V does not accept
  perform pg_temp.mk(17, 'man', array['women'], 31, 'long_term', 6::smallint);   -- other city
  perform pg_temp.mk(18, 'man', array['women'], 31, 'long_term', 34::smallint);  -- paused
  perform pg_temp.mk(19, 'man', array['women'], 31, 'long_term', 34::smallint);  -- blocked
  perform pg_temp.mk(20, 'man', array['women'], 31, 'long_term', 34::smallint);  -- not verified
  perform pg_temp.mk(21, 'man', array['women'], 31, 'long_term', 34::smallint);  -- must re-verify
  perform pg_temp.mk(22, 'man', array['women'], 31, 'long_term', 34::smallint);  -- inactive for 10 days
end $$;
update public.preferences set age_min = 18, age_max = 23 where profile_id = pg_temp.pid(15);
update public.profiles set status = 'paused' where id = pg_temp.pid(18);
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.pid(1), pg_temp.pid(19));
update public.profiles set verified_at = null where id = pg_temp.pid(20);
update public.profiles set reverify_required = true where id = pg_temp.pid(21);
update public.profiles set last_active_at = now() - interval '10 days' where id = pg_temp.pid(22);

-- Timing (TUR-02) --------------------------------------------------------------------------------
select is(private.tur_date_at('2026-10-12 08:59:00+00'), '2026-10-11'::date, 'before 12:00 Istanbul last night''s Round is current');
select is(private.tur_date_at('2026-10-12 09:00:00+00'), '2026-10-12'::date, 'from 12:00 Istanbul the day''s Rounds start');
select is(private.tur_opens_at('2026-10-12'), '2026-10-12 18:00:00+00'::timestamptz, 'the evening Round opens at 21:00 Istanbul');
select is(private.tur_opens_at('2026-10-12', 'noon'), '2026-10-12 09:00:00+00'::timestamptz, 'the noon Round opens at 12:00 Istanbul (D-062)');

-- Filters (§5 step 1, TUR-03, TUR-04) --------------------------------------------------------------
select is((select array_agg(candidate_id order by candidate_id) from private.eligible_pool(pg_temp.pid(1))),
  (select array_agg(id order by id) from public.profiles where id in (pg_temp.pid(11), pg_temp.pid(12))),
  'only mutually compatible, active, verified, unblocked people in the same city are candidates');
select ok(pg_temp.pid(1) not in (select candidate_id from private.eligible_pool(pg_temp.pid(19))),
  'blocks work in both directions');
select ok(private.distance_km(41.01, 28.98, 41.01, 28.98) = 0 and private.distance_km(41.01, 28.98, 39.93, 32.86) between 340 and 360,
  'distance is computed in kilometres');

-- Must-haves use only what the other person shows (D-052)
update public.profiles set dealbreakers = '[{"field": "smoking", "accepted": ["never"]}]' where id = pg_temp.pid(1);
insert into public.profile_details (profile_id, data, visibility) values
  (pg_temp.pid(11), '{"smoking": "never"}', '{}'),
  (pg_temp.pid(12), '{"smoking": "never"}', '{"smoking": false}');
select is((select array_agg(candidate_id) from private.eligible_pool(pg_temp.pid(1))), array[pg_temp.pid(11)],
  'a must-have filters out people whose value does not fit or is hidden');
update public.profiles set dealbreakers = '[]' where id = pg_temp.pid(1);

-- Generation (TUR-01, TUR-06) ------------------------------------------------------------------------
create temp table b1 as select public.srv_generate_tur(pg_temp.pid(1), pg_temp.today(), 'welcome') as id;
select is(public.srv_generate_tur(pg_temp.pid(1), pg_temp.today(), 'welcome'), (select id from b1),
  'TUR-01: generating twice returns the same Round');
select is((select count(*)::int from public.tur_batches where profile_id = pg_temp.pid(1)), 1, 'TUR-01: one batch exists');
select is(pg_temp.cards((select id from b1)),
  (select array_agg(id order by id) from public.profiles where id in (pg_temp.pid(11), pg_temp.pid(12))),
  'TUR-06: a small pool is not filled with people outside the filters');
select ok((select pool_size = 2 and hint is not null from public.tur_batches where id = (select id from b1)),
  'the pool size and a hint are stored for the honest "only N people today" message');
select ok((select reasons -> 'reasons' @> '[{"key": "same_intent"}]' from public.tur_cards
           where batch_id = (select id from b1) and candidate_id = pg_temp.pid(11)),
  '§4.6: the card explains why (same intent)');
select ok((select bool_and(not (reasons::text ~* 'face|photo|birth|risk|email|phone')) from public.tur_cards),
  '§4.6: reasons never use photos, faces or sensitive data');
select is(public.srv_generate_tur(pg_temp.pid(20), pg_temp.today(), 'welcome'), null,
  'unverified accounts get no Round');

-- TUR-07: payment is not an input (§9.1) -------------------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private')
             and p.proname in ('srv_generate_tur', 'eligible_pool', 'tur_reasons', 'recently_seen')
             and p.prosrc ~* '(subscri|purchase|plus|payment|device|platform)'), 0,
  'TUR-07: nothing about subscriptions, payments or devices is read when ranking');

-- Card actions and history (TUR-05, TUR-11) ------------------------------------------------------------
select is(public.srv_tur_action(pg_temp.uid(1), pg_temp.card_of(1, 12), 'pass'), 'ok', 'a card can be passed');
select is(public.srv_tur_action(pg_temp.uid(1), pg_temp.card_of(1, 12), 'pass'), 'not_found', 'a decision cannot be repeated');
create temp table b2 as select public.srv_generate_tur(pg_temp.pid(1), pg_temp.today() + 1, 'welcome') as id;
select is(pg_temp.cards((select id from b2)), '{}'::uuid[], 'TUR-05: passed and recently shown people do not come back');
update public.tur_cards set created_at = now() - interval '15 days'
 where batch_id in (select id from public.tur_batches where profile_id = pg_temp.pid(1));
create temp table b3 as select public.srv_generate_tur(pg_temp.pid(1), pg_temp.today() + 2, 'welcome') as id;
select is(pg_temp.cards((select id from b3)), array[pg_temp.pid(11)],
  'TUR-05: someone not acted on returns after 14 days; a pass still hides for 60 days');
update public.tur_cards set created_at = now() - interval '15 days', acted_at = now() - interval '61 days'
 where batch_id in (select id from public.tur_batches where profile_id = pg_temp.pid(1)) and candidate_id = pg_temp.pid(12);
update public.tur_cards set created_at = now() - interval '15 days'
 where batch_id = (select id from b3);
create temp table b4 as select public.srv_generate_tur(pg_temp.pid(1), pg_temp.today() + 3, 'welcome') as id;
select ok(pg_temp.pid(12) = any (pg_temp.cards((select id from b4))), 'TUR-05: a pass expires after 60 days');

select is(public.srv_tur_action(pg_temp.uid(1), pg_temp.card_of(1, 12), 'save'), 'ok', 'a card can be saved for later');
select is(jsonb_array_length(public.srv_saved(pg_temp.uid(1))), 1, 'the saved list shows it');
insert into public.saved_cards (profile_id, candidate_id, expires_at)
select pg_temp.pid(1), id, now() + interval '7 days' from public.profiles
where id not in (pg_temp.pid(1), pg_temp.pid(12)) limit 8;
select is(public.srv_tur_action(pg_temp.uid(1), pg_temp.card_of(1, 11), 'save'), 'saved_limit', 'TUR-11: at most 9 saved');
update public.saved_cards set expires_at = now() - interval '1 second' where candidate_id <> pg_temp.pid(12);
do $$ begin perform public.srv_expire_daily(); end $$;
select is((select count(*)::int from public.saved_cards where profile_id = pg_temp.pid(1)), 1, 'TUR-11: saved cards drop after 7 days');
select is(public.srv_tur_action(pg_temp.uid(1), pg_temp.card_of(1, 12), 'unsave'), 'ok', 'a saved card can be removed');

-- "Less like this" lowers the score (TUR-11) -----------------------------------------------------------------
create temp table s_before as select score from public.tur_cards where batch_id = (select id from b4) and candidate_id = pg_temp.pid(11);
delete from public.tur_batches where profile_id = pg_temp.pid(1);
do $$ begin
  perform public.srv_less_like_this(pg_temp.uid(1), 'same_intent');
  perform public.srv_less_like_this(pg_temp.uid(1), 'same_intent');
end $$;
create temp table b5 as select public.srv_generate_tur(pg_temp.pid(1), pg_temp.today() + 4, 'welcome') as id;
select ok((select score from public.tur_cards where batch_id = (select id from b5) and candidate_id = pg_temp.pid(11))
          < (select score from s_before) - 9, 'TUR-11: "less like this" lowers the weight of that reason');

-- Fair exposure (TUR-08) ---------------------------------------------------------------------------------------
do $$ begin
  perform pg_temp.mk(2, 'man', array['women'], 40, 'unsure', 35::smallint);    -- V2
  perform pg_temp.mk(31, 'woman', array['men'], 40, 'unsure', 35::smallint);   -- shown 40 times this week
  perform pg_temp.mk(32, 'woman', array['men'], 40, 'unsure', 35::smallint);   -- rarely shown
  perform pg_temp.mk(33, 'woman', array['women'], 40, 'unsure', 1::smallint);  -- someone else's viewer
end $$;
insert into public.tur_batches (id, profile_id, tur_date, kind, opens_at)
select gen_random_uuid(), pg_temp.pid(33), date '2020-01-01' + g, 'evening', now() - interval '1 day' from generate_series(1, 40) g;
insert into public.tur_cards (batch_id, candidate_id, position, score, dominant)
select id, pg_temp.pid(31), 0, 0, 'fair' from public.tur_batches where profile_id = pg_temp.pid(33);
create temp table b6 as select public.srv_generate_tur(pg_temp.pid(2), pg_temp.today(), 'welcome') as id;
select is((select candidate_id from public.tur_cards where batch_id = (select id from b6) and position = 0), pg_temp.pid(32),
  'TUR-08: the rarely shown person ranks first (fair exposure)');

-- Two Rounds a day (D-062) ---------------------------------------------------------------------------------------
do $$ begin
  perform pg_temp.mk(300, 'man', array['women'], 35, 'unsure', 10::smallint);
  perform pg_temp.mk(301, 'woman', array['men'], 35, 'unsure', 10::smallint);
  perform public.srv_generate_all_turs(pg_temp.today() - 5, 'noon');
  perform public.srv_generate_all_turs(pg_temp.today() - 5, 'evening');
  perform public.srv_generate_tur(pg_temp.pid(300), pg_temp.today(), 'welcome');
end $$;
select is((select array_agg(kind order by opens_at) from public.tur_batches
           where profile_id = pg_temp.pid(300) and tur_date = pg_temp.today() - 5), array['noon', 'evening'],
  'the same day has a noon and an evening Round');
select is((select kind from public.tur_batches where id = private.current_batch(pg_temp.pid(300))), 'welcome',
  'the latest opened Round is current (older ones close when the next opens)');

-- Diversity never leaves a slot empty (§4.1, D-061) ----------------------------------------------------------------
-- Seven near-identical people are all chosen for the same reason; the cap of 4 must not drop the other three.
do $$ declare i int; begin
  perform pg_temp.mk(200, 'man', array['women'], 33, 'unsure', 9::smallint);
  for i in 201..207 loop perform pg_temp.mk(i, 'woman', array['men'], 33, 'unsure', 9::smallint); end loop;
end $$;
create temp table b8 as select public.srv_generate_tur(pg_temp.pid(200), pg_temp.today(), 'welcome') as id;
select is((select count(*)::int from public.tur_cards where batch_id = (select id from b8)), 7,
  'diversity is applied first, but people held back by it still fill the Round');

-- Pool estimate (TUR-09) ----------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.my_pool_estimate('{}'), 2, 'TUR-09: the estimate equals the real pool');
select is(public.my_pool_estimate('{"intents": ["long_term"]}'), 1, 'TUR-09: the estimate follows a filter change');
select throws_ok('select * from public.tur_cards', '42501', null, 'cards are not readable directly');
select throws_ok('select * from public.answers', '42501', null, 'answers are not readable directly');
reset role;

-- Answers (§4.2, MAS-02) ----------------------------------------------------------------------------------------
select is(public.srv_answer_create(pg_temp.uid(1), pg_temp.pid(13), 'Serpme kahvaltı tabii', null, null) ->> 'result',
  'not_in_tur', 'only people from the current Round (or saved) can be answered');
select is(public.srv_answer_create(pg_temp.uid(1), pg_temp.pid(11), 'Serpme kahvaltı tabii', null, null) ->> 'result',
  'ok', 'an answer is sent');
select is((select action from public.tur_cards where id = pg_temp.card_of(1, 11)), 'answered', 'the card is marked answered');
select is(public.srv_answer_create(pg_temp.uid(1), pg_temp.pid(11), 'Bir daha deneyeyim', null, null) ->> 'result',
  'not_in_tur', 'a person cannot be answered twice');
update public.feature_flags set value = '1' where key = 'answers.daily_limit';
select is(public.srv_answer_create(pg_temp.uid(1), pg_temp.pid(12), 'Simit çay daha güzel', null, null) ->> 'result',
  'daily_limit', 'MAS-02: the daily answer limit applies');
update public.feature_flags set value = '15' where key = 'answers.daily_limit';
update public.feature_flags set value = '1' where key = 'answers.pending_limit';
select is(public.srv_answer_create(pg_temp.uid(1), pg_temp.pid(12), 'Simit çay daha güzel', null, null) ->> 'result',
  'pending_limit', 'MAS-02: at most N answers can wait at once');
update public.feature_flags set value = '15' where key = 'answers.pending_limit';

-- Reciprocation opens a table --------------------------------------------------------------------------------------
create temp table r1 as select public.srv_answer_respond(pg_temp.uid(11),
  (select id from public.answers where from_id = pg_temp.pid(1) and to_id = pg_temp.pid(11)), 'reciprocate', 'Ben simit derim!') as r;
select is((select r ->> 'tableStatus' from r1), 'active', 'reciprocating opens an active table');
select is((select count(*)::int from public.messages where table_id = (select (r ->> 'tableId')::uuid from r1)), 2,
  'the table starts with the answer and the reply');
select is((public.srv_inbox(pg_temp.uid(1)) -> 'outgoing' -> 0 ->> 'status'), 'reciprocated', 'the sender sees the reciprocation');

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-000000000013", "role": "authenticated"}';
select is((select count(*)::int from public.tables), 0, 'outsiders cannot see a table');
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is((select count(*)::int from public.messages), 2, 'the parties can read their table''s messages');
reset role;

-- MAS-04: both reciprocate at once → one table ------------------------------------------------------------------------
do $$ begin
  perform pg_temp.mk(41, 'woman', array['men'], 28, 'long_term', 16::smallint);
  perform pg_temp.mk(42, 'man', array['women'], 29, 'long_term', 16::smallint);
  perform public.srv_generate_tur(pg_temp.pid(41), pg_temp.today(), 'welcome');
  perform public.srv_generate_tur(pg_temp.pid(42), pg_temp.today(), 'welcome');
  perform public.srv_answer_create(pg_temp.uid(41), pg_temp.pid(42), 'Konser: Duman, kesin', null, null);
  perform public.srv_answer_create(pg_temp.uid(42), pg_temp.pid(41), 'Pazar kahvaltısı serpme', null, null);
end $$;
create temp table r2 as select
  public.srv_answer_respond(pg_temp.uid(42), (select id from public.answers where from_id = pg_temp.pid(41)), 'reciprocate', 'Harika') as x,
  public.srv_answer_respond(pg_temp.uid(41), (select id from public.answers where from_id = pg_temp.pid(42)), 'reciprocate', 'Süper') as y;
select is((select (x ->> 'tableId') = (y ->> 'tableId') from r2), true, 'MAS-04: two reciprocations open the same table');
select is((select count(*)::int from public.tables where a_id = least(pg_temp.pid(41), pg_temp.pid(42))
           and b_id = greatest(pg_temp.pid(41), pg_temp.pid(42))), 1, 'MAS-04: exactly one table for the pair');

-- MAS-05: a full table list means "waiting for a slot" -----------------------------------------------------------------
do $$ declare i int; begin
  perform pg_temp.mk(51, 'man', array['women'], 33, 'long_term', 7::smallint);
  perform pg_temp.mk(52, 'woman', array['men'], 33, 'long_term', 7::smallint);
  for i in 61..63 loop
    perform pg_temp.mk(i, 'man', array['men'], 50, 'friendship', 81::smallint);
    insert into public.tables (a_id, b_id, status)
    values (least(pg_temp.pid(52), pg_temp.pid(i)), greatest(pg_temp.pid(52), pg_temp.pid(i)), 'active');
  end loop;
  perform public.srv_generate_tur(pg_temp.pid(51), pg_temp.today(), 'welcome');
  perform public.srv_answer_create(pg_temp.uid(51), pg_temp.pid(52), 'Yürüyüş ve kahve', null, null);
end $$;
create temp table r3 as select public.srv_answer_respond(pg_temp.uid(52),
  (select id from public.answers where from_id = pg_temp.pid(51)), 'reciprocate', 'Olur') as r;
select is((select r ->> 'tableStatus' from r3), 'waiting_slot', 'MAS-05: a fourth table waits for a free slot');
select ok((select waiting_expires_at between now() + interval '71 hours' and now() + interval '73 hours'
           from public.tables where id = (select (r ->> 'tableId')::uuid from r3)), 'the waiting table expires in 72 hours');
do $$ begin
  update public.tables set waiting_expires_at = now() - interval '1 minute'
   where id = (select (r ->> 'tableId')::uuid from r3);
  perform public.srv_expire_daily();
end $$;
select is((select status from public.tables where id = (select (r ->> 'tableId')::uuid from r3)), 'expired',
          'MAS-05: a table still waiting after 72 hours drops');

-- §4.2: a pass is never shown to the sender ---------------------------------------------------------------------------------
do $$ begin
  perform pg_temp.mk(71, 'man', array['women'], 35, 'long_term', 42::smallint);
  perform pg_temp.mk(72, 'woman', array['men'], 35, 'long_term', 42::smallint);
  perform public.srv_generate_tur(pg_temp.pid(71), pg_temp.today(), 'welcome');
  perform public.srv_answer_create(pg_temp.uid(71), pg_temp.pid(72), 'Mantı mı, lahmacun mu?', null, null);
  perform public.srv_answer_respond(pg_temp.uid(72), (select id from public.answers where from_id = pg_temp.pid(71)), 'pass', null);
end $$;
select is(public.srv_inbox(pg_temp.uid(71)) -> 'outgoing' -> 0 ->> 'status', 'waiting', 'the sender still sees "waiting" after a pass');
select is(jsonb_array_length(public.srv_inbox(pg_temp.uid(72)) -> 'incoming'), 0, 'the passed answer leaves the inbox');

-- TUR-03, property-based: a random population, then every card checked independently --------------
do $$
declare i int;
begin
  perform setseed(0.42);
  for i in 100..139 loop
    perform pg_temp.mk(i,
      (array['woman', 'man', 'nonbinary', 'self_described'])[1 + floor(random() * 4)::int],
      case floor(random() * 4)::int when 0 then array['men'] when 1 then array['women']
        when 2 then array['women', 'men'] else array['women', 'men', 'nonbinary'] end,
      20 + floor(random() * 30)::int,
      (array['long_term', 'serious_unhurried', 'unsure', 'friendship'])[1 + floor(random() * 4)::int],
      (array[34, 6])[1 + floor(random() * 2)::int]::smallint);
  end loop;
  for i in 100..139 loop
    perform public.srv_generate_tur(pg_temp.pid(i), pg_temp.today(), 'welcome');
  end loop;
end $$;
select is((
  select count(*)::int
  from public.tur_cards tc
  join public.tur_batches tb on tb.id = tc.batch_id
  join public.profiles v on v.id = tb.profile_id
  join public.preferences vp on vp.profile_id = v.id
  join public.profiles c on c.id = tc.candidate_id
  join public.preferences cp on cp.profile_id = c.id
  where v.user_id between pg_temp.uid(100) and pg_temp.uid(139)
    and not (
      (case c.gender when 'woman' then 'women' when 'man' then 'men' else 'nonbinary' end) = any (v.seeking)
      and (case v.gender when 'woman' then 'women' when 'man' then 'men' else 'nonbinary' end) = any (c.seeking)
      and extract(year from age(now(), c.birth_date)) between vp.age_min and vp.age_max
      and extract(year from age(now(), v.birth_date)) between cp.age_min and cp.age_max
      and c.intent = any (vp.intents) and v.intent = any (cp.intents)
      and c.city_id = v.city_id and c.id <> v.id)), 0,
  'TUR-03: across a random population no card breaks a mutual filter');
select ok((select count(*) > 0 from public.tur_cards tc join public.tur_batches tb on tb.id = tc.batch_id
           join public.profiles v on v.id = tb.profile_id where v.user_id between pg_temp.uid(100) and pg_temp.uid(139)),
  'the random population does produce cards (the property is not vacuous)');

select * from finish();
rollback;
