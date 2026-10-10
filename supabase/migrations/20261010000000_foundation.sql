-- Phase 0 foundation (APP.md §0.4, §5, §13.3).
-- Rules enforced here and tested in supabase/tests/database:
--   * every table has RLS enabled from the start; no policy = no client access;
--   * every table has id uuid, created_at, updated_at;
--   * audit_log is append-only, and feature_flags changes are written to it.

-- Keeps updated_at current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- audit_log: append-only record of privileged actions (§5, §14, MOD-05).
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  target text,
  diff jsonb,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;

create index audit_log_at_idx on public.audit_log (at desc);

create or replace function public.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_append_only();

-- ---------------------------------------------------------------------------
-- feature_flags: tunable weights, thresholds and limits (§5, §14).
-- Server-side only for now; client read access will get its own policy when a
-- client feature needs it.
-- ---------------------------------------------------------------------------
create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_.]+$'),
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;
revoke all on public.feature_flags from anon, authenticated;

create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();

-- Every flag change is recorded with its before/after values.
create or replace function public.feature_flags_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor, action, target, diff)
  values (
    coalesce(auth.uid()::text, current_user),
    'feature_flag.' || lower(tg_op),
    coalesce(new.key, old.key),
    jsonb_build_object(
      'before', case when tg_op = 'INSERT' then null else old.value end,
      'after', case when tg_op = 'DELETE' then null else new.value end
    )
  );
  return coalesce(new, old);
end;
$$;

revoke execute on function public.feature_flags_audit() from public, anon, authenticated;

create trigger feature_flags_audit
  after insert or update or delete on public.feature_flags
  for each row execute function public.feature_flags_audit();
