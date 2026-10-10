-- LOCAL DEVELOPMENT ONLY (applied by `supabase start` / `supabase db reset`).
-- Legal texts are TODO(owner): they need a lawyer (APP.md §17). These rows let
-- the sign-up flow run locally; they are drafts and are accepted only because
-- this seed turns legal.allow_draft_documents on. Never run this in staging or
-- production.
update public.feature_flags set value = 'true' where key = 'legal.allow_draft_documents';

insert into public.legal_documents (type, version, is_draft, url)
select t, 'draft-2026-10', true, null
from unnest(enum_range(null::public.consent_type)) t
on conflict (type, version) do nothing;
