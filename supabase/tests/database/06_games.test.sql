-- Mini games at a table (D-064, D-068).
begin;
select plan(14);

create function pg_temp.uid(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.pid(n int) returns uuid language sql as $$
  select id from public.profiles where user_id = pg_temp.uid(n) $$;
do $$ begin
  for i in 701..703 loop
    insert into auth.users (id, email) values (pg_temp.uid(i), 'g' || i || '@example.com');
    update public.profiles set status = 'active', name = 'G' || i where user_id = pg_temp.uid(i);
  end loop;
end $$;
create function pg_temp.mktable() returns uuid language sql as $q$
  insert into public.tables (a_id, b_id, status, turn_of)
  values (least(pg_temp.pid(701), pg_temp.pid(702)), greatest(pg_temp.pid(701), pg_temp.pid(702)), 'active', pg_temp.pid(702))
  returning id $q$;
create temp table t as select pg_temp.mktable() as id;

select is(public.srv_game_context(pg_temp.uid(701), (select id from t)) ->> 'other', pg_temp.pid(702)::text,
  'the game function learns who the other player is');
select is(public.srv_game_context(pg_temp.uid(703), (select id from t)), null, '…but not for an outsider');

create temp table g1 as select public.srv_game_start(pg_temp.uid(701), (select id from t), 'hangman',
  '{"mask": "_____"}', '{"word": "kahve"}', pg_temp.pid(702)) as r;
select is((select r ->> 'result' from g1), 'ok', 'a party starts a game');
select is((select body from public.messages where table_id = (select id from t) and kind = 'system'),
  'game_started:hangman', 'both sides see that a game started');
select is(public.srv_game_start(pg_temp.uid(702), (select id from t), 'word_hunt', '{}', '{}', null) ->> 'result',
  'busy', 'one game at a time');
select is(public.srv_game_start(pg_temp.uid(703), (select id from t), 'word_hunt', '{}', '{}', null) ->> 'result',
  'not_found', 'an outsider cannot start one');

create temp table gid as select (r -> 'game' ->> 'id')::uuid as id from g1;
select is(public.srv_game_load(pg_temp.uid(702), (select id from gid)) -> 'secret' ->> 'word', 'kahve',
  'the game function reads the secret for a party');
select is(public.srv_game_load(pg_temp.uid(703), (select id from gid)), null, 'nobody else gets it');

select is(public.srv_game_save(pg_temp.uid(702), (select id from gid), 1, 'active', pg_temp.pid(702),
  '{"mask": "k____"}', '{"word": "kahve"}') ->> 'result', 'ok', 'a move is saved');
select is(public.srv_game_save(pg_temp.uid(702), (select id from gid), 1, 'active', pg_temp.pid(702),
  '{"mask": "ka___"}', '{"word": "kahve"}') ->> 'result', 'conflict', 'a move based on an old version is refused');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(702), 'role', 'authenticated')::text, true); end $$;
select is((select state ->> 'mask' from public.table_games), 'k____', 'a party reads the public state');
select throws_ok('select * from private.table_game_secrets', '42501', null, 'the secret is never readable by the app');
do $$ begin perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(703), 'role', 'authenticated')::text, true); end $$;
select is((select count(*)::int from public.table_games), 0, 'an outsider sees no games');
reset role;

update public.tables set status = 'closed', closed_at = now() where id = (select id from t);
select is((select status from public.table_games where id = (select id from gid)), 'abandoned',
  'closing the table ends its game');

select * from finish();
rollback;
