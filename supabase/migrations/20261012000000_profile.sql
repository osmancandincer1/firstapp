-- Phase 2 — profile (APP.md §6.1 steps 7–13, §6.4, §7.2, §13.3, §13.6, §13.7).
--
-- Rules kept here (tested in supabase/tests/database/02_profile.test.sql):
--   * clients read their profile only through my_profile(); they write nothing directly;
--   * media lives in private buckets; nothing in quarantine is ever served to others (PRO-01);
--   * what others may see is produced by one function, srv_public_profile() (PRO-06/07);
--   * an edit waiting for review never replaces the published value (PRO-08);
--   * changing the main photo of an active profile requires a new liveness check (VER-07).

-- ---------------------------------------------------------------------------
-- Reference data (filled by the content migration)
-- ---------------------------------------------------------------------------
create table public.cities (
  id smallint primary key check (id between 1 and 81), -- licence-plate code
  name text not null,
  tz text not null default 'Europe/Istanbul',
  status text not null default 'waitlist' check (status in ('waitlist', 'open')),
  open_threshold integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.districts (
  id integer generated always as identity primary key,
  city_id smallint not null references public.cities (id),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, name)
);

create table public.question_presets (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  text_tr text not null unique check (char_length(text_tr) <= 90),
  text_en text not null check (char_length(text_en) <= 90),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.interests (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  label_tr text not null unique,
  label_en text not null,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.voice_prompts (
  id uuid primary key default gen_random_uuid(),
  text_tr text not null unique,
  text_en text not null,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['cities', 'districts', 'question_presets', 'interests', 'voice_prompts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Profile fields
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column name text check (char_length(name) between 2 and 20),
  add column name_changed_at timestamptz,
  add column gender text check (gender in ('woman', 'man', 'nonbinary', 'self_described')),
  add column gender_custom text check (char_length(gender_custom) <= 30),
  add column show_gender boolean not null default true,
  add column seeking text[] not null default '{}'
    check (seeking <@ array['women', 'men', 'nonbinary']::text[]),
  add column intent text check (intent in ('long_term', 'serious_unhurried', 'unsure', 'friendship')),
  add column tempo text check (tempo in ('meet_soon', 'chat_first', 'slow')),
  add column dealbreakers jsonb not null default '[]',
  add column city_id smallint references public.cities (id),
  add column district_id integer references public.districts (id),
  -- ~1 km grid only (§13.6); raw coordinates are never stored.
  add column geo_lat numeric(5, 2) check (geo_lat between -90 and 90),
  add column geo_lng numeric(6, 2) check (geo_lng between -180 and 180),
  add column reverify_required boolean not null default false,
  add column onboarding_completed_at timestamptz;

create table public.profile_details (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  data jsonb not null default '{}',
  visibility jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.door_questions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  preset_id uuid references public.question_presets (id),
  custom_text text check (char_length(custom_text) between 8 and 90),
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((preset_id is null) <> (custom_text is null))
);

create table public.profile_interests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  interest_id uuid not null references public.interests (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, interest_id)
);

create type public.media_status as enum ('pending', 'approved', 'rejected', 'review');

create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 0 and 5),
  status public.media_status not null default 'pending',
  reject_reason text,
  face_matched boolean not null default false,
  caption text check (char_length(caption) <= 40),
  quarantine_path text,
  public_path text,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profile_photos_profile_idx on public.profile_photos (profile_id, position);

create table public.voice_cards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  prompt_id uuid references public.voice_prompts (id),
  status public.media_status not null default 'pending',
  reject_reason text,
  duration_ms integer check (duration_ms between 5000 and 20000),
  quarantine_path text,
  public_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index voice_cards_one_live on public.voice_cards (profile_id)
  where status in ('approved', 'review');

-- Edits held for a human (PRO-08). The published value stays until approval.
create table public.profile_edits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  field text not null,
  value jsonb not null,
  status text not null default 'review' check (status in ('review', 'approved', 'rejected')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profile_edits_open_idx on public.profile_edits (profile_id) where status = 'review';

do $$
declare t text;
begin
  foreach t in array array['profile_details', 'door_questions', 'profile_interests',
                           'profile_photos', 'voice_cards', 'profile_edits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: private buckets only. Clients upload with one-time signed upload
-- URLs and read with short-lived signed URLs, both issued by Edge Functions.
-- No storage policy exists for clients, so nothing is listable or readable
-- directly (§13.7, PRO-01).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('quarantine', 'quarantine', false, 15728640,
   array['image/jpeg', 'image/png', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac']),
  ('public-photos', 'public-photos', false, 15728640, array['image/jpeg', 'image/png']),
  ('public-voice', 'public-voice', false, 2097152, array['audio/mp4', 'audio/m4a', 'audio/x-m4a'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.profile_id_of(p_user_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.profiles where user_id = p_user_id;
$$;

-- The main photo is the first approved photo by position.
create or replace function private.main_photo_id(p_profile_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.profile_photos
  where profile_id = p_profile_id and status = 'approved'
  order by position, created_at limit 1;
$$;

-- After a photo change: an active profile whose main photo changed must redo liveness (VER-07).
create or replace function private.flag_reverify(p_profile_id uuid, p_previous_main uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_previous_main is distinct from private.main_photo_id(p_profile_id) then
    update public.profiles set reverify_required = true
     where id = p_profile_id and status = 'active';
  end if;
end;
$$;

-- Packs positions 0..n-1 in the current order, keeping rejected photos last.
create or replace function private.compact_photos(p_profile_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.profile_photos p set position = s.rn - 1
  from (
    select id, row_number() over (order by (status = 'rejected'), position, created_at) as rn
    from public.profile_photos where profile_id = p_profile_id
  ) s
  where p.id = s.id and p.position <> s.rn - 1;
$$;

-- ---------------------------------------------------------------------------
-- Profile updates (service role only; Edge Functions validate and moderate first)
-- ---------------------------------------------------------------------------

-- 'ok' | 'name_locked' (once per 30 days after sign-up, §6.4) | 'not_found'
create or replace function public.srv_update_basics(
  p_user_id uuid, p_name text, p_gender text, p_gender_custom text, p_show_gender boolean,
  p_seeking text[])
returns text language plpgsql security definer set search_path = '' as $$
declare v public.profiles;
begin
  select * into v from public.profiles where user_id = p_user_id for update;
  if not found then return 'not_found'; end if;
  if v.name is distinct from p_name and v.onboarding_completed_at is not null
     and v.name_changed_at > now() - interval '30 days' then
    return 'name_locked';
  end if;
  update public.profiles set
    name_changed_at = case when v.name is distinct from p_name and v.onboarding_completed_at is not null
                           then now() else name_changed_at end,
    name = p_name,
    gender = p_gender,
    gender_custom = case when p_gender = 'self_described' then p_gender_custom end,
    show_gender = p_show_gender,
    seeking = p_seeking
  where id = v.id;
  return 'ok';
end;
$$;

create or replace function public.srv_update_intent(
  p_user_id uuid, p_intent text, p_tempo text, p_dealbreakers jsonb)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set intent = p_intent, tempo = p_tempo, dealbreakers = p_dealbreakers
   where user_id = p_user_id;
  return case when found then 'ok' else 'not_found' end;
end;
$$;

-- 'ok' | 'locked' (once per 7 days after sign-up) | 'invalid_preset' | 'not_found'
create or replace function public.srv_set_door_question(
  p_user_id uuid, p_preset_id uuid, p_custom_text text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_current public.door_questions;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found then return 'not_found'; end if;
  if p_preset_id is not null and not exists (
       select 1 from public.question_presets where id = p_preset_id and active) then
    return 'invalid_preset';
  end if;
  select * into v_current from public.door_questions where profile_id = v_profile.id for update;
  if found and v_profile.onboarding_completed_at is not null
     and v_current.changed_at > now() - interval '7 days' then
    return 'locked';
  end if;
  insert into public.door_questions (profile_id, preset_id, custom_text, changed_at)
  values (v_profile.id, p_preset_id, p_custom_text, now())
  on conflict (profile_id) do update
    set preset_id = excluded.preset_id, custom_text = excluded.custom_text, changed_at = now();
  return 'ok';
end;
$$;

-- 'ok' | 'invalid' (unknown/inactive id or not 5–10 distinct) | 'not_found'
create or replace function public.srv_set_interests(p_user_id uuid, p_ids uuid[])
returns text language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid := private.profile_id_of(p_user_id);
begin
  if v_profile_id is null then return 'not_found'; end if;
  if cardinality(p_ids) not between 5 and 10
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids)
     or (select count(*) from public.interests where id = any (p_ids) and active) <> cardinality(p_ids) then
    return 'invalid';
  end if;
  delete from public.profile_interests where profile_id = v_profile_id and interest_id <> all (p_ids);
  insert into public.profile_interests (profile_id, interest_id)
  select v_profile_id, x from unnest(p_ids) x
  on conflict (profile_id, interest_id) do nothing;
  return 'ok';
end;
$$;

-- Merges optional details; a JSON null removes the field.
create or replace function public.srv_update_details(p_user_id uuid, p_data jsonb, p_visibility jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid := private.profile_id_of(p_user_id);
begin
  if v_profile_id is null then return 'not_found'; end if;
  insert into public.profile_details (profile_id) values (v_profile_id) on conflict (profile_id) do nothing;
  update public.profile_details set
    data = jsonb_strip_nulls(data || coalesce(p_data, '{}')),
    visibility = visibility || coalesce(p_visibility, '{}')
  where profile_id = v_profile_id;
  return 'ok';
end;
$$;

-- 'ok' | 'invalid_city' | 'invalid_district' | 'not_found'. Coordinates arrive already rounded.
create or replace function public.srv_set_location(
  p_user_id uuid, p_city_id smallint, p_district_id integer, p_lat numeric, p_lng numeric)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.cities where id = p_city_id) then return 'invalid_city'; end if;
  if p_district_id is not null and not exists (
       select 1 from public.districts where id = p_district_id and city_id = p_city_id) then
    return 'invalid_district';
  end if;
  update public.profiles set city_id = p_city_id, district_id = p_district_id,
         geo_lat = round(p_lat, 2), geo_lng = round(p_lng, 2)
   where user_id = p_user_id;
  return case when found then 'ok' else 'not_found' end;
end;
$$;

create or replace function public.srv_add_pending_edit(
  p_user_id uuid, p_field text, p_value jsonb, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid := private.profile_id_of(p_user_id);
begin
  update public.profile_edits set status = 'rejected', reason = 'superseded'
   where profile_id = v_profile_id and field = p_field and status = 'review';
  insert into public.profile_edits (profile_id, field, value, reason)
  values (v_profile_id, p_field, p_value, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

-- Reserves a slot. Returns the new photo id, or null when 6 non-rejected photos exist.
create or replace function public.srv_photo_create(p_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid := private.profile_id_of(p_user_id);
  v_count int;
  v_id uuid := gen_random_uuid();
begin
  if v_profile_id is null then return null; end if;
  perform 1 from public.profiles where id = v_profile_id for update;
  select count(*) into v_count from public.profile_photos
   where profile_id = v_profile_id and status <> 'rejected';
  if v_count >= 6 then return null; end if;
  -- Rejected photos are cleared when a new one is added so slots stay readable.
  delete from public.profile_photos where profile_id = v_profile_id and status = 'rejected';
  insert into public.profile_photos (id, profile_id, position, quarantine_path)
  values (v_id, v_profile_id, v_count, v_profile_id || '/photos/' || v_id || '.jpg');
  return v_id;
end;
$$;

-- Records the moderation outcome. Approved photos move to public-photos.
create or replace function public.srv_photo_finish(
  p_user_id uuid, p_photo_id uuid, p_status public.media_status, p_reason text,
  p_face_matched boolean, p_public_path text, p_width int, p_height int)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid := private.profile_id_of(p_user_id);
  v_previous uuid;
begin
  perform 1 from public.profiles where id = v_profile_id for update;
  v_previous := private.main_photo_id(v_profile_id);
  update public.profile_photos set
    status = p_status,
    reject_reason = case when p_status in ('rejected', 'review') then p_reason end,
    face_matched = coalesce(p_face_matched, false),
    public_path = case when p_status = 'approved' then p_public_path end,
    quarantine_path = case when p_status = 'review' then quarantine_path end,
    width = p_width, height = p_height
  where id = p_photo_id and profile_id = v_profile_id and status = 'pending';
  if not found then return 'not_found'; end if;
  perform private.compact_photos(v_profile_id);
  perform private.flag_reverify(v_profile_id, v_previous);
  return 'ok';
end;
$$;

-- Sets a new order from the full list of the user's photo ids.
create or replace function public.srv_photo_reorder(p_user_id uuid, p_ids uuid[])
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid := private.profile_id_of(p_user_id);
  v_previous uuid;
begin
  perform 1 from public.profiles where id = v_profile_id for update;
  if (select array_agg(id order by id) from public.profile_photos
      where profile_id = v_profile_id and status <> 'rejected')
     is distinct from (select array_agg(x order by x) from unnest(p_ids) x) then
    return 'invalid';
  end if;
  v_previous := private.main_photo_id(v_profile_id);
  update public.profile_photos p set position = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where p.id = o.id and p.profile_id = v_profile_id;
  perform private.flag_reverify(v_profile_id, v_previous);
  return 'ok';
end;
$$;

-- Deletes a photo and returns the storage paths to remove (null when not found).
create or replace function public.srv_photo_delete(p_user_id uuid, p_photo_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid := private.profile_id_of(p_user_id);
  v_previous uuid;
  v_paths text[];
begin
  perform 1 from public.profiles where id = v_profile_id for update;
  v_previous := private.main_photo_id(v_profile_id);
  delete from public.profile_photos where id = p_photo_id and profile_id = v_profile_id
  returning array_remove(array[quarantine_path, public_path], null) into v_paths;
  if v_paths is null then return null; end if;
  perform private.compact_photos(v_profile_id);
  perform private.flag_reverify(v_profile_id, v_previous);
  return v_paths;
end;
$$;

create or replace function public.srv_photo_caption(p_user_id uuid, p_photo_id uuid, p_caption text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.profile_photos set caption = nullif(p_caption, '')
   where id = p_photo_id and profile_id = private.profile_id_of(p_user_id);
  return case when found then 'ok' else 'not_found' end;
end;
$$;

-- Photo row for the processing function (ownership checked).
create or replace function public.srv_photo_get(p_user_id uuid, p_photo_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'status', status, 'position', position,
                            'quarantinePath', quarantine_path,
                            'isMain', position = 0 or not exists (
                              select 1 from public.profile_photos o
                              where o.profile_id = p.profile_id and o.status = 'approved'
                                and o.position < p.position))
  from public.profile_photos p
  where id = p_photo_id and profile_id = private.profile_id_of(p_user_id);
$$;

-- ---------------------------------------------------------------------------
-- Voice card
-- ---------------------------------------------------------------------------
create or replace function public.srv_voice_create(p_user_id uuid, p_prompt_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid := private.profile_id_of(p_user_id);
  v_id uuid := gen_random_uuid();
begin
  if v_profile_id is null or not exists (
       select 1 from public.voice_prompts where id = p_prompt_id and active) then
    return null;
  end if;
  delete from public.voice_cards where profile_id = v_profile_id and status in ('pending', 'rejected');
  insert into public.voice_cards (id, profile_id, prompt_id, quarantine_path)
  values (v_id, v_profile_id, p_prompt_id, v_profile_id || '/voice/' || v_id || '.m4a');
  return v_id;
end;
$$;

-- Publishes (or rejects) a processed voice card; returns paths of a replaced card to delete.
create or replace function public.srv_voice_finish(
  p_user_id uuid, p_voice_id uuid, p_status public.media_status, p_reason text,
  p_duration_ms int, p_public_path text)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid := private.profile_id_of(p_user_id);
  v_old text[];
begin
  if p_status = 'approved' then
    delete from public.voice_cards
     where profile_id = v_profile_id and id <> p_voice_id and status in ('approved', 'review')
    returning array_remove(array[quarantine_path, public_path], null) into v_old;
  end if;
  update public.voice_cards set status = p_status,
         reject_reason = case when p_status = 'rejected' then p_reason end,
         duration_ms = case when p_status = 'approved' then p_duration_ms end,
         public_path = case when p_status = 'approved' then p_public_path end,
         quarantine_path = null
   where id = p_voice_id and profile_id = v_profile_id and status = 'pending';
  if not found then return null; end if;
  if p_status = 'approved' then
    insert into private.review_queue (profile_id, reason, details)
    values (v_profile_id, 'voice_spot_check', jsonb_build_object('voice_id', p_voice_id));
  end if;
  return coalesce(v_old, '{}');
end;
$$;

create or replace function public.srv_voice_delete(p_user_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare v_paths text[];
begin
  delete from public.voice_cards where profile_id = private.profile_id_of(p_user_id)
  returning array_remove(array[quarantine_path, public_path], null) into v_paths;
  return coalesce(v_paths, '{}');
end;
$$;

create or replace function public.srv_voice_get(p_user_id uuid, p_voice_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'status', status, 'quarantinePath', quarantine_path)
  from public.voice_cards
  where id = p_voice_id and profile_id = private.profile_id_of(p_user_id);
$$;

-- ---------------------------------------------------------------------------
-- Completion and state
-- ---------------------------------------------------------------------------
create or replace function private.profile_progress(p_profile_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'basicsComplete', p.name is not null and p.gender is not null and cardinality(p.seeking) > 0,
    'photosComplete', (
      select count(*) >= 3 and coalesce(bool_or(face_matched) filter (where id = private.main_photo_id(p.id)), false)
      from public.profile_photos where profile_id = p.id and status = 'approved'),
    'photosInReview', exists (select 1 from public.profile_photos
                              where profile_id = p.id and status in ('review', 'pending')),
    'intentComplete', p.intent is not null and p.tempo is not null,
    'doorQuestionComplete', exists (select 1 from public.door_questions where profile_id = p.id),
    'interestsComplete', (select count(*) between 5 and 10 from public.profile_interests
                          where profile_id = p.id),
    'locationComplete', p.city_id is not null,
    'reverifyRequired', p.reverify_required)
  from public.profiles p where p.id = p_profile_id;
$$;

-- Activates the account once every required step is done. Returns the status.
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
    update public.profiles set status = 'active', onboarding_completed_at = now() where id = v.id;
    return 'active';
  end if;
  return 'onboarding';
end;
$$;

-- Extends the Phase 1 state with the profile steps (AUTH-06).
create or replace function public.srv_onboarding_state_v2(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.srv_onboarding_state(p_user_id)
         || coalesce(private.profile_progress(private.profile_id_of(p_user_id)), '{}');
$$;

create or replace function public.my_onboarding_state()
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.srv_onboarding_state_v2((select auth.uid()));
$$;

-- Liveness passing again clears the re-verification flag.
create or replace function private.clear_reverify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.verified_at is distinct from old.verified_at then
    new.reverify_required := false;
  end if;
  return new;
end;
$$;
create trigger profiles_clear_reverify before update of verified_at on public.profiles
  for each row execute function private.clear_reverify();

-- ---------------------------------------------------------------------------
-- What other people may see (PRO-06, PRO-07). Hidden optional fields, the birth
-- date, contact data, coordinates and the risk score never appear here.
-- ---------------------------------------------------------------------------
create or replace function public.srv_public_profile(p_profile_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'age', extract(year from age((now() at time zone 'Europe/Istanbul')::date, p.birth_date))::int,
    'gender', case when p.show_gender then coalesce(p.gender_custom, p.gender) end,
    'intent', p.intent,
    'tempo', p.tempo,
    'verified', p.verified_at is not null,
    'district', d.name,
    'city', case when d.name is null then c.name end,
    'doorQuestion', (
      select jsonb_build_object('tr', coalesce(dq.custom_text, qp.text_tr), 'en', coalesce(dq.custom_text, qp.text_en))
      from public.door_questions dq left join public.question_presets qp on qp.id = dq.preset_id
      where dq.profile_id = p.id),
    'interests', (
      select jsonb_agg(jsonb_build_object('tr', i.label_tr, 'en', i.label_en) order by i.sort)
      from public.profile_interests pi join public.interests i on i.id = pi.interest_id
      where pi.profile_id = p.id),
    'details', (
      select jsonb_object_agg(k, v) from public.profile_details pd, jsonb_each(pd.data) as e(k, v)
      where pd.profile_id = p.id and coalesce((pd.visibility ->> k)::boolean, true)),
    'photos', (
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.public_path, 'caption', ph.caption)
                       order by ph.position)
      from public.profile_photos ph where ph.profile_id = p.id and ph.status = 'approved'),
    'voice', (
      select jsonb_build_object('path', v.public_path, 'durationMs', v.duration_ms,
                                'promptTr', vp.text_tr, 'promptEn', vp.text_en)
      from public.voice_cards v left join public.voice_prompts vp on vp.id = v.prompt_id
      where v.profile_id = p.id and v.status = 'approved')
  ))
  from public.profiles p
  left join public.cities c on c.id = p.city_id
  left join public.districts d on d.id = p.district_id
  where p.id = p_profile_id and p.status not in ('banned', 'deleted');
$$;

-- "How others see me" preview (§6.4 Başkası nasıl görüyor?) — exactly the public projection.
create or replace function public.srv_my_public_profile(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.srv_public_profile(private.profile_id_of(p_user_id));
$$;

-- Storage locations of the user's own media, for owner-only signed URLs.
-- Pending and in-review photos are shown to their owner only (never to others, PRO-01).
create or replace function public.srv_my_media(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(m), '[]') from (
    select jsonb_build_object('id', id, 'kind', 'photo',
             'bucket', case when public_path is not null then 'public-photos' else 'quarantine' end,
             'path', coalesce(public_path, quarantine_path)) as m
    from public.profile_photos
    where profile_id = private.profile_id_of(p_user_id) and coalesce(public_path, quarantine_path) is not null
    union all
    select jsonb_build_object('id', id, 'kind', 'voice', 'bucket', 'public-voice', 'path', public_path)
    from public.voice_cards
    where profile_id = private.profile_id_of(p_user_id) and public_path is not null
  ) s;
$$;

-- The signed-in user's own profile, including hidden fields and pending items.
create or replace function public.my_profile()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'status', p.status,
    'name', p.name,
    'nameChangedAt', p.name_changed_at,
    'onboardingCompletedAt', p.onboarding_completed_at,
    'gender', p.gender,
    'genderCustom', p.gender_custom,
    'showGender', p.show_gender,
    'seeking', to_jsonb(p.seeking),
    'intent', p.intent,
    'tempo', p.tempo,
    'dealbreakers', p.dealbreakers,
    'cityId', p.city_id,
    'districtId', p.district_id,
    'hasLocation', p.geo_lat is not null,
    'doorQuestion', (select jsonb_build_object('presetId', preset_id, 'customText', custom_text,
                                               'changedAt', changed_at)
                     from public.door_questions where profile_id = p.id),
    'interestIds', coalesce((select jsonb_agg(interest_id) from public.profile_interests
                             where profile_id = p.id), '[]'),
    'details', coalesce((select data from public.profile_details where profile_id = p.id), '{}'),
    'visibility', coalesce((select visibility from public.profile_details where profile_id = p.id), '{}'),
    'photos', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', id, 'position', position, 'status', status, 'rejectReason', reject_reason,
                          'faceMatched', face_matched, 'caption', caption) order by position)
                        from public.profile_photos where profile_id = p.id), '[]'),
    'voice', (select jsonb_build_object('id', id, 'status', status, 'promptId', prompt_id,
                                        'durationMs', duration_ms, 'rejectReason', reject_reason)
              from public.voice_cards where profile_id = p.id order by created_at desc limit 1),
    'pendingEdits', coalesce((select jsonb_agg(jsonb_build_object('field', field, 'status', status,
                                                                  'reason', reason, 'at', created_at))
                              from public.profile_edits
                              where profile_id = p.id and status = 'review'), '[]'))
  from public.profiles p where p.user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, n.nspname as schema from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname like 'srv\_%') or n.nspname = 'private'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.schema = 'public' then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;
revoke all on function public.my_onboarding_state() from public, anon;
grant execute on function public.my_onboarding_state() to authenticated;
