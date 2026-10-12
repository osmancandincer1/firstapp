-- Tables and chat (APP.md §4.4, §13.5; MAS-05..MAS-10, SOH-01..SOH-03; D-067).
begin;
select plan(42);

create function pg_temp.uid(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.pid(n int) returns uuid language sql as $$
  select id from public.profiles where user_id = pg_temp.uid(n) $$;
create function pg_temp.mk(p_n int) returns uuid language plpgsql as $$
declare v_pid uuid;
begin
  insert into auth.users (id, email) values (pg_temp.uid(p_n), 'c' || p_n || '@example.com');
  update public.profiles set status = 'active', name = 'C' || p_n, verified_at = now(),
    onboarding_completed_at = now(), last_active_at = now()
  where user_id = pg_temp.uid(p_n) returning id into v_pid;
  return v_pid;
end $$;
-- An open table between two people; `ago` is how long the current turn has been running.
create function pg_temp.tbl(p_x int, p_y int, p_status text default 'active', p_turn int default null,
                            p_ago interval default '0')
returns uuid language plpgsql as $$
declare v_id uuid; x uuid := pg_temp.pid(p_x); y uuid := pg_temp.pid(p_y);
begin
  insert into public.tables (a_id, b_id, status, turn_of, last_message_at, waiting_expires_at)
  values (least(x, y), greatest(x, y), p_status, pg_temp.pid(coalesce(p_turn, p_y)), now() - p_ago,
          case when p_status = 'waiting_slot' then now() + interval '72 hours' end)
  returning id into v_id;
  update public.tables set turn_since = now() - p_ago where id = v_id;
  return v_id;
end $$;
create function pg_temp.st(p_id uuid) returns text language sql as $$
  select status from public.tables where id = p_id $$;
create function pg_temp.mine(p_n int, p_id uuid) returns jsonb language sql as $$
  select e from jsonb_array_elements(public.srv_my_tables(pg_temp.uid(p_n))) e where e ->> 'tableId' = p_id::text $$;

do $$ begin
  for i in 601..612 loop perform pg_temp.mk(i); end loop;
end $$;

-- Sending (SOH-01, SOH-02, SOH-03) ---------------------------------------------------------------
create temp table t1 as select pg_temp.tbl(601, 602, 'active', 601) as id;
create temp table s1 as select public.srv_message_send(pg_temp.uid(601), (select id from t1),
  '11111111-1111-4111-8111-111111111111', 'text', 'Merhaba, kahve sever misin?') as r;
select is((select r ->> 'result' from s1), 'ok', 'a party can send a message');
select is((select turn_of from public.tables where id = (select id from t1)), pg_temp.pid(602),
  'sending passes the turn to the other side');
select is(public.srv_message_send(pg_temp.uid(601), (select id from t1),
  '11111111-1111-4111-8111-111111111111', 'text', 'Merhaba, kahve sever misin?') -> 'message' ->> 'id',
  (select r -> 'message' ->> 'id' from s1), 'the same client id returns the stored message (idempotent)');
select is((select count(*)::int from public.messages where table_id = (select id from t1)), 1,
  'a retried send is stored exactly once');
select is(public.srv_message_send(pg_temp.uid(603), (select id from t1),
  '22222222-2222-4222-8222-222222222222', 'text', 'Ben de buradayım') ->> 'result', 'not_found',
  'someone outside the table cannot write to it');
select ok(public.srv_messages_read(pg_temp.uid(602), (select id from t1)) = 1
          and public.srv_messages_read(pg_temp.uid(602), (select id from t1)) = 0,
  'reading marks the other side''s messages once');

-- Pattern flags (SOH-04, SOH-05) ------------------------------------------------------------------
update public.profiles set created_at = now() - interval '3 days' where id = pg_temp.pid(602);
select is(public.srv_message_send(pg_temp.uid(602), (select id from t1), gen_random_uuid(), 'text',
  'Bak: example.com', null, null, '{"link": true}') ->> 'result', 'link_blocked',
  'an account younger than 7 days cannot send links');
select ok(public.srv_message_send(pg_temp.uid(601), (select id from t1), gen_random_uuid(), 'text',
  'WhatsApp’tan yazsana', null, null, '{"offPlatform": true}') -> 'message' -> 'flags' ? 'offPlatform',
  'in the first 48 hours an off-platform nudge is flagged for the recipient');
update public.tables set created_at = now() - interval '3 days' where id = (select id from t1);
select ok(not (public.srv_message_send(pg_temp.uid(601), (select id from t1), gen_random_uuid(), 'text',
  'WhatsApp’tan yazsana', null, null, '{"offPlatform": true}') -> 'message' -> 'flags' ? 'offPlatform'),
  'after 48 hours it is not flagged any more');

-- Voice messages (SOH-10): only the parties can resolve the recording's path.
create temp table v1 as select public.srv_message_send(pg_temp.uid(601), (select id from t1), gen_random_uuid(),
  'voice', null, 'u_x/messages/v1.m4a') -> 'message' ->> 'id' as id;
select is(public.srv_message_media(pg_temp.uid(602), (select id::uuid from v1)), 'u_x/messages/v1.m4a',
  'a party gets the voice message path');
select is(public.srv_message_media(pg_temp.uid(603), (select id::uuid from v1)), null,
  'someone else does not');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(603), 'role', 'authenticated')::text, true); end $$;
select is((select count(*)::int from public.messages), 0, 'SOH-03: an outsider reads no messages');
do $$ begin perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(602), 'role', 'authenticated')::text, true); end $$;
select is((select count(*)::int from public.messages), 4, 'a party reads the table''s messages');
select throws_ok($$insert into public.messages (table_id, sender_id, kind, body)
  values ((select id from t1), pg_temp.pid(602), 'text', 'doğrudan')$$, '42501', null,
  'messages cannot be written directly');
reset role;

-- Clocks (MAS-06) -------------------------------------------------------------------------------------
create temp table t2 as select pg_temp.tbl(603, 604, 'active', 604, interval '25 hours') as id;
create temp table t3 as select pg_temp.tbl(603, 605, 'active', 605, interval '61 hours') as id;
create temp table t4 as select pg_temp.tbl(606, 607, 'active', 607, interval '73 hours') as id;
create temp table t5 as select pg_temp.tbl(606, 608, 'active', 608, interval '80 hours') as id;
-- 608 was on a 10-hour break during that silence: 70 hours count.
insert into public.pauses (profile_id, starts_at, ends_at)
values (pg_temp.pid(608), now() - interval '50 hours', now() - interval '40 hours');
create temp table timers1 as select public.srv_table_timers() as r;

select ok((select nudged_at is not null and warned_at is null from public.tables where id = (select id from t2)),
  '24 hours of silence: "Sıra sende"');
select ok((select warned_at is not null from public.tables where id = (select id from t3)),
  '60 hours: the last call');
select is(pg_temp.st((select id from t4)), 'cooled', '72 hours: the table cools');
select is(pg_temp.st((select id from t5)), 'active', 'time on a break does not count');
select ok(private.table_silence((select t from public.tables t where id = (select id from t5)))
          between interval '69 hours' and interval '71 hours', 'silence minus the break is about 70 hours');
select ok((select (r ->> 'cooled')::int >= 1 from timers1), 'the timer job reports what it did');

do $$ begin
  perform public.srv_message_send(pg_temp.uid(604), (select id from t2), gen_random_uuid(), 'text', 'Kusura bakma, yoğundum');
end $$;
select ok((select nudged_at is null and turn_of = pg_temp.pid(603) from public.tables where id = (select id from t2)),
  'a reply restarts the clock for the other side');

-- Slots: cooling frees one and the oldest waiting table opens (MAS-05) ---------------------------------
create temp table w as select
  pg_temp.tbl(609, 610) as a1, pg_temp.tbl(609, 611) as a2,
  pg_temp.tbl(609, 612, 'active', 612, interval '73 hours') as a3,
  pg_temp.tbl(609, 601, 'waiting_slot') as waiting;
select is(private.active_count(pg_temp.pid(609)), 3, 'three active tables');
do $$ begin perform public.srv_table_timers(); end $$;
select is(pg_temp.st((select waiting from w)), 'active', 'when a slot frees up, the waiting table opens');
select is(private.active_count(pg_temp.pid(609)), 3, 'never more than three at once');
update public.tables set waiting_expires_at = now() - interval '1 minute', status = 'waiting_slot'
 where id = (select a2 from w);
do $$ begin perform public.srv_table_timers(); end $$;
select is(pg_temp.st((select a2 from w)), 'expired', 'a table that waited 72 hours drops');

-- Nazik Veda (MAS-07) ---------------------------------------------------------------------------------
select is(public.srv_table_farewell(pg_temp.uid(609), (select a1 from w), 'not_a_match', 'Sana iyi şanslar!'), 'ok',
  'a farewell closes the table');
select is(public.srv_message_send(pg_temp.uid(610), (select a1 from w), gen_random_uuid(), 'text', 'Ama neden?') ->> 'result',
  'not_active', 'nobody can write after a farewell');
select is(pg_temp.mine(610, (select a1 from w)) -> 'farewell' ->> 'note', 'Sana iyi şanslar!',
  'the other side reads the farewell');
select is(pg_temp.mine(609, (select a1 from w)) -> 'farewell', 'null'::jsonb, 'the one who left does not get it back');
select ok(private.recently_seen(pg_temp.pid(609), pg_temp.pid(610)) and private.recently_seen(pg_temp.pid(610), pg_temp.pid(609)),
  'the pair stays out of each other''s Round');
update public.tables set closed_at = now() - interval '181 days' where id = (select a1 from w);
select ok(not private.recently_seen(pg_temp.pid(609), pg_temp.pid(610)), '…for 180 days');

-- Reopening a cooled table -------------------------------------------------------------------------------
select is(public.srv_table_reopen(pg_temp.uid(606), (select id from t4)), 'waiting_other', 'one side asks to reopen');
select is(pg_temp.mine(607, (select id from t4)) ->> 'theyAskedReopen', 'true', 'the other side sees the request');
select is(public.srv_table_reopen(pg_temp.uid(607), (select id from t4)), 'reopened', 'both asked: the table reopens');
update public.tables set status = 'cooled', cooled_at = now() - interval '8 days' where id = (select id from t4);
select is(public.srv_table_reopen(pg_temp.uid(606), (select id from t4)), 'too_late', 'after 7 days it stays archived');

-- Blocking (MAS-08) ------------------------------------------------------------------------------------------
select is(public.srv_block_from_table(pg_temp.uid(603), (select id from t3)), 'ok', 'blocking from a table');
select is(pg_temp.mine(605, (select id from t3)) ->> 'status', 'ended', 'the blocked side only sees "ended"');
select ok(pg_temp.mine(605, (select id from t3)) -> 'farewell' = 'null'::jsonb
          and pg_temp.mine(605, (select id from t3)) -> 'profile' = 'null'::jsonb,
  'no farewell and no profile after a block');

-- Mola -------------------------------------------------------------------------------------------------------
select is(public.srv_pause_start(pg_temp.uid(611), 8) ->> 'result', 'invalid', 'a break is 1–7 days');
do $$ begin
  perform public.srv_pause_start(pg_temp.uid(611), 2);
  perform public.srv_pause_end(pg_temp.uid(611));
  perform public.srv_pause_start(pg_temp.uid(611), 1);
  perform public.srv_pause_end(pg_temp.uid(611));
end $$;
select is(public.srv_pause_start(pg_temp.uid(611), 3) ->> 'result', 'limit', 'at most two breaks a month');

-- Reply reliability (MAS-10) ------------------------------------------------------------------------------
do $$ begin perform public.srv_update_reply_medians(); end $$;
select is((select reply_median_minutes from public.profiles where id = pg_temp.pid(604)), null,
  'no badge with data from fewer than 5 tables');
-- 630 answers in 5 tables: in 20, 30, 30, 40 and 90 minutes → median 30.
do $$
declare t uuid; d int;
begin
  perform pg_temp.mk(630);
  for i in 1..5 loop
    perform pg_temp.mk(630 + i);
    t := pg_temp.tbl(630, 630 + i);
    d := (array[20, 30, 30, 40, 90])[i];
    insert into public.messages (table_id, sender_id, kind, body, created_at) values
      (t, pg_temp.pid(630 + i), 'text', 'Selam', now() - interval '2 days'),
      (t, pg_temp.pid(630), 'text', 'Selam!', now() - interval '2 days' + make_interval(mins => d));
  end loop;
  perform public.srv_update_reply_medians();
end $$;
select is((select reply_median_minutes from public.profiles where id = pg_temp.pid(630)), 30.0,
  'the badge is the median reply time over 30 days');

select * from finish();
rollback;
