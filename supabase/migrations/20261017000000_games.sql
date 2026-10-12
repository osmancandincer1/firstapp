-- Mini games at a table (owner's decision D-064, rules D-068).
--
-- The rules live in packages/shared/src/games.ts and run in the game function. The database
-- keeps the public state (readable by the table's two parties, live through Realtime), the
-- secret part in a private table the app can never read, and a version number so two moves
-- sent at the same moment cannot overwrite each other. One game at a time per table, only
-- while the table is open. Tested in supabase/tests/database/06_games.test.sql.

create table public.table_games (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables (id) on delete cascade,
  kind text not null check (kind in ('word_hunt', 'hangman', 'categories')),
  status text not null default 'active' check (status in ('active', 'won', 'lost', 'finished', 'abandoned')),
  started_by uuid not null references public.profiles (id) on delete cascade,
  turn_of uuid references public.profiles (id) on delete set null,
  state jsonb not null default '{}',
  version integer not null default 1,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index table_games_one_active on public.table_games (table_id) where status = 'active';
create index table_games_table_idx on public.table_games (table_id, created_at desc);
create trigger table_games_set_updated_at before update on public.table_games
  for each row execute function public.set_updated_at();

alter table public.table_games enable row level security;
revoke all on public.table_games from anon, authenticated;
grant select on public.table_games to authenticated;
create policy table_games_parties_read on public.table_games for select to authenticated
  using (exists (select 1 from public.tables t where t.id = table_id
                 and (select private.profile_id_of(auth.uid())) in (t.a_id, t.b_id)));

create table private.table_game_secrets (
  game_id uuid primary key references public.table_games (id) on delete cascade,
  secret jsonb not null default '{}'
);
alter table private.table_game_secrets enable row level security;
revoke all on private.table_game_secrets from public, anon, authenticated;

create or replace function private.game_json(g public.table_games)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', g.id, 'tableId', g.table_id, 'kind', g.kind, 'status', g.status,
                            'startedBy', g.started_by, 'turnOf', g.turn_of, 'state', g.state,
                            'version', g.version, 'createdAt', g.created_at);
$$;

-- Who is who at a table, for the game function: {me, other, status} or null for outsiders.
create or replace function public.srv_game_context(p_user_id uuid, p_table_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select private.profile_id_of(p_user_id) as id)
  select jsonb_build_object('me', me.id, 'other', case when t.a_id = me.id then t.b_id else t.a_id end,
                            'status', t.status)
  from public.tables t, me where t.id = p_table_id and me.id in (t.a_id, t.b_id);
$$;

-- {result: ok | not_found | not_active | busy, game?}. A short system message tells both sides.
create or replace function public.srv_game_start(
  p_user_id uuid, p_table_id uuid, p_kind text, p_state jsonb, p_secret jsonb, p_turn_of uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.profile_id_of(p_user_id);
  t public.tables;
  g public.table_games;
begin
  select * into t from public.tables where id = p_table_id and me in (a_id, b_id) for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if t.status <> 'active' then return jsonb_build_object('result', 'not_active'); end if;
  if exists (select 1 from public.table_games where table_id = t.id and status = 'active') then
    return jsonb_build_object('result', 'busy');
  end if;
  insert into public.table_games (table_id, kind, started_by, turn_of, state)
  values (t.id, p_kind, me, p_turn_of, p_state) returning * into g;
  insert into private.table_game_secrets (game_id, secret) values (g.id, coalesce(p_secret, '{}'));
  insert into public.messages (table_id, sender_id, kind, body)
  values (t.id, me, 'system', 'game_started:' || p_kind);
  return jsonb_build_object('result', 'ok', 'game', private.game_json(g));
end;
$$;

-- The game with its secret, for a party of an open table: {game, secret, me, other} or null.
create or replace function public.srv_game_load(p_user_id uuid, p_game_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select private.profile_id_of(p_user_id) as id)
  select jsonb_build_object('game', private.game_json(g), 'secret', s.secret, 'me', me.id,
                            'other', case when t.a_id = me.id then t.b_id else t.a_id end,
                            'tableStatus', t.status)
  from public.table_games g
  join public.tables t on t.id = g.table_id
  join private.table_game_secrets s on s.game_id = g.id, me
  where g.id = p_game_id and me.id in (t.a_id, t.b_id);
$$;

-- Saves a move if nobody moved in between: {result: ok | conflict | not_found, game?}.
create or replace function public.srv_game_save(
  p_user_id uuid, p_game_id uuid, p_version int, p_status text, p_turn_of uuid,
  p_state jsonb, p_secret jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.profile_id_of(p_user_id);
  g public.table_games;
begin
  update public.table_games x
     set status = p_status, turn_of = p_turn_of, state = p_state, version = x.version + 1,
         finished_at = case when p_status <> 'active' then now() end
   where x.id = p_game_id and x.version = p_version and x.status = 'active'
     and exists (select 1 from public.tables t where t.id = x.table_id and t.status = 'active'
                 and me in (t.a_id, t.b_id))
  returning * into g;
  if not found then
    if exists (select 1 from public.table_games where id = p_game_id) then
      return jsonb_build_object('result', 'conflict');
    end if;
    return jsonb_build_object('result', 'not_found');
  end if;
  update private.table_game_secrets set secret = coalesce(p_secret, '{}') where game_id = g.id;
  if p_status <> 'active' then
    insert into public.messages (table_id, sender_id, kind, body)
    values (g.table_id, me, 'system', 'game_' || p_status || ':' || g.kind);
  end if;
  return jsonb_build_object('result', 'ok', 'game', private.game_json(g));
end;
$$;

-- A table that stops being open ends its game: nobody can move any more.
create or replace function private.tables_end_games()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' and old.status = 'active' then
    update public.table_games set status = 'abandoned', turn_of = null, finished_at = now()
     where table_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;
create trigger tables_end_games after update of status on public.tables
  for each row execute function private.tables_end_games();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.table_games;
  end if;
end $$;

revoke all on function private.game_json(public.table_games), private.tables_end_games()
  from public, anon, authenticated;
revoke all on function public.srv_game_context(uuid, uuid), public.srv_game_start(uuid, uuid, text, jsonb, jsonb, uuid),
  public.srv_game_load(uuid, uuid), public.srv_game_save(uuid, uuid, int, text, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.srv_game_context(uuid, uuid), public.srv_game_start(uuid, uuid, text, jsonb, jsonb, uuid),
  public.srv_game_load(uuid, uuid), public.srv_game_save(uuid, uuid, int, text, uuid, jsonb, jsonb)
  to service_role;
