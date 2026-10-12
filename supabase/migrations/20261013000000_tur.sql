-- Phase 3 — the Round (Tur), answers and the start of tables
-- (APP.md §4.1, §4.2, §4.6, §5, §6.6, §13.3, §13.4).
--
-- Tested in supabase/tests/database/03_tur.test.sql. Key rules:
--   * a Round is generated at most once per user, date and kind (TUR-01);
--   * every filter is mutual and nothing outside the filters is ever added (TUR-03, TUR-06);
--   * payment is not an input of the score (TUR-07, §9.1);
--   * a pass is never revealed to the person who answered (§4.2);
--   * two reciprocations of the same pair open one table (MAS-04).

-- Every city is open: users pick their own city (D-050).
update public.cities set status = 'open';

alter table public.profiles add column reply_median_minutes numeric;

-- ---------------------------------------------------------------------------
-- Preferences (§6.6 basic filters; advanced filters come with Plus)
-- ---------------------------------------------------------------------------
create table public.preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  age_min smallint not null check (age_min between 18 and 99),
  age_max smallint not null check (age_max between 18 and 99),
  distance_km smallint check (distance_km in (5, 10, 25, 50, 100)), -- null = whole city
  intents text[] not null check (cardinality(intents) > 0
    and intents <@ array['long_term', 'serious_unhurried', 'unsure', 'friendship']),
  voice_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (age_max - age_min >= 4)
);

-- Blocks (§7.4). The block action itself arrives in Phase 5; the Round honours it already.
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------------------------------------------------------------------------
-- Rounds
-- ---------------------------------------------------------------------------
create table public.tur_batches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tur_date date not null,
  kind text not null check (kind in ('evening', 'welcome', 'noon', 'on_demand')),
  seq smallint not null default 1, -- several on-demand Rounds a day (D-063)
  opens_at timestamptz not null,
  generated_at timestamptz,
  pool_size integer,
  hint jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, tur_date, kind, seq)
);
create index tur_batches_profile_idx on public.tur_batches (profile_id, opens_at desc);

create table public.tur_cards (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.tur_batches (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 0 and 8),
  reasons jsonb not null default '{}',
  score numeric not null,
  dominant text not null,
  action text not null default 'none' check (action in ('none', 'answered', 'passed', 'saved')),
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, candidate_id),
  unique (batch_id, position)
);
create index tur_cards_candidate_idx on public.tur_cards (candidate_id, created_at);

-- "Sonraya sakla" (§4.1): private, at most 9, for 7 days.
create table public.saved_cards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, candidate_id)
);

-- "Bunun gibileri daha az göster" (§4.1): lowers a reason's weight for this user.
create table public.less_like_this (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  reason_key text not null,
  weight_delta numeric not null default 5 check (weight_delta between 0 and 15),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, reason_key)
);

-- ---------------------------------------------------------------------------
-- Answers and tables
-- ---------------------------------------------------------------------------
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  question_snapshot jsonb not null,
  text text check (char_length(text) between 10 and 200),
  voice_path text,
  voice_ms integer check (voice_ms between 3000 and 20000),
  status text not null default 'pending'
    check (status in ('pending', 'reciprocated', 'passed', 'expired', 'reported')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((text is null) <> (voice_path is null)),
  check (from_id <> to_id)
);
create unique index answers_one_pending on public.answers (from_id, to_id) where status = 'pending';
create index answers_to_idx on public.answers (to_id, status, created_at desc);
create index answers_from_idx on public.answers (from_id, created_at desc);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  a_id uuid not null references public.profiles (id) on delete cascade,
  b_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('waiting_slot', 'active', 'cooled', 'closed', 'blocked', 'expired')),
  turn_of uuid references public.profiles (id),
  last_message_at timestamptz,
  waiting_expires_at timestamptz,
  closed_by uuid references public.profiles (id),
  farewell_text text,
  photos_allowed_a boolean not null default false,
  photos_allowed_b boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (a_id < b_id)
);
-- One open table per pair, whoever reciprocates first (MAS-04).
create unique index tables_one_open on public.tables (a_id, b_id) where status in ('waiting_slot', 'active');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('text', 'voice', 'photo', 'plan', 'system')),
  body text,
  media_path text,
  reply_to uuid references public.messages (id),
  read_at timestamptz,
  flags jsonb not null default '{}',
  deleted_at timestamptz,
  client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (table_id, client_id)
);
create index messages_table_idx on public.messages (table_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['preferences', 'blocks', 'tur_batches', 'tur_cards', 'saved_cards',
                           'less_like_this', 'answers', 'tables', 'messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
end $$;

-- Parties of a table may read it and its messages (chat arrives in Phase 4; writes stay server-side).
grant select on public.tables, public.messages to authenticated;
create policy tables_parties_read on public.tables for select to authenticated
  using ((select private.profile_id_of(auth.uid())) in (a_id, b_id));
create policy messages_parties_read on public.messages for select to authenticated
  using (exists (select 1 from public.tables t where t.id = table_id
                 and (select private.profile_id_of(auth.uid())) in (t.a_id, t.b_id)));
grant execute on function private.profile_id_of(uuid) to authenticated;
grant usage on schema private to authenticated;

insert into public.feature_flags (key, value) values
  ('tur.weights', '{"intent": 25, "common": 20, "fair": 20, "reliability": 15, "activity": 10, "completeness": 10}'),
  ('tur.min_weekly_impressions', '30'),
  ('tur.diversity_max', '4'),
  -- 'on_demand': a new Round whenever the last one is done (launch); 'scheduled': 12:00 and 21:00 (D-062, D-063).
  ('tur.mode', '"on_demand"'),
  -- On-demand Rounds per day; 0 = no limit.
  ('tur.daily_max', '0'),
  ('answers.daily_limit', '15'),
  ('answers.pending_limit', '15'),
  ('tables.free_slots', '3')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.flag_num(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::numeric from public.feature_flags where key = p_key), p_default);
$$;

create or replace function private.age_of(p_birth date)
returns int language sql stable set search_path = '' as $$
  select extract(year from age((now() at time zone 'Europe/Istanbul')::date, p_birth))::int;
$$;

-- Self-described gender is matched as "non-binary people" (D-051).
create or replace function private.gender_bucket(p_gender text)
returns text language sql immutable set search_path = '' as $$
  select case p_gender when 'woman' then 'women' when 'man' then 'men' else 'nonbinary' end;
$$;

create or replace function private.intent_rank(p_intent text)
returns int language sql immutable set search_path = '' as $$
  select array_position(array['long_term', 'serious_unhurried', 'unsure', 'friendship'], p_intent);
$$;

create or replace function private.distance_km(p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric)
returns numeric language sql immutable set search_path = '' as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)));
$$;

-- Whole city when no distance is set, or when either side has no approximate location.
create or replace function private.location_ok(
  p_city smallint, p_lat numeric, p_lng numeric, p_distance smallint,
  p_other_city smallint, p_other_lat numeric, p_other_lng numeric)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_distance is null or p_lat is null or p_other_lat is null then p_city = p_other_city
    else private.distance_km(p_lat, p_lng, p_other_lat, p_other_lng) <= p_distance
  end;
$$;

-- Must-haves (§6.4): only values the other person shows count; hidden or empty fails (D-052).
create or replace function private.dealbreakers_ok(p_rules jsonb, p_details jsonb, p_visibility jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(bool_and(
    coalesce((p_visibility ->> (r ->> 'field'))::boolean, true)
    and p_details ? (r ->> 'field')
    and case jsonb_typeof(p_details -> (r ->> 'field'))
          when 'array' then exists (
            select 1 from jsonb_array_elements_text(p_details -> (r ->> 'field')) v
            where v in (select jsonb_array_elements_text(r -> 'accepted')))
          else (p_details ->> (r ->> 'field')) in (select jsonb_array_elements_text(r -> 'accepted'))
        end), true)
  from jsonb_array_elements(coalesce(p_rules, '[]')) r;
$$;

-- Two Rounds a day, 12:00 ('noon') and 21:00 ('evening') Istanbul (D-062).
-- The Round date in effect at a moment: today from 12:00 Istanbul, otherwise yesterday (TUR-02).
create or replace function private.tur_date_at(p_at timestamptz)
returns date language sql immutable set search_path = '' as $$
  select ((p_at at time zone 'Europe/Istanbul') - interval '12 hours')::date;
$$;

create or replace function private.tur_opens_at(p_date date, p_kind text default 'evening')
returns timestamptz language sql immutable set search_path = '' as $$
  select (p_date + case when p_kind = 'noon' then time '12:00' else time '21:00' end) at time zone 'Europe/Istanbul';
$$;

create or replace function private.ensure_preferences(p_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.profiles;
  v_age int;
begin
  select * into v from public.profiles where id = p_profile_id;
  if v.birth_date is null or v.intent is null then return; end if;
  v_age := private.age_of(v.birth_date);
  insert into public.preferences (profile_id, age_min, age_max, intents)
  values (
    p_profile_id, greatest(18, v_age - 5), least(99, v_age + 5),
    array(select i from unnest(array['long_term', 'serious_unhurried', 'unsure', 'friendship']) i
          where abs(private.intent_rank(i) - private.intent_rank(v.intent)) <= 1
          order by i = v.intent desc, private.intent_rank(i)))
  on conflict (profile_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Candidate pool: every filter is mutual (§5 step 1, §6.6). `p_prefs` overrides
-- the viewer's saved preferences for the live estimate (TUR-09).
-- ---------------------------------------------------------------------------
create or replace function private.eligible_pool(p_viewer uuid, p_prefs jsonb default '{}')
returns table (candidate_id uuid)
language sql stable security definer set search_path = '' as $$
  with v as (
    select p.id, p.gender, p.seeking, p.intent, p.city_id, p.geo_lat, p.geo_lng, p.dealbreakers,
           private.age_of(p.birth_date) as age,
           coalesce((p_prefs ->> 'ageMin')::int, pr.age_min) as age_min,
           coalesce((p_prefs ->> 'ageMax')::int, pr.age_max) as age_max,
           case when p_prefs ? 'distanceKm' then (p_prefs ->> 'distanceKm')::smallint else pr.distance_km end as distance_km,
           coalesce((select array_agg(x) from jsonb_array_elements_text(p_prefs -> 'intents') x), pr.intents) as intents,
           coalesce((p_prefs ->> 'voiceOnly')::boolean, pr.voice_only) as voice_only,
           coalesce(d.data, '{}') as details, coalesce(d.visibility, '{}') as visibility,
           exists (select 1 from public.voice_cards vc where vc.profile_id = p.id and vc.status = 'approved') as has_voice
    from public.profiles p
    join public.preferences pr on pr.profile_id = p.id
    left join public.profile_details d on d.profile_id = p.id
    where p.id = p_viewer
  )
  select c.id
  from v
  join public.profiles c on c.id <> v.id
  join public.preferences cp on cp.profile_id = c.id
  left join public.profile_details cd on cd.profile_id = c.id
  where c.status = 'active' and c.verified_at is not null and not c.reverify_required
    and c.last_active_at > now() - interval '7 days'
    and private.gender_bucket(c.gender) = any (v.seeking)
    and private.gender_bucket(v.gender) = any (c.seeking)
    and private.age_of(c.birth_date) between v.age_min and v.age_max
    and v.age between cp.age_min and cp.age_max
    and c.intent = any (v.intents) and v.intent = any (cp.intents)
    and private.location_ok(v.city_id, v.geo_lat, v.geo_lng, v.distance_km, c.city_id, c.geo_lat, c.geo_lng)
    and private.location_ok(c.city_id, c.geo_lat, c.geo_lng, cp.distance_km, v.city_id, v.geo_lat, v.geo_lng)
    and (not v.voice_only or exists (select 1 from public.voice_cards vc where vc.profile_id = c.id and vc.status = 'approved'))
    and (not cp.voice_only or v.has_voice)
    and private.dealbreakers_ok(v.dealbreakers, coalesce(cd.data, '{}'), coalesce(cd.visibility, '{}'))
    and private.dealbreakers_ok(c.dealbreakers, v.details, v.visibility)
    and not exists (select 1 from public.blocks b
                    where (b.blocker_id = v.id and b.blocked_id = c.id) or (b.blocker_id = c.id and b.blocked_id = v.id));
$$;

-- People who must not come back yet (§4.1, §5 step 1, TUR-05).
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
               where t.status in ('waiting_slot', 'active')
                 and t.a_id = least(p_viewer, p_candidate) and t.b_id = greatest(p_viewer, p_candidate));
$$;

-- ---------------------------------------------------------------------------
-- "Why this person?" (§4.6): the two strongest reasons and one honest
-- difference. Only fields the candidate shows are used; never photos, faces
-- or special-category data.
-- ---------------------------------------------------------------------------
create or replace function private.tur_reasons(p_viewer uuid, p_candidate uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v public.profiles;
  c public.profiles;
  vd jsonb;
  cd jsonb;
  cv jsonb;
  shared jsonb;
  reasons jsonb := '[]';
  diff jsonb := null;
  k text;
  visible boolean;
begin
  select * into v from public.profiles where id = p_viewer;
  select * into c from public.profiles where id = p_candidate;
  select coalesce(data, '{}') into vd from public.profile_details where profile_id = p_viewer;
  select coalesce(data, '{}'), coalesce(visibility, '{}') into cd, cv from public.profile_details where profile_id = p_candidate;
  vd := coalesce(vd, '{}');
  cd := coalesce(cd, '{}');
  cv := coalesce(cv, '{}');

  -- This week's mood (private.mood_of comes with the mood migration, 20261014).
  if private.mood_of(p_viewer) is not null and private.mood_of(p_viewer) = private.mood_of(p_candidate) then
    reasons := reasons || jsonb_build_object('key', 'same_mood', 'value', private.mood_of(p_candidate));
  end if;
  if v.intent = c.intent then
    reasons := reasons || jsonb_build_object('key', 'same_intent', 'value', c.intent);
  end if;
  select jsonb_agg(jsonb_build_object('tr', i.label_tr, 'en', i.label_en) order by i.sort) into shared
  from (select i.* from public.interests i
        join public.profile_interests a on a.interest_id = i.id and a.profile_id = p_viewer
        join public.profile_interests b on b.interest_id = i.id and b.profile_id = p_candidate
        order by i.sort limit 2) i;
  if shared is not null then
    reasons := reasons || jsonb_build_object('key', 'shared_interests', 'items', shared);
  end if;
  if v.tempo = c.tempo then
    reasons := reasons || jsonb_build_object('key', 'same_tempo', 'value', c.tempo);
  end if;
  if coalesce((cv ->> 'first_date')::boolean, true) and vd ->> 'first_date' = cd ->> 'first_date' then
    reasons := reasons || jsonb_build_object('key', 'same_first_date', 'value', cd ->> 'first_date');
  end if;
  if coalesce((cv ->> 'smoking')::boolean, true) and vd ->> 'smoking' = 'never' and cd ->> 'smoking' = 'never' then
    reasons := reasons || jsonb_build_object('key', 'both_non_smokers');
  end if;
  if coalesce((cv ->> 'sports')::boolean, true) and vd ->> 'sports' = 'regularly' and cd ->> 'sports' = 'regularly' then
    reasons := reasons || jsonb_build_object('key', 'both_active');
  end if;
  if v.intent <> c.intent and abs(private.intent_rank(v.intent) - private.intent_rank(c.intent)) = 1 then
    reasons := reasons || jsonb_build_object('key', 'neighbour_intent', 'value', c.intent);
  end if;

  foreach k in array array['smoking', 'alcohol', 'wants_children'] loop
    visible := coalesce((cv ->> k)::boolean, true);
    if visible and vd ? k and cd ? k and vd ->> k <> cd ->> k then
      diff := jsonb_build_object('key', k, 'theirs', cd ->> k, 'yours', vd ->> k);
      exit;
    end if;
  end loop;
  if diff is null and v.tempo is distinct from c.tempo and v.tempo is not null and c.tempo is not null then
    diff := jsonb_build_object('key', 'tempo', 'theirs', c.tempo, 'yours', v.tempo);
  end if;

  return jsonb_build_object(
    'reasons', (select coalesce(jsonb_agg(r), '[]') from (select r from jsonb_array_elements(reasons) r limit 2) s),
    'all', (select coalesce(jsonb_agg(r ->> 'key'), '[]') from jsonb_array_elements(reasons) r),
    'difference', diff);
end;
$$;

-- ---------------------------------------------------------------------------
-- Generation (§5). Payment, spending and device are not inputs (§9.1, TUR-07).
-- ---------------------------------------------------------------------------
create or replace function public.srv_generate_tur(p_profile_id uuid, p_tur_date date, p_kind text default 'evening', p_seq smallint default 1)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.profiles;
  v_batch uuid;
  w jsonb := coalesce((select value from public.feature_flags where key = 'tur.weights'),
                      '{"intent": 25, "common": 20, "fair": 20, "reliability": 15, "activity": 10, "completeness": 10}');
  v_floor numeric := greatest(1, private.flag_num('tur.min_weekly_impressions', 30));
  v_div int := private.flag_num('tur.diversity_max', 4)::int;
  r record;
  held jsonb := '[]';
  h jsonb;
  pos int := 0;
  per_factor jsonb := '{}';
  v_pool int;
  v_prefs public.preferences;
begin
  select id into v_batch from public.tur_batches
   where profile_id = p_profile_id and tur_date = p_tur_date and kind = p_kind and seq = p_seq;
  if found then return v_batch; end if;

  select * into v from public.profiles where id = p_profile_id;
  if not found or v.status <> 'active' or v.verified_at is null or v.reverify_required then
    return null;
  end if;
  perform private.ensure_preferences(p_profile_id);

  insert into public.tur_batches (profile_id, tur_date, kind, seq, opens_at)
  values (p_profile_id, p_tur_date, p_kind, p_seq,
          case when p_kind in ('welcome', 'on_demand') then now() else private.tur_opens_at(p_tur_date, p_kind) end)
  on conflict (profile_id, tur_date, kind, seq) do nothing
  returning id into v_batch;
  if v_batch is null then
    -- Another run created it a moment ago (TUR-01).
    select id into v_batch from public.tur_batches
     where profile_id = p_profile_id and tur_date = p_tur_date and kind = p_kind and seq = p_seq;
    return v_batch;
  end if;

  for r in
    with pool as (
      select e.candidate_id as id from private.eligible_pool(p_profile_id) e
      where not private.recently_seen(p_profile_id, e.candidate_id)
    ), f as (
      select c.id,
        case when c.intent = v.intent then 1.0
             when abs(private.intent_rank(c.intent) - private.intent_rank(v.intent)) = 1 then 0.5 else 0 end as f_intent,
        least((select count(*) from public.profile_interests a
               join public.profile_interests b on b.interest_id = a.interest_id and b.profile_id = c.id
               where a.profile_id = v.id), 5) / 5.0 as f_common,
        greatest(0, 1 - (select count(*) from public.tur_cards tc
                         where tc.candidate_id = c.id and tc.created_at > now() - interval '7 days') / v_floor) as f_fair,
        case when c.reply_median_minutes is null then 0.5 else greatest(0, 1 - c.reply_median_minutes / 1440.0) end as f_rel,
        case when c.last_active_at > now() - interval '1 day' then 1.0
             when c.last_active_at > now() - interval '3 days' then 0.6 else 0.3 end as f_act,
        least((select count(*) from public.profile_photos ph where ph.profile_id = c.id and ph.status = 'approved'), 6) / 6.0 * 0.6
          + case when exists (select 1 from public.voice_cards vc where vc.profile_id = c.id and vc.status = 'approved') then 0.2 else 0 end
          + case when (select count(*) from public.profile_details pd, jsonb_object_keys(pd.data) k where pd.profile_id = c.id) >= 3 then 0.2 else 0 end
          as f_comp,
        private.tur_reasons(v.id, c.id) as reasons
      from pool join public.profiles c on c.id = pool.id
    ), s as (
      select f.*,
        (w ->> 'intent')::numeric * f_intent as p_intent,
        (w ->> 'common')::numeric * f_common as p_common,
        (w ->> 'fair')::numeric * f_fair as p_fair,
        (w ->> 'reliability')::numeric * f_rel as p_rel,
        (w ->> 'activity')::numeric * f_act as p_act,
        (w ->> 'completeness')::numeric * f_comp as p_comp,
        coalesce((select sum(l.weight_delta) from public.less_like_this l
                  where l.profile_id = v.id and (f.reasons -> 'all') ? l.reason_key), 0) as penalty,
        case when (f.reasons -> 'all') ? 'same_mood' then private.flag_num('tur.mood_bonus', 5) else 0 end as mood_bonus
      from f
    )
    select s.id, s.reasons,
      round(p_intent + p_common + p_fair + p_rel + p_act + p_comp - penalty + mood_bonus, 2) as score,
      case greatest(p_intent, p_common, p_fair, p_rel, p_act, p_comp)
        when p_intent then 'intent' when p_common then 'common' when p_fair then 'fair'
        when p_rel then 'reliability' when p_act then 'activity' else 'completeness' end as dominant
    from s
    order by score desc, random()
  loop
    exit when pos >= 9;
    -- Diversity: at most N people chosen mainly for the same factor (§5 step 3).
    if coalesce((per_factor ->> r.dominant)::int, 0) >= v_div then
      held := held || jsonb_build_object('id', r.id, 'reasons', r.reasons, 'score', r.score, 'dominant', r.dominant);
      continue;
    end if;
    insert into public.tur_cards (batch_id, candidate_id, position, reasons, score, dominant)
    values (v_batch, r.id, pos, r.reasons - 'all', r.score, r.dominant);
    per_factor := per_factor || jsonb_build_object(r.dominant, coalesce((per_factor ->> r.dominant)::int, 0) + 1);
    pos := pos + 1;
  end loop;

  -- Diversity never leaves a slot empty: if the pool has nobody else, the
  -- people held back by it fill the Round in score order (§4.1, D-061).
  for h in select value from jsonb_array_elements(held) loop
    exit when pos >= 9;
    insert into public.tur_cards (batch_id, candidate_id, position, reasons, score, dominant)
    values (v_batch, (h ->> 'id')::uuid, pos, (h -> 'reasons') - 'all', (h ->> 'score')::numeric, h ->> 'dominant');
    pos := pos + 1;
  end loop;

  select count(*) into v_pool from private.eligible_pool(p_profile_id) e
   where not private.recently_seen(p_profile_id, e.candidate_id) or exists (
     select 1 from public.tur_cards tc where tc.batch_id = v_batch and tc.candidate_id = e.candidate_id);

  -- Honest small-pool hint (§4.1): how many more a wider filter would bring.
  select * into v_prefs from public.preferences where profile_id = p_profile_id;
  update public.tur_batches set
    generated_at = now(),
    pool_size = v_pool,
    hint = case when pos < 9 then jsonb_build_object(
      'widerAge', greatest(0, (select count(*) from private.eligible_pool(p_profile_id, jsonb_build_object(
          'ageMin', greatest(18, v_prefs.age_min - 3), 'ageMax', least(99, v_prefs.age_max + 3)))) -
          (select count(*) from private.eligible_pool(p_profile_id))),
      'widerDistance', case when v_prefs.distance_km is null then null else greatest(0,
          (select count(*) from private.eligible_pool(p_profile_id, jsonb_build_object('distanceKm', v_prefs.distance_km + 10))) -
          (select count(*) from private.eligible_pool(p_profile_id))) end)
    end
  where id = v_batch;
  return v_batch;
end;
$$;

create or replace function private.tur_mode()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select value #>> '{}' from public.feature_flags where key = 'tur.mode'), 'on_demand');
$$;

-- Job for every active account, half an hour before each opening (§5, D-062).
create or replace function public.srv_generate_all_turs(p_date date, p_kind text default 'evening')
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
  p record;
begin
  if private.tur_mode() <> 'scheduled' then return 0; end if;
  for p in select id from public.profiles
           where status = 'active' and verified_at is not null and not reverify_required
             and last_active_at > now() - interval '7 days'
  loop
    if public.srv_generate_tur(p.id, p_date, p_kind) is not null then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

-- Answers waiting longer than 14 days drop silently (§4.2); expired saved cards go;
-- a table still waiting for a slot after 72 hours drops (§4.4, MAS-05). Runs hourly.
create or replace function public.srv_expire_daily()
returns void language sql security definer set search_path = '' as $$
  update public.answers set status = 'expired' where status in ('pending', 'passed') and expires_at <= now();
  delete from public.saved_cards where expires_at <= now();
  update public.tables set status = 'expired', updated_at = now()
  where status = 'waiting_slot' and waiting_expires_at <= now();
$$;

-- The current Round of a user: the most recently opened batch. A Round stays
-- open until the next one opens (at most 15 hours with 12:00 and 21:00).
create or replace function private.current_batch(p_profile_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.tur_batches
  where profile_id = p_profile_id and opens_at <= now() and opens_at > now() - interval '24 hours'
  order by opens_at desc, tur_date desc, seq desc, created_at desc limit 1;
$$;

-- A new Round on demand (D-063): allowed when there is no open Round or every
-- card of the current one has a decision. Returns
-- {result: ok | not_finished | daily_limit | scheduled | not_active, batchId?}.
create or replace function public.srv_next_tur(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.profile_id_of(p_user_id);
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_cur uuid;
  v_seq int;
  v_max int := private.flag_num('tur.daily_max', 0)::int;
begin
  if not exists (select 1 from public.profiles where id = me and status = 'active') then
    return jsonb_build_object('result', 'not_active');
  end if;
  if private.tur_mode() <> 'on_demand' then return jsonb_build_object('result', 'scheduled'); end if;
  -- One request at a time per person (double taps).
  perform pg_advisory_xact_lock(hashtextextended('next_tur' || me::text, 0));
  v_cur := private.current_batch(me);
  if v_cur is not null and exists (select 1 from public.tur_cards where batch_id = v_cur and action = 'none') then
    return jsonb_build_object('result', 'not_finished', 'batchId', v_cur);
  end if;
  select coalesce(max(seq), 0) into v_seq from public.tur_batches
   where profile_id = me and tur_date = v_today and kind = 'on_demand';
  if v_max > 0 and v_seq >= v_max then return jsonb_build_object('result', 'daily_limit'); end if;
  return jsonb_build_object('result', 'ok',
    'batchId', public.srv_generate_tur(me, v_today, 'on_demand', (v_seq + 1)::smallint));
end;
$$;

-- ---------------------------------------------------------------------------
-- Activation: preferences, and a Round right away (§6.1 step 15, D-053)
-- ---------------------------------------------------------------------------
create or replace function private.first_tur(p_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  local_time time := (now() at time zone 'Europe/Istanbul')::time;
begin
  perform private.ensure_preferences(p_profile_id);
  if local_time >= time '11:30' and local_time < time '12:00' then
    -- The noon job already ran: generate today's noon Round (opens at 12:00).
    perform public.srv_generate_tur(p_profile_id, (now() at time zone 'Europe/Istanbul')::date, 'noon');
  elsif local_time >= time '20:30' and local_time < time '21:00' then
    perform public.srv_generate_tur(p_profile_id, (now() at time zone 'Europe/Istanbul')::date, 'evening');
  else
    -- Otherwise a welcome Round opens now; the next scheduled Round replaces it.
    perform public.srv_generate_tur(p_profile_id, private.tur_date_at(now()), 'welcome');
  end if;
end;
$$;

create or replace function public.srv_try_complete_onboarding(p_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.profiles;
  v_progress jsonb;
begin
  select * into v from public.profiles where user_id = p_user_id for update;
  if not found then return null; end if;
  if v.status <> 'onboarding' then return v.status::text; end if;
  v_progress := private.profile_progress(v.id);
  if v.phone_verified_at is not null and v.birth_date is not null and v.verified_at is not null
     and not v.id_required
     and (v_progress ->> 'basicsComplete')::boolean and (v_progress ->> 'photosComplete')::boolean
     and (v_progress ->> 'intentComplete')::boolean and (v_progress ->> 'doorQuestionComplete')::boolean
     and (v_progress ->> 'interestsComplete')::boolean and (v_progress ->> 'locationComplete')::boolean
     and (public.srv_onboarding_state(p_user_id) ->> 'consentsComplete')::boolean then
    update public.profiles set status = 'active', onboarding_completed_at = now(), last_active_at = now()
     where id = v.id;
    perform private.first_tur(v.id);
    return 'active';
  end if;
  return 'onboarding';
end;
$$;

-- Activity for "active in the last 7 days" (§5); written at most every 5 minutes.
create or replace function public.touch_activity()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set last_active_at = now()
  where user_id = (select auth.uid()) and (last_active_at is null or last_active_at < now() - interval '5 minutes');
$$;

-- ---------------------------------------------------------------------------
-- Card actions
-- ---------------------------------------------------------------------------
-- 'ok' | 'not_found' | 'saved_limit'
create or replace function public.srv_tur_action(p_user_id uuid, p_card_id uuid, p_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.profile_id_of(p_user_id);
  card public.tur_cards;
begin
  select tc.* into card from public.tur_cards tc join public.tur_batches tb on tb.id = tc.batch_id
   where tc.id = p_card_id and tb.profile_id = me
     and (tb.id = private.current_batch(me) or tc.action = 'saved')
   for update of tc;
  if not found or card.action in ('answered', 'passed') then return 'not_found'; end if;

  if p_action = 'pass' then
    update public.tur_cards set action = 'passed', acted_at = now() where id = card.id;
    delete from public.saved_cards where profile_id = me and candidate_id = card.candidate_id;
  elsif p_action = 'save' then
    if card.action = 'saved' then return 'ok'; end if;
    if (select count(*) from public.saved_cards where profile_id = me and expires_at > now()) >= 9 then
      return 'saved_limit';
    end if;
    insert into public.saved_cards (profile_id, candidate_id, expires_at)
    values (me, card.candidate_id, now() + interval '7 days')
    on conflict (profile_id, candidate_id) do update set expires_at = excluded.expires_at;
    update public.tur_cards set action = 'saved', acted_at = now() where id = card.id;
  elsif p_action = 'unsave' then
    delete from public.saved_cards where profile_id = me and candidate_id = card.candidate_id;
    update public.tur_cards set action = 'none', acted_at = null where id = card.id and action = 'saved';
  else
    return 'not_found';
  end if;
  return 'ok';
end;
$$;

create or replace function public.srv_less_like_this(p_user_id uuid, p_reason_key text)
returns void language sql security definer set search_path = '' as $$
  insert into public.less_like_this (profile_id, reason_key) values (private.profile_id_of(p_user_id), p_reason_key)
  on conflict (profile_id, reason_key) do update set weight_delta = least(15, public.less_like_this.weight_delta + 5);
$$;

-- ---------------------------------------------------------------------------
-- Answers
-- ---------------------------------------------------------------------------
create or replace function public.srv_recent_answer_texts(p_user_id uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(text), '{}') from public.answers
  where from_id = private.profile_id_of(p_user_id) and text is not null and created_at > now() - interval '24 hours';
$$;

-- Returns {result: ok|not_in_tur|already_answered|daily_limit|pending_limit|not_active, answerId?}
create or replace function public.srv_answer_create(
  p_user_id uuid, p_candidate uuid, p_text text, p_voice_path text, p_voice_ms int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.profile_id_of(p_user_id);
  v_id uuid;
  v_question jsonb;
begin
  if not exists (select 1 from public.profiles where id = me and status = 'active') then
    return jsonb_build_object('result', 'not_active');
  end if;
  perform 1 from public.profiles where id = me for update;
  -- Only someone in the current Round or in the saved list (§13.3 RLS özeti).
  if not exists (select 1 from public.tur_cards tc join public.tur_batches tb on tb.id = tc.batch_id
                 where tb.profile_id = me and tc.candidate_id = p_candidate and tc.action in ('none', 'saved')
                   and (tb.id = private.current_batch(me) or tc.action = 'saved'))
     and not exists (select 1 from public.saved_cards where profile_id = me and candidate_id = p_candidate and expires_at > now())
  then
    return jsonb_build_object('result', 'not_in_tur');
  end if;
  if not exists (select 1 from public.profiles c where c.id = p_candidate and c.status = 'active')
     or exists (select 1 from public.blocks b where (b.blocker_id = me and b.blocked_id = p_candidate)
                                                 or (b.blocker_id = p_candidate and b.blocked_id = me)) then
    return jsonb_build_object('result', 'not_in_tur');
  end if;
  if exists (select 1 from public.answers where from_id = me and to_id = p_candidate and status = 'pending') then
    return jsonb_build_object('result', 'already_answered');
  end if;
  if (select count(*) from public.answers where from_id = me and created_at > now() - interval '24 hours')
     >= private.flag_num('answers.daily_limit', 15) then
    return jsonb_build_object('result', 'daily_limit');
  end if;
  if (select count(*) from public.answers where from_id = me and status = 'pending' and expires_at > now())
     >= private.flag_num('answers.pending_limit', 15) then
    return jsonb_build_object('result', 'pending_limit');
  end if;

  select jsonb_build_object('tr', coalesce(dq.custom_text, qp.text_tr), 'en', coalesce(dq.custom_text, qp.text_en))
    into v_question
  from public.door_questions dq left join public.question_presets qp on qp.id = dq.preset_id
  where dq.profile_id = p_candidate;

  insert into public.answers (from_id, to_id, question_snapshot, text, voice_path, voice_ms, expires_at)
  values (me, p_candidate, coalesce(v_question, '{}'), p_text, p_voice_path, p_voice_ms, now() + interval '14 days')
  returning id into v_id;

  update public.tur_cards tc set action = 'answered', acted_at = now()
  from public.tur_batches tb
  where tb.id = tc.batch_id and tb.profile_id = me and tc.candidate_id = p_candidate and tc.action in ('none', 'saved');
  delete from public.saved_cards where profile_id = me and candidate_id = p_candidate;
  return jsonb_build_object('result', 'ok', 'answerId', v_id);
end;
$$;

-- Reciprocate or pass an incoming answer.
-- Returns {result: ok|passed|not_found, tableId?, tableStatus?}
create or replace function public.srv_answer_respond(p_user_id uuid, p_answer_id uuid, p_action text, p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.profile_id_of(p_user_id);
  ans public.answers;
  v_a uuid;
  v_b uuid;
  v_table public.tables;
  v_slots int := private.flag_num('tables.free_slots', 3)::int;
  v_status text;
begin
  select * into ans from public.answers
   where id = p_answer_id and to_id = me and status = 'pending' and expires_at > now()
   for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;

  if p_action = 'pass' then
    -- The sender is not told (§4.2); the answer drops silently when it expires.
    update public.answers set status = 'passed' where id = ans.id;
    return jsonb_build_object('result', 'passed');
  end if;

  v_a := least(ans.from_id, me);
  v_b := greatest(ans.from_id, me);
  -- Serialize per pair so two reciprocations cannot open two tables (MAS-04).
  perform pg_advisory_xact_lock(hashtextextended(v_a::text || v_b::text, 0));
  update public.answers set status = 'reciprocated' where id = ans.id;

  select * into v_table from public.tables
   where a_id = v_a and b_id = v_b and status in ('waiting_slot', 'active');
  if not found then
    -- A full table list means "waiting for a slot" for up to 72 hours (§4.4, MAS-05).
    v_status := case when
        (select count(*) from public.tables where status = 'active' and ans.from_id in (a_id, b_id)) < v_slots
        and (select count(*) from public.tables where status = 'active' and me in (a_id, b_id)) < v_slots
      then 'active' else 'waiting_slot' end;
    insert into public.tables (a_id, b_id, status, turn_of, last_message_at, waiting_expires_at)
    values (v_a, v_b, v_status, ans.from_id, now(),
            case when v_status = 'waiting_slot' then now() + interval '72 hours' end)
    returning * into v_table;
    insert into public.messages (table_id, sender_id, kind, body, media_path, created_at)
    values (v_table.id, ans.from_id, case when ans.voice_path is null then 'text' else 'voice' end,
            ans.text, ans.voice_path, ans.created_at);
  end if;
  insert into public.messages (table_id, sender_id, kind, body) values (v_table.id, me, 'text', p_message);
  update public.tables set last_message_at = now(), turn_of = ans.from_id where id = v_table.id;
  return jsonb_build_object('result', 'ok', 'tableId', v_table.id, 'tableStatus', v_table.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Read models for the app (served through Edge Functions, which sign photo URLs)
-- ---------------------------------------------------------------------------
create or replace function public.srv_current_tur(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'batchId', b.id, 'turDate', b.tur_date, 'kind', b.kind, 'opensAt', b.opens_at,
    'poolSize', b.pool_size, 'hint', b.hint,
    'cards', coalesce((select jsonb_agg(jsonb_build_object(
        'cardId', tc.id, 'candidateId', tc.candidate_id, 'position', tc.position, 'action', tc.action,
        'reasons', tc.reasons, 'profile', public.srv_public_profile(tc.candidate_id)) order by tc.position)
      from public.tur_cards tc where tc.batch_id = b.id), '[]'))
  from public.tur_batches b
  where b.id = private.current_batch(private.profile_id_of(p_user_id));
$$;

create or replace function public.srv_saved(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'candidateId', s.candidate_id, 'expiresAt', s.expires_at,
      'cardId', (select tc.id from public.tur_cards tc join public.tur_batches tb on tb.id = tc.batch_id
                 where tb.profile_id = s.profile_id and tc.candidate_id = s.candidate_id and tc.action = 'saved'
                 order by tc.created_at desc limit 1),
      'profile', public.srv_public_profile(s.candidate_id)) order by s.expires_at), '[]')
  from public.saved_cards s
  where s.profile_id = private.profile_id_of(p_user_id) and s.expires_at > now();
$$;

-- Incoming (pending, not passed) and outgoing answers. A pass shows as
-- "waiting" to the sender until the answer expires (§4.2).
create or replace function public.srv_inbox(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select private.profile_id_of(p_user_id) as id)
  select jsonb_build_object(
    'incoming', coalesce((select jsonb_agg(jsonb_build_object(
        'answerId', a.id, 'createdAt', a.created_at, 'expiresAt', a.expires_at, 'text', a.text,
        'voicePath', a.voice_path, 'voiceMs', a.voice_ms, 'question', a.question_snapshot,
        'profile', public.srv_public_profile(a.from_id)) order by a.created_at desc)
      from public.answers a, me where a.to_id = me.id and a.status = 'pending' and a.expires_at > now()), '[]'),
    'outgoing', coalesce((select jsonb_agg(jsonb_build_object(
        'answerId', a.id, 'createdAt', a.created_at, 'text', a.text, 'voiceMs', a.voice_ms,
        'question', a.question_snapshot,
        'status', case when a.status = 'reciprocated' then 'reciprocated'
                       when a.status = 'expired' or a.expires_at <= now() then 'dropped'
                       else 'waiting' end,
        'profile', public.srv_public_profile(a.to_id)) order by a.created_at desc)
      from public.answers a, me where a.from_id = me.id and a.created_at > now() - interval '30 days'), '[]'));
$$;

create or replace function public.srv_my_tables(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select private.profile_id_of(p_user_id) as id)
  select coalesce(jsonb_agg(jsonb_build_object(
      'tableId', t.id, 'status', t.status, 'waitingExpiresAt', t.waiting_expires_at,
      'lastMessageAt', t.last_message_at, 'myTurn', t.turn_of = me.id,
      'profile', public.srv_public_profile(case when t.a_id = me.id then t.b_id else t.a_id end))
    order by t.status = 'active' desc, t.last_message_at desc), '[]')
  from public.tables t, me
  where me.id in (t.a_id, t.b_id) and t.status in ('waiting_slot', 'active');
$$;

create or replace function public.srv_update_preferences(p_user_id uuid, p_prefs jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := private.profile_id_of(p_user_id);
begin
  insert into public.preferences (profile_id, age_min, age_max, distance_km, intents, voice_only)
  values (me, (p_prefs ->> 'ageMin')::smallint, (p_prefs ->> 'ageMax')::smallint,
          (p_prefs ->> 'distanceKm')::smallint,
          array(select jsonb_array_elements_text(p_prefs -> 'intents')), (p_prefs ->> 'voiceOnly')::boolean)
  on conflict (profile_id) do update set
    age_min = excluded.age_min, age_max = excluded.age_max, distance_km = excluded.distance_km,
    intents = excluded.intents, voice_only = excluded.voice_only;
  return 'ok';
end;
$$;

-- What the filters screen shows: own preferences and the live pool estimate (§6.6, TUR-09).
create or replace function public.my_preferences()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ageMin', age_min, 'ageMax', age_max, 'distanceKm', distance_km,
                            'intents', to_jsonb(intents), 'voiceOnly', voice_only)
  from public.preferences where profile_id = private.profile_id_of((select auth.uid()));
$$;

create or replace function public.my_pool_estimate(p_prefs jsonb)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from private.eligible_pool(private.profile_id_of((select auth.uid())), coalesce(p_prefs, '{}'));
$$;

-- ---------------------------------------------------------------------------
-- Grants and schedules
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, n.nspname as schema, p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname like 'srv\_%') or n.nspname = 'private'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.schema = 'public' then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;
-- RLS policies call this helper as the user.
grant execute on function private.profile_id_of(uuid) to authenticated;

revoke all on function public.touch_activity() from public, anon;
grant execute on function public.touch_activity() to authenticated;
revoke all on function public.my_preferences() from public, anon;
grant execute on function public.my_preferences() to authenticated;
revoke all on function public.my_pool_estimate(jsonb) from public, anon;
grant execute on function public.my_pool_estimate(jsonb) to authenticated;

-- pg_cron is present on Supabase (local and hosted); other Postgres builds skip scheduling.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    -- 11:30 and 20:30 Istanbul = 08:30 and 17:30 UTC (Türkiye has no daylight saving time).
    execute $cron$select cron.schedule('tur-generate-noon', '30 8 * * *',
      $job$select public.srv_generate_all_turs(((now() at time zone 'Europe/Istanbul'))::date, 'noon')$job$)$cron$;
    execute $cron$select cron.schedule('tur-generate', '30 17 * * *',
      $job$select public.srv_generate_all_turs(((now() at time zone 'Europe/Istanbul'))::date, 'evening')$job$)$cron$;
    execute $cron$select cron.schedule('daily-expiry', '15 * * * *', $job$select public.srv_expire_daily()$job$)$cron$;
  end if;
end $$;
