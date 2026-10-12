-- Mood tag and "İki doğru, bir yalan" (owner's decision D-064; details D-066).
--
-- Tested in supabase/tests/database/04_mood_games.test.sql. Rules:
--   * a mood is "this week's": it is shown only until the next Monday 00:00 Istanbul;
--   * the same current mood gives a small Round bonus (flag tur.mood_bonus) and a reason;
--   * two truths one lie: exactly three statements of 8–80 characters, one of them the lie.

alter table public.profiles
  add column mood text check (mood in ('coffee', 'walk', 'game_night', 'concert', 'quiet')),
  add column mood_set_at timestamptz;

create table public.profile_games (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  statements text[] not null check (
    cardinality(statements) = 3
    and char_length(statements[1]) between 8 and 80
    and char_length(statements[2]) between 8 and 80
    and char_length(statements[3]) between 8 and 80),
  lie smallint not null check (lie between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Read only through the security-definer projections below; no direct access.
alter table public.profile_games enable row level security;
create trigger profile_games_set_updated_at before update on public.profile_games
  for each row execute function public.set_updated_at();

insert into public.feature_flags (key, value) values ('tur.mood_bonus', '5')
on conflict (key) do nothing;

-- This week's mood: null once a new week (Monday 00:00 Istanbul) has started.
create or replace function private.mood_of(p_profile_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.mood from public.profiles p
  where p.id = p_profile_id and p.mood is not null
    and (p.mood_set_at at time zone 'Europe/Istanbul') >= date_trunc('week', now() at time zone 'Europe/Istanbul');
$$;

-- 'ok' | 'not_found'
create or replace function public.srv_update_mood(p_user_id uuid, p_mood text)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := private.profile_id_of(p_user_id);
begin
  if me is null then return 'not_found'; end if;
  update public.profiles
     set mood = p_mood, mood_set_at = case when p_mood is null then null else now() end
   where id = me;
  return 'ok';
end;
$$;

-- 'ok' | 'not_found'. Null statements remove the game.
create or replace function public.srv_update_two_truths(p_user_id uuid, p_statements text[], p_lie smallint)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := private.profile_id_of(p_user_id);
begin
  if me is null then return 'not_found'; end if;
  if p_statements is null then
    delete from public.profile_games where profile_id = me;
  else
    insert into public.profile_games (profile_id, statements, lie) values (me, p_statements, p_lie)
    on conflict (profile_id) do update set statements = excluded.statements, lie = excluded.lie;
  end if;
  return 'ok';
end;
$$;

-- The public projection, now with this week's mood and the game. The lie is
-- part of it on purpose: the guess is a light ice-breaker, checked in the app (D-066).
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
    'mood', private.mood_of(p.id),
    'twoTruths', (select jsonb_build_object('statements', to_jsonb(g.statements), 'lie', g.lie)
                  from public.profile_games g where g.profile_id = p.id),
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

-- What the owner sees and edits: mood (this week's) and the game.
create or replace function public.my_fun()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'mood', private.mood_of(p.id),
    'twoTruths', (select jsonb_build_object('statements', to_jsonb(g.statements), 'lie', g.lie)
                  from public.profile_games g where g.profile_id = p.id))
  from public.profiles p where p.user_id = (select auth.uid());
$$;

revoke all on function private.mood_of(uuid) from public, anon, authenticated;
revoke all on function public.srv_update_mood(uuid, text), public.srv_update_two_truths(uuid, text[], smallint)
  from public, anon, authenticated;
grant execute on function public.srv_update_mood(uuid, text), public.srv_update_two_truths(uuid, text[], smallint)
  to service_role;
revoke all on function public.my_fun() from public, anon;
grant execute on function public.my_fun() to authenticated;
