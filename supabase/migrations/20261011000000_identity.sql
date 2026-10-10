-- Phase 1 — identity and verification (APP.md §6, §7.5, §13.3, §13.4).
--
-- Layout:
--   * public.*   tables the app may read under RLS (own rows only) or that
--                stay server-only (no grants);
--   * private.*  server-only state (OTP, rate limits, identifiers), not
--                exposed through the API at all;
--   * public.srv_* functions callable only by the service role, i.e. by Edge
--                Functions. They hold the rules that must be atomic.
-- The client never writes any of these tables directly (§13.4).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.account_status as enum
  ('onboarding', 'active', 'paused', 'suspended', 'banned', 'deleted');

create type public.consent_type as enum
  ('terms', 'community_guidelines', 'kvkk_notice', 'biometric', 'special_category',
   'cross_border_transfer', 'marketing');

create type public.identifier_type as enum
  ('email', 'phone', 'face', 'device', 'oauth_sub', 'payment', 'id_doc');

create type public.verification_result as enum
  ('pending', 'passed', 'failed', 'duplicate', 'banned', 'needs_id', 'error');

-- ---------------------------------------------------------------------------
-- profiles (Phase 1 subset; profile content arrives in Phase 2)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  status public.account_status not null default 'onboarding',
  birth_date date,
  age_gate_locked_until timestamptz,
  phone_verified_at timestamptz,
  phone_last2 text check (phone_last2 ~ '^\d{2}$'),
  verified_at timestamptz,
  id_required boolean not null default false,
  locale text not null default 'tr' check (locale in ('tr', 'en')),
  risk_score smallint not null default 0 check (risk_score between 0 and 100),
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
-- Own row only, and never the risk score (§13.3 RLS özeti, PRO-07).
grant select (id, user_id, status, birth_date, age_gate_locked_until, phone_verified_at,
              phone_last2, verified_at, id_required, locale, created_at, updated_at)
  on public.profiles to authenticated;
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every new auth user gets a profile in "onboarding".
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Legal documents and consents (§6.1 step 6, AUTH-07)
-- ---------------------------------------------------------------------------
create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  type public.consent_type not null,
  version text not null,
  url text,
  -- Drafts are placeholders until a lawyer approves the text (§17). They are
  -- only usable while feature flag legal.allow_draft_documents is true.
  is_draft boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, version)
);

alter table public.legal_documents enable row level security;
revoke all on public.legal_documents from anon, authenticated;
grant select on public.legal_documents to anon, authenticated;
create policy legal_documents_public_read on public.legal_documents
  for select to anon, authenticated using (true);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type public.consent_type not null,
  version text not null,
  granted boolean not null,
  at timestamptz not null default now(),
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consents_profile_idx on public.consents (profile_id, type, at desc);

alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated;
grant select (id, profile_id, type, version, granted, at, created_at) on public.consents
  to authenticated;
create policy consents_select_own on public.consents
  for select to authenticated
  using (profile_id in (select p.id from public.profiles p where p.user_id = (select auth.uid())));

-- Latest usable version of each document.
create or replace function public.srv_current_legal_versions()
returns table (type public.consent_type, version text)
language sql stable security definer set search_path = '' as $$
  select distinct on (d.type) d.type, d.version
  from public.legal_documents d
  where not d.is_draft
     or coalesce((select (f.value)::boolean from public.feature_flags f
                  where f.key = 'legal.allow_draft_documents'), false)
  order by d.type, d.published_at desc, d.created_at desc;
$$;

-- The documents the consent screen must show (type, version, url, draft flag).
create or replace function public.current_legal_documents()
returns table (type public.consent_type, version text, url text, is_draft boolean)
language sql stable security definer set search_path = '' as $$
  select d.type, d.version, d.url, d.is_draft
  from public.srv_current_legal_versions() c
  join public.legal_documents d on d.type = c.type and d.version = c.version
  order by d.type;
$$;
revoke all on function public.current_legal_documents() from public;
grant execute on function public.current_legal_documents() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bans (§7.5). Server-only.
-- ---------------------------------------------------------------------------
create table public.bans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  reason_code text not null,
  banned_at timestamptz not null default now(),
  appeal_status text not null default 'none'
    check (appeal_status in ('none', 'pending', 'accepted', 'rejected')),
  lifted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bans enable row level security;
revoke all on public.bans from anon, authenticated;

create table public.ban_identifiers (
  id uuid primary key default gen_random_uuid(),
  ban_id uuid not null references public.bans (id) on delete cascade,
  type public.identifier_type not null,
  -- HMAC-SHA256 with a server secret, never a plain hash (§13.7, BAN-12).
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, hash)
);
alter table public.ban_identifiers enable row level security;
revoke all on public.ban_identifiers from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verifications and devices (§13.3). Server-only for now.
-- ---------------------------------------------------------------------------
create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('liveness', 'id')),
  provider text not null,
  provider_ref text not null,
  result public.verification_result not null default 'pending',
  confidence numeric(5, 2),
  age_estimate_low smallint,
  age_estimate_high smallint,
  face_id_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index verifications_profile_idx on public.verifications (profile_id, created_at desc);
alter table public.verifications enable row level security;
revoke all on public.verifications from anon, authenticated;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  push_token text,
  attest_status text,
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, device_hash)
);
alter table public.devices enable row level security;
revoke all on public.devices from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private server state
-- ---------------------------------------------------------------------------
-- Which account owns an identifier. One phone / email / face / OAuth subject
-- belongs to at most one account (AUTH-05); devices may be shared.
create table private.user_identifiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.identifier_type not null,
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index user_identifiers_unique on private.user_identifiers (type, hash)
  where type <> 'device';
create unique index user_identifiers_device on private.user_identifiers (user_id, type, hash);

create table private.otp_challenges (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'phone')),
  target_hash text not null,
  user_id uuid references auth.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index otp_challenges_target_idx on private.otp_challenges (channel, target_hash, created_at desc);

create table private.otp_locks (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'phone')),
  target_hash text not null,
  failed_count smallint not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, target_hash)
);

create table private.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rate_limit_events_bucket_idx on private.rate_limit_events (bucket, created_at);

-- Items a human must look at (duplicate faces, banned-device matches, …).
create table private.review_queue (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete cascade,
  reason text not null,
  details jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Provider webhooks are processed once (VER-06, ABN-01).
create table private.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, event_id)
);

do $$
declare t text;
begin
  foreach t in array array['user_identifiers', 'otp_challenges', 'otp_locks',
                           'rate_limit_events', 'review_queue', 'webhook_events'] loop
    execute format('alter table private.%I enable row level security', t);
    execute format('revoke all on private.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Server functions (service role only)
-- ---------------------------------------------------------------------------

-- Sliding-window rate limit. Returns false when the bucket is full (§7.3).
create or replace function public.srv_rate_limit_hit(p_bucket text, p_window_seconds int, p_max int)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bucket, 0));
  delete from private.rate_limit_events
   where bucket = p_bucket and created_at <= now() - make_interval(secs => p_window_seconds);
  if (select count(*) from private.rate_limit_events where bucket = p_bucket) >= p_max then
    return false;
  end if;
  insert into private.rate_limit_events (bucket) values (p_bucket);
  return true;
end;
$$;

-- Issues a new code for a target, invalidating earlier ones. 'locked' while
-- the target is locked after too many wrong codes.
create or replace function public.srv_otp_create(
  p_channel text, p_target_hash text, p_code_hash text, p_ttl_seconds int,
  p_user_id uuid default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.otp_locks l
             where l.channel = p_channel and l.target_hash = p_target_hash
               and l.locked_until > now()) then
    return 'locked';
  end if;
  update private.otp_challenges set consumed_at = now()
   where channel = p_channel and target_hash = p_target_hash and consumed_at is null;
  insert into private.otp_challenges (channel, target_hash, user_id, code_hash, expires_at)
  values (p_channel, p_target_hash, p_user_id, p_code_hash,
          now() + make_interval(secs => p_ttl_seconds));
  return 'created';
end;
$$;

-- Checks a code: 'ok' | 'invalid' | 'expired' | 'locked' | 'not_found' (AUTH-02).
-- A code works once; the latest code replaces earlier ones; after
-- p_max_failed wrong codes in a row the target is locked for p_lock_seconds.
create or replace function public.srv_otp_verify(
  p_channel text, p_target_hash text, p_code_hash text, p_max_failed int,
  p_lock_seconds int, p_user_id uuid default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_lock private.otp_locks;
  v_ch private.otp_challenges;
begin
  insert into private.otp_locks (channel, target_hash) values (p_channel, p_target_hash)
  on conflict (channel, target_hash) do nothing;
  select * into v_lock from private.otp_locks
   where channel = p_channel and target_hash = p_target_hash for update;
  if v_lock.locked_until is not null and v_lock.locked_until > now() then
    return 'locked';
  end if;

  select * into v_ch from private.otp_challenges
   where channel = p_channel and target_hash = p_target_hash and consumed_at is null
     and (p_user_id is null or user_id = p_user_id)
   order by created_at desc limit 1 for update;
  if not found then
    return 'not_found';
  end if;
  if v_ch.expires_at <= now() then
    update private.otp_challenges set consumed_at = now() where id = v_ch.id;
    return 'expired';
  end if;

  if v_ch.code_hash = p_code_hash then
    update private.otp_challenges set consumed_at = now() where id = v_ch.id;
    update private.otp_locks set failed_count = 0, locked_until = null where id = v_lock.id;
    return 'ok';
  end if;

  update private.otp_challenges set attempts = attempts + 1 where id = v_ch.id;
  if v_lock.failed_count + 1 >= p_max_failed then
    update private.otp_locks
       set failed_count = 0, locked_until = now() + make_interval(secs => p_lock_seconds)
     where id = v_lock.id;
    update private.otp_challenges set consumed_at = now() where id = v_ch.id;
    return 'locked';
  end if;
  update private.otp_locks set failed_count = failed_count + 1 where id = v_lock.id;
  return 'invalid';
end;
$$;

-- Active ban matching any of the given identifiers ([{type, hash}, …]), or null.
create or replace function public.srv_ban_lookup(p_identifiers jsonb)
returns uuid language sql stable security definer set search_path = '' as $$
  select b.id
  from public.ban_identifiers bi
  join public.bans b on b.id = bi.ban_id
  where b.lifted_at is null
    and (bi.type::text, bi.hash) in (
      select x ->> 'type', x ->> 'hash' from jsonb_array_elements(p_identifiers) x)
  limit 1;
$$;

create or replace function public.srv_identifier_owner(p_type public.identifier_type, p_hash text)
returns uuid language sql stable security definer set search_path = '' as $$
  select user_id from private.user_identifiers
  where type = p_type and hash = p_hash and type <> 'device'
  limit 1;
$$;

-- Attaches an identifier to an account: 'bound' | 'already_yours' | 'taken'.
create or replace function public.srv_bind_identifier(
  p_user_id uuid, p_type public.identifier_type, p_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if p_type = 'device' then
    insert into private.user_identifiers (user_id, type, hash) values (p_user_id, p_type, p_hash)
    on conflict (user_id, type, hash) do nothing;
    return 'bound';
  end if;
  select user_id into v_owner from private.user_identifiers where type = p_type and hash = p_hash;
  if v_owner = p_user_id then return 'already_yours'; end if;
  if v_owner is not null then return 'taken'; end if;
  begin
    insert into private.user_identifiers (user_id, type, hash) values (p_user_id, p_type, p_hash);
  exception when unique_violation then
    return 'taken';
  end;
  return 'bound';
end;
$$;

-- Marks the phone step done once the number is bound to this account.
create or replace function public.srv_mark_phone_verified(
  p_user_id uuid, p_phone_hash text, p_last2 text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_bind text;
begin
  v_bind := public.srv_bind_identifier(p_user_id, 'phone', p_phone_hash);
  if v_bind = 'taken' then return 'taken'; end if;
  update public.profiles set phone_verified_at = now(), phone_last2 = p_last2
   where user_id = p_user_id;
  return 'ok';
end;
$$;

-- Age gate (AUTH-01). The date of "today" is taken on the server, in Istanbul.
-- Returns 'ok' | 'underage' | 'age_locked' | 'already_set' | 'invalid' | 'not_found'.
create or replace function public.srv_set_birth_date(p_user_id uuid, p_birth date)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_profile public.profiles;
  v_age int;
begin
  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if not found then return 'not_found'; end if;
  if v_profile.birth_date is not null then return 'already_set'; end if;
  if v_profile.age_gate_locked_until > now() then return 'age_locked'; end if;
  if p_birth > v_today then return 'invalid'; end if;
  v_age := extract(year from age(v_today, p_birth))::int;
  if v_age < 18 then
    update public.profiles set age_gate_locked_until = now() + interval '24 hours'
     where id = v_profile.id;
    return 'underage';
  end if;
  if v_age > 120 then return 'invalid'; end if;
  update public.profiles set birth_date = p_birth where id = v_profile.id;
  return 'ok';
end;
$$;

-- Registers the device and flags banned-device matches for review (BAN-05):
-- a device alone never blocks sign-up (second-hand phones), it raises risk.
create or replace function public.srv_register_device(
  p_user_id uuid, p_platform text, p_device_hash text, p_app_version text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select id into v_profile_id from public.profiles where user_id = p_user_id;
  if v_profile_id is null then return 'not_found'; end if;
  insert into public.devices (profile_id, platform, device_hash, app_version)
  values (v_profile_id, p_platform, p_device_hash, p_app_version)
  on conflict (profile_id, device_hash)
  do update set last_seen_at = now(), app_version = excluded.app_version;
  perform public.srv_bind_identifier(p_user_id, 'device', p_device_hash);

  if public.srv_ban_lookup(jsonb_build_array(
       jsonb_build_object('type', 'device', 'hash', p_device_hash))) is not null then
    update public.profiles set risk_score = greatest(risk_score, 85) where id = v_profile_id;
    if not exists (select 1 from private.review_queue
                   where profile_id = v_profile_id and reason = 'banned_device_match'
                     and status = 'open') then
      insert into private.review_queue (profile_id, reason, details)
      values (v_profile_id, 'banned_device_match', jsonb_build_object('device_hash', p_device_hash));
    end if;
    return 'review';
  end if;
  return 'ok';
end;
$$;

-- Bans an account and every identifier it is linked to (§7.5 ban atlatma, BAN-10).
create or replace function public.srv_ban_account(
  p_user_id uuid, p_reason text, p_extra jsonb default '[]')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid;
  v_ban uuid;
begin
  select id into v_profile_id from public.profiles where user_id = p_user_id;
  insert into public.bans (profile_id, reason_code) values (v_profile_id, p_reason)
  returning id into v_ban;
  insert into public.ban_identifiers (ban_id, type, hash)
  select v_ban, type, hash from private.user_identifiers where user_id = p_user_id
  union
  select v_ban, (x ->> 'type')::public.identifier_type, x ->> 'hash'
  from jsonb_array_elements(p_extra) x
  on conflict (type, hash) do nothing;
  update public.profiles set status = 'banned' where id = v_profile_id;
  insert into public.audit_log (actor, action, target, diff)
  values ('system', 'ban.' || p_reason, v_profile_id::text, jsonb_build_object('ban_id', v_ban));
  return v_ban;
end;
$$;

-- Resolves face-collection matches to owners: 'banned' | 'self' | 'active_other'.
create or replace function public.srv_face_owners(p_user_id uuid, p_face_hashes text[])
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(owner), '{}') from (
    select case
      when exists (select 1 from public.ban_identifiers bi join public.bans b on b.id = bi.ban_id
                   where bi.type = 'face' and bi.hash = h and b.lifted_at is null) then 'banned'
      when exists (select 1 from private.user_identifiers u
                   where u.type = 'face' and u.hash = h and u.user_id = p_user_id) then 'self'
      when exists (select 1 from private.user_identifiers u
                   where u.type = 'face' and u.hash = h) then 'active_other'
    end as owner
    from unnest(p_face_hashes) h
  ) s where owner is not null;
$$;

-- Stores a liveness outcome and applies its consequences atomically.
-- p_outcome: passed | needs_id | failed_low_confidence | duplicate_face | banned_face | error
create or replace function public.srv_liveness_finish(
  p_user_id uuid, p_provider text, p_session text, p_outcome text,
  p_confidence numeric, p_age_low int, p_age_high int, p_face_hash text,
  p_matched_hashes text[] default '{}')
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid;
  v_result public.verification_result;
begin
  select id into v_profile_id from public.profiles where user_id = p_user_id for update;
  if v_profile_id is null then return 'not_found'; end if;

  v_result := case p_outcome
    when 'passed' then 'passed' when 'needs_id' then 'needs_id'
    when 'failed_low_confidence' then 'failed' when 'duplicate_face' then 'duplicate'
    when 'banned_face' then 'banned' else 'error' end;

  update public.verifications
     set result = v_result, confidence = p_confidence, age_estimate_low = p_age_low,
         age_estimate_high = p_age_high, face_id_hash = p_face_hash
   where provider = p_provider and provider_ref = p_session and profile_id = v_profile_id
     and result = 'pending';
  if not found then return 'unknown_session'; end if;

  if p_outcome in ('passed', 'needs_id') and p_face_hash is not null then
    if public.srv_bind_identifier(p_user_id, 'face', p_face_hash) = 'taken' then
      update public.verifications set result = 'duplicate'
       where provider = p_provider and provider_ref = p_session;
      insert into private.review_queue (profile_id, reason) values (v_profile_id, 'duplicate_face');
      return 'duplicate_face';
    end if;
  end if;

  if p_outcome = 'passed' then
    update public.profiles set verified_at = now(), id_required = false where id = v_profile_id;
  elsif p_outcome = 'needs_id' then
    update public.profiles set id_required = true where id = v_profile_id;
  elsif p_outcome = 'duplicate_face' then
    insert into private.review_queue (profile_id, reason, details)
    values (v_profile_id, 'duplicate_face', jsonb_build_object('matches', p_matched_hashes));
  elsif p_outcome = 'banned_face' then
    perform public.srv_ban_account(
      p_user_id, 'ban_evasion',
      (select coalesce(jsonb_agg(jsonb_build_object('type', 'face', 'hash', h)), '[]')
       from unnest(p_matched_hashes) h));
  end if;
  return p_outcome;
end;
$$;

-- Records a provider webhook once; false when it was already processed (VER-06).
create or replace function public.srv_webhook_seen(p_provider text, p_event_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into private.webhook_events (provider, event_id) values (p_provider, p_event_id);
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Where is a user in sign-up? (AUTH-06). my_onboarding_state() is the one
-- function the app calls directly; it can only ask about itself.
-- ---------------------------------------------------------------------------
create or replace function public.srv_onboarding_state(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (
    select * from public.profiles where user_id = p_user_id
  ), current_docs as (
    select * from public.srv_current_legal_versions()
  ), latest as (
    select distinct on (c.type) c.type, c.version, c.granted
    from public.consents c join me on me.id = c.profile_id
    order by c.type, c.at desc
  )
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'status', (select status from me),
    'phoneVerified', (select phone_verified_at is not null from me),
    'phoneLast2', (select phone_last2 from me),
    'birthDate', (select birth_date from me),
    'ageGateLockedUntil', (select age_gate_locked_until from me),
    'consentsComplete',
      exists (select 1 from current_docs)
      and not exists (
        select 1 from current_docs d
        where d.type <> 'marketing'
          and not exists (select 1 from latest l
                          where l.type = d.type and l.version = d.version and l.granted)),
    'livenessVerified', (select verified_at is not null from me),
    'idRequired', (select id_required from me)
  ) end;
$$;

create or replace function public.my_onboarding_state()
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.srv_onboarding_state((select auth.uid()));
$$;

-- ---------------------------------------------------------------------------
-- Grants: srv_* only for the service role; my_onboarding_state for users.
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'srv\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function public.my_onboarding_state() from public, anon;
grant execute on function public.my_onboarding_state() to authenticated;

-- Draft legal documents are usable only where this flag is true (local seed).
insert into public.feature_flags (key, value) values
  ('legal.allow_draft_documents', 'false'),
  ('liveness.min_confidence', '90'),
  ('liveness.face_match_threshold', '90'),
  ('phone.allowed_country_codes', '["90"]')
on conflict (key) do nothing;
