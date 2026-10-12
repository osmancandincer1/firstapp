-- Phase 4: tables and chat (APP.md §4.4, §13.5; decisions D-067).
--
-- Tested in supabase/tests/database/05_chat.test.sql. Rules:
--   * free users have 3 active tables (flag tables.free_slots); a reciprocation beyond that
--     waits up to 72 h for a slot (Phase 3) and is promoted, oldest first, when one frees up;
--   * the party whose turn it is gets "Sıra sende" at 24 h, a last call at 60 h, and at 72 h
--     the table cools: the slot frees, the chat becomes a read-only archive, and both sides
--     can reopen it within 7 days;
--   * time spent on a break (Mola, 1–7 days, at most twice per calendar month) does not count;
--   * Nazik Veda is the only way to close a table: the other side sees it and cannot answer;
--     the pair does not meet again in the Round for 180 days;
--   * blocking closes every table of the pair at once, with no farewell and no notice;
--   * messages are written by the chat function only; a client id makes sending idempotent.

alter table public.tables
  add column turn_since timestamptz not null default now(),
  add column nudged_at timestamptz,
  add column warned_at timestamptz,
  add column cooled_at timestamptz,
  add column closed_at timestamptz,
  add column farewell_key text,
  add column reopen_a boolean not null default false,
  add column reopen_b boolean not null default false;
update public.tables set turn_since = coalesce(last_message_at, created_at);

-- The reply clock restarts whenever the turn passes or a table (re)opens.
create or replace function private.tables_turn_clock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.turn_of is distinct from old.turn_of
     or (new.status = 'active' and old.status is distinct from 'active') then
    new.turn_since := now();
    new.nudged_at := null;
    new.warned_at := null;
  end if;
  return new;
end;
$$;
create trigger tables_turn_clock before update on public.tables
  for each row execute function private.tables_turn_clock();

create table public.pauses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at) -- equal when a break is ended at once
);
create index pauses_profile_idx on public.pauses (profile_id, ends_at);
alter table public.pauses enable row level security;
revoke all on public.pauses from anon, authenticated;
create trigger pauses_set_updated_at before update on public.pauses
  for each row execute function public.set_updated_at();

insert into public.feature_flags (key, value) values
  ('tables.nudge_hours', '24'),
  ('tables.warn_hours', '60'),
  ('tables.cool_hours', '72'),
  ('tables.reopen_days', '7'),
  ('tables.pauses_per_month', '2'),
  ('tables.farewell_tur_days', '180')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Clocks
-- ---------------------------------------------------------------------------

-- How much of [p_from, p_to] the person spent on a break.
create or replace function private.pause_overlap(p_profile uuid, p_from timestamptz, p_to timestamptz)
returns interval language sql stable security definer set search_path = '' as $$
  select coalesce(sum(least(ps.ends_at, p_to) - greatest(ps.starts_at, p_from)), interval '0')
  from public.pauses ps
  where ps.profile_id = p_profile and ps.starts_at < p_to and ps.ends_at > p_from;
$$;

-- Silence on a table as the clock sees it: time since the turn began, minus the break of
-- whoever owes the reply (MAS-06).
create or replace function private.table_silence(p_table public.tables, p_now timestamptz default now())
returns interval language sql stable security definer set search_path = '' as $$
  select (p_now - p_table.turn_since) - private.pause_overlap(p_table.turn_of, p_table.turn_since, p_now);
$$;

create or replace function private.paused_until(p_profile uuid, p_now timestamptz default now())
returns timestamptz language sql stable security definer set search_path = '' as $$
  select max(ends_at) from public.pauses where profile_id = p_profile and starts_at <= p_now and ends_at > p_now;
$$;

create or replace function private.active_count(p_profile uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.tables where status = 'active' and p_profile in (a_id, b_id);
$$;

-- Opens waiting tables of these people while both sides have a free slot, oldest first (MAS-05).
create or replace function private.promote_waiting(p_profiles uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_slots int := private.flag_num('tables.free_slots', 3)::int;
  t public.tables;
  n int := 0;
begin
  for t in
    select * from public.tables
    where status = 'waiting_slot' and waiting_expires_at > now()
      and (a_id = any (p_profiles) or b_id = any (p_profiles))
    order by created_at
    for update
  loop
    if private.active_count(t.a_id) < v_slots and private.active_count(t.b_id) < v_slots then
      update public.tables set status = 'active', waiting_expires_at = null where id = t.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Runs every 10 minutes: nudges, last calls, cooling, expiry of waiting tables (§4.4, MAS-05/06).
-- Notifications themselves arrive with Phase 7; the markers below are what they will read.
create or replace function public.srv_table_timers(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nudge interval := make_interval(hours => private.flag_num('tables.nudge_hours', 24)::int);
  v_warn interval := make_interval(hours => private.flag_num('tables.warn_hours', 60)::int);
  v_cool interval := make_interval(hours => private.flag_num('tables.cool_hours', 72)::int);
  v_cooled uuid[];
  v_cooled_n int;
  v_expired int;
  v_nudged int;
  v_warned int;
begin
  with c as (
    update public.tables t set status = 'cooled', cooled_at = p_now
    where t.status = 'active' and private.table_silence(t, p_now) >= v_cool
    returning t.a_id, t.b_id
  )
  select (select count(*) from c),
         coalesce((select array_agg(distinct x) from (select a_id as x from c union all select b_id from c) s), '{}')
    into v_cooled_n, v_cooled;

  update public.tables set status = 'expired', closed_at = p_now
  where status = 'waiting_slot' and waiting_expires_at <= p_now;
  get diagnostics v_expired = row_count;

  update public.tables t set warned_at = p_now
  where t.status = 'active' and t.warned_at is null and private.table_silence(t, p_now) >= v_warn;
  get diagnostics v_warned = row_count;

  update public.tables t set nudged_at = p_now
  where t.status = 'active' and t.nudged_at is null and private.table_silence(t, p_now) >= v_nudge;
  get diagnostics v_nudged = row_count;

  perform private.promote_waiting(v_cooled);
  return jsonb_build_object('cooled', v_cooled_n, 'expired', v_expired,
                            'warned', v_warned, 'nudged', v_nudged);
end;
$$;

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------

-- {result: ok | not_found | not_active, message?}. Re-sending the same client id returns the
-- stored message, so a retry after a lost response never duplicates (SOH-01, SOH-02).
create or replace function public.srv_message_send(
  p_user_id uuid, p_table_id uuid, p_client_id uuid, p_kind text, p_body text,
  p_media_path text default null, p_reply_to uuid default null, p_flags jsonb default '{}'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.profile_id_of(p_user_id);
  t public.tables;
  m public.messages;
begin
  select * into t from public.tables where id = p_table_id and me in (a_id, b_id) for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;

  select * into m from public.messages where table_id = p_table_id and client_id = p_client_id;
  if found then return jsonb_build_object('result', 'ok', 'message', private.message_json(m)); end if;
  if t.status <> 'active' then return jsonb_build_object('result', 'not_active'); end if;

  insert into public.messages (table_id, sender_id, kind, body, media_path, reply_to, flags, client_id)
  values (p_table_id, me, p_kind, p_body, p_media_path,
          (select id from public.messages where id = p_reply_to and table_id = p_table_id),
          coalesce(p_flags, '{}'), p_client_id)
  returning * into m;
  update public.tables set last_message_at = m.created_at,
         turn_of = case when a_id = me then b_id else a_id end
   where id = p_table_id;
  return jsonb_build_object('result', 'ok', 'message', private.message_json(m));
end;
$$;

create or replace function private.message_json(m public.messages)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'tableId', m.table_id, 'senderId', m.sender_id, 'kind', m.kind,
                            'body', m.body, 'replyTo', m.reply_to, 'flags', m.flags,
                            'clientId', m.client_id, 'createdAt', m.created_at);
$$;

-- Marks the other side's messages as read; returns how many changed.
create or replace function public.srv_messages_read(p_user_id uuid, p_table_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare me uuid := private.profile_id_of(p_user_id); n int;
begin
  update public.messages m set read_at = now()
  from public.tables t
  where t.id = p_table_id and me in (t.a_id, t.b_id)
    and m.table_id = t.id and m.sender_id <> me and m.read_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Closing, reopening, blocking, breaks
-- ---------------------------------------------------------------------------

-- 'ok' | 'not_found' | 'already_closed'. Works on waiting, active and cooled tables (MAS-07).
create or replace function public.srv_table_farewell(p_user_id uuid, p_table_id uuid, p_key text, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := private.profile_id_of(p_user_id); t public.tables;
begin
  select * into t from public.tables where id = p_table_id and me in (a_id, b_id) for update;
  if not found then return 'not_found'; end if;
  if t.status not in ('waiting_slot', 'active', 'cooled') then return 'already_closed'; end if;
  update public.tables set status = 'closed', closed_by = me, closed_at = now(),
         farewell_key = p_key, farewell_text = nullif(btrim(p_note), '')
   where id = t.id;
  perform private.promote_waiting(array[t.a_id, t.b_id]);
  return 'ok';
end;
$$;

-- 'reopened' | 'waiting_other' | 'waiting_slot' | 'not_found' | 'too_late'.
create or replace function public.srv_table_reopen(p_user_id uuid, p_table_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.profile_id_of(p_user_id);
  t public.tables;
  v_slots int := private.flag_num('tables.free_slots', 3)::int;
begin
  select * into t from public.tables where id = p_table_id and me in (a_id, b_id) for update;
  if not found or t.status <> 'cooled' then return 'not_found'; end if;
  if t.cooled_at < now() - make_interval(days => private.flag_num('tables.reopen_days', 7)::int) then
    return 'too_late';
  end if;
  if me = t.a_id then t.reopen_a := true; else t.reopen_b := true; end if;
  if not (t.reopen_a and t.reopen_b) then
    update public.tables set reopen_a = t.reopen_a, reopen_b = t.reopen_b where id = t.id;
    return 'waiting_other';
  end if;
  -- Whoever had the turn still has it; the clock restarts with the reopening.
  if exists (select 1 from public.tables x where x.id <> t.id and x.status in ('waiting_slot', 'active')
             and x.a_id = t.a_id and x.b_id = t.b_id) then
    return 'not_found';
  end if;
  if private.active_count(t.a_id) < v_slots and private.active_count(t.b_id) < v_slots then
    update public.tables set status = 'active', reopen_a = false, reopen_b = false, cooled_at = null
     where id = t.id;
    return 'reopened';
  end if;
  update public.tables set status = 'waiting_slot', reopen_a = false, reopen_b = false, cooled_at = null,
         waiting_expires_at = now() + interval '72 hours'
   where id = t.id;
  return 'waiting_slot';
end;
$$;

-- Blocks the other party of a table: every open or archived table of the pair ends with no
-- farewell, the block applies both ways in the Round (MAS-08). 'ok' | 'not_found'.
create or replace function public.srv_block_from_table(p_user_id uuid, p_table_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := private.profile_id_of(p_user_id); t public.tables; other uuid;
begin
  select * into t from public.tables where id = p_table_id and me in (a_id, b_id);
  if not found then return 'not_found'; end if;
  other := case when t.a_id = me then t.b_id else t.a_id end;
  insert into public.blocks (blocker_id, blocked_id) values (me, other) on conflict do nothing;
  update public.tables set status = 'blocked', closed_by = me, closed_at = now(),
         farewell_key = null, farewell_text = null
   where a_id = t.a_id and b_id = t.b_id and status in ('waiting_slot', 'active', 'cooled');
  perform private.promote_waiting(array[t.a_id, t.b_id]);
  return 'ok';
end;
$$;

-- {result: ok | invalid | limit | not_found, until?}. 1–7 days, at most N per calendar month (Istanbul).
create or replace function public.srv_pause_start(p_user_id uuid, p_days int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.profile_id_of(p_user_id);
  v_month timestamptz := date_trunc('month', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_until timestamptz;
begin
  if me is null then return jsonb_build_object('result', 'not_found'); end if;
  if p_days is null or p_days not between 1 and 7 then return jsonb_build_object('result', 'invalid'); end if;
  if private.paused_until(me) is not null then return jsonb_build_object('result', 'invalid'); end if;
  if (select count(*) from public.pauses where profile_id = me and starts_at >= v_month)
     >= private.flag_num('tables.pauses_per_month', 2) then
    return jsonb_build_object('result', 'limit');
  end if;
  v_until := now() + make_interval(days => p_days);
  insert into public.pauses (profile_id, ends_at) values (me, v_until);
  return jsonb_build_object('result', 'ok', 'until', v_until);
end;
$$;

create or replace function public.srv_pause_end(p_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := private.profile_id_of(p_user_id);
begin
  update public.pauses set ends_at = now() where profile_id = me and starts_at <= now() and ends_at > now();
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Reply reliability (§4.4, MAS-10): median reply time over 30 days, shown only with data from
-- at least 5 tables. A table left to cool counts as a 72-hour reply.
-- ---------------------------------------------------------------------------
create or replace function public.srv_update_reply_medians()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with replies as (
    select m.sender_id as profile_id, m.table_id,
           extract(epoch from m.created_at - lag(m.created_at) over w) / 60 as minutes,
           lag(m.sender_id) over w as prev_sender
    from public.messages m
    where m.kind <> 'system' and m.created_at > now() - interval '30 days'
    window w as (partition by m.table_id order by m.created_at)
  ), samples as (
    select profile_id, table_id, minutes from replies where prev_sender is not null and prev_sender <> profile_id
    union all
    select t.turn_of, t.id, private.flag_num('tables.cool_hours', 72) * 60
    from public.tables t where t.cooled_at > now() - interval '30 days' and t.turn_of is not null
  ), stats as (
    select profile_id, count(distinct table_id) as tables,
           percentile_cont(0.5) within group (order by minutes) as median
    from samples group by profile_id
  )
  update public.profiles p
     set reply_median_minutes = case when s.tables >= 5 then round(s.median::numeric, 1) end
    from stats s where s.profile_id = p.id;
  get diagnostics n = row_count;
  update public.profiles p set reply_median_minutes = null
   where p.reply_median_minutes is not null
     and not exists (select 1 from public.messages m where m.sender_id = p.id and m.created_at > now() - interval '30 days');
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- What the Tables tab and the chat header read
-- ---------------------------------------------------------------------------
create or replace function public.srv_my_tables(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select private.profile_id_of(p_user_id) as id)
  select coalesce(jsonb_agg(jsonb_build_object(
      -- The blocked side only learns that the chat ended (§4.4).
      'tableId', t.id,
      'status', case when t.status = 'blocked' and t.closed_by <> me.id then 'ended' else t.status end,
      'waitingExpiresAt', t.waiting_expires_at,
      'lastMessageAt', t.last_message_at, 'myTurn', t.turn_of = me.id, 'turnSince', t.turn_since,
      'cooledAt', t.cooled_at, 'closedAt', t.closed_at,
      'closedByMe', t.closed_by = me.id,
      -- The farewell is shown to the other side only; a block shows nothing but "ended".
      'farewell', case when t.status = 'closed' and t.closed_by <> me.id
                       then jsonb_build_object('key', t.farewell_key, 'note', t.farewell_text) end,
      'iAskedReopen', case when t.a_id = me.id then t.reopen_a else t.reopen_b end,
      'theyAskedReopen', case when t.a_id = me.id then t.reopen_b else t.reopen_a end,
      'otherPausedUntil', private.paused_until(case when t.a_id = me.id then t.b_id else t.a_id end),
      'unread', (select count(*) from public.messages m
                 where m.table_id = t.id and m.sender_id <> me.id and m.read_at is null),
      'lastMessage', (select jsonb_build_object('body', m.body, 'kind', m.kind, 'mine', m.sender_id = me.id)
                      from public.messages m where m.table_id = t.id order by m.created_at desc limit 1),
      'otherId', case when t.a_id = me.id then t.b_id else t.a_id end,
      'profile', case when t.status = 'blocked' then null
                      else public.srv_public_profile(case when t.a_id = me.id then t.b_id else t.a_id end) end)
    order by t.status = 'active' desc, t.status = 'waiting_slot' desc, coalesce(t.last_message_at, t.created_at) desc), '[]')
  from public.tables t, me
  where me.id in (t.a_id, t.b_id)
    and (t.status in ('waiting_slot', 'active')
         or (t.status = 'cooled' and t.cooled_at > now() - make_interval(days => private.flag_num('tables.reopen_days', 7)::int))
         or (t.status in ('closed', 'expired', 'blocked') and t.closed_at > now() - interval '7 days'));
$$;

create or replace function public.srv_my_pause(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select private.profile_id_of(p_user_id) as id)
  select jsonb_build_object(
    'until', private.paused_until(me.id),
    'usedThisMonth', (select count(*) from public.pauses p
                      where p.profile_id = me.id
                        and p.starts_at >= date_trunc('month', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul'),
    'perMonth', private.flag_num('tables.pauses_per_month', 2))
  from me;
$$;

-- The Round: a pair that said goodbye does not meet again for 180 days, and a cooled table's
-- pair stays out while it can still be reopened (MAS-07). Same as Phase 3 otherwise.
create or replace function private.recently_seen(p_viewer uuid, p_candidate uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.tur_cards tc join public.tur_batches tb on tb.id = tc.batch_id
      where tb.profile_id = p_viewer and tc.candidate_id = p_candidate
        and ((tc.action = 'passed' and tc.acted_at > now() - interval '60 days')
             or tc.created_at > now() - interval '14 days'))
    or exists (select 1 from public.answers a
               where a.status = 'pending' and a.expires_at > now()
                 and ((a.from_id = p_viewer and a.to_id = p_candidate) or (a.from_id = p_candidate and a.to_id = p_viewer)))
    or exists (select 1 from public.saved_cards s
               where s.profile_id = p_viewer and s.candidate_id = p_candidate and s.expires_at > now())
    or exists (select 1 from public.tables t
               where t.a_id = least(p_viewer, p_candidate) and t.b_id = greatest(p_viewer, p_candidate)
                 and (t.status in ('waiting_slot', 'active', 'cooled')
                      or (t.status = 'closed' and t.closed_at >
                          now() - make_interval(days => private.flag_num('tables.farewell_tur_days', 180)::int))));
$$;

-- ---------------------------------------------------------------------------
-- Realtime: parties receive new messages and table changes through RLS (§13.5).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.tables;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Grants and schedules
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, n.nspname as schema from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in ('srv_table_timers', 'srv_message_send', 'srv_messages_read',
             'srv_table_farewell', 'srv_table_reopen', 'srv_block_from_table', 'srv_pause_start', 'srv_pause_end',
             'srv_update_reply_medians', 'srv_my_tables', 'srv_my_pause'))
       or (n.nspname = 'private' and p.proname in ('tables_turn_clock', 'pause_overlap', 'table_silence',
             'paused_until', 'active_count', 'promote_waiting', 'message_json', 'recently_seen'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.schema = 'public' then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $cron$select cron.schedule('table-timers', '*/10 * * * *',
      $job$select public.srv_table_timers()$job$)$cron$;
    -- 04:00 Istanbul = 01:00 UTC.
    execute $cron$select cron.schedule('reply-medians', '0 1 * * *',
      $job$select public.srv_update_reply_medians()$job$)$cron$;
  end if;
end $$;
