-- Phase 0 database guards. Run with: npx supabase test db
begin;
select plan(13);

-- §0.4: RLS is on for every table in the public schema, now and in the future.
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every public table has row level security enabled'
);

-- §13.3: every public table has id, created_at, updated_at.
select is(
  (
    select count(*)::int
    from pg_tables t
    where t.schemaname = 'public'
      and (
        select count(*) from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = t.tablename
          and c.column_name in ('id', 'created_at', 'updated_at')
      ) < 3
  ),
  0,
  'every public table has id, created_at and updated_at'
);

select has_table('public', 'feature_flags', 'feature_flags exists');
select has_table('public', 'audit_log', 'audit_log exists');

-- Clients have no access to either table.
set local role anon;
select throws_ok('select * from public.feature_flags', '42501', null, 'anon cannot read feature_flags');
select throws_ok('select * from public.audit_log', '42501', null, 'anon cannot read audit_log');
reset role;

set local role authenticated;
select throws_ok(
  $$insert into public.feature_flags (key, value) values ('x', '1')$$,
  '42501', null, 'authenticated users cannot write feature_flags'
);
select throws_ok(
  $$insert into public.audit_log (actor, action) values ('me', 'forged')$$,
  '42501', null, 'authenticated users cannot write audit_log'
);
reset role;

-- Flag changes are audited with before/after values.
insert into public.feature_flags (key, value) values ('tur.weight.intent', '25');
update public.feature_flags set value = '30' where key = 'tur.weight.intent';
select results_eq(
  $$select action, diff from public.audit_log where target = 'tur.weight.intent' order by at, action$$,
  $$values ('feature_flag.insert', '{"before": null, "after": 25}'::jsonb),
           ('feature_flag.update', '{"before": 25, "after": 30}'::jsonb)$$,
  'feature flag insert and update are written to audit_log'
);

select throws_ok(
  $$insert into public.feature_flags (key, value) values ('Bad Key!', '1')$$,
  '23514', null, 'flag keys are restricted to a safe charset'
);

-- audit_log is append-only even for privileged roles.
select throws_ok(
  $$update public.audit_log set actor = 'someone else'$$,
  '42501', 'audit_log is append-only', 'audit_log rows cannot be updated'
);
select throws_ok(
  $$delete from public.audit_log$$,
  '42501', 'audit_log is append-only', 'audit_log rows cannot be deleted'
);
select throws_ok(
  $$truncate public.audit_log$$,
  '42501', 'audit_log is append-only', 'audit_log cannot be truncated'
);

select * from finish();
rollback;
