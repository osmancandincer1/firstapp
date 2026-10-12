-- Voice messages at a table (APP.md §4.4, §8.1 #24; SOH-10).
--
-- The chat function checks the recording (1–60 seconds, a readable file), moves it to the
-- public-voice bucket and stores the path on the message. The bucket is private: a party asks
-- for a short-lived signed URL, and only the two parties can resolve a message's path.

-- The media path of a message, for one of its table's parties; null for anyone else.
create or replace function public.srv_message_media(p_user_id uuid, p_message_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.media_path
  from public.messages m join public.tables t on t.id = m.table_id
  where m.id = p_message_id and m.deleted_at is null
    and private.profile_id_of(p_user_id) in (t.a_id, t.b_id);
$$;

revoke all on function public.srv_message_media(uuid, uuid) from public, anon, authenticated;
grant execute on function public.srv_message_media(uuid, uuid) to service_role;
