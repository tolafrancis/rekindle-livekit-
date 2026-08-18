-- 0279_stop_bot_session_self_service.sql
-- =====================================================================
-- Companion to 0278: start_bot_session got a self-service path for "Ask
-- a question" but stop_bot_session was still is_group_admin-only — a
-- participant who started their OWN Q&A session couldn't tap "Done
-- asking" to end it (RPC would raise 'Not authorized'), stranding it
-- until an admin manually stopped it or it self-timed-out some other
-- way. Now also allows the session's own creator to stop it — no
-- broader than that; still can't touch anyone else's session.
-- =====================================================================

begin;

create or replace function public.stop_bot_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ministry_id uuid;
  v_created_by  uuid;
begin
  select ministry_id, created_by into v_ministry_id, v_created_by
    from public.translation_sessions where id = p_session_id;
  if v_ministry_id is null then
    raise exception 'Unknown translation session';
  end if;

  if auth.uid() is null
     or not (public.is_group_admin(v_ministry_id, auth.uid()) or v_created_by = auth.uid())
  then
    raise exception 'Not authorized to stop this session';
  end if;

  update public.translation_sessions
    set status = 'ended', ended_at = now()
    where id = p_session_id;

  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'stop',
    'session_id', p_session_id
  )::text);
end;
$$;

grant execute on function public.stop_bot_session(uuid) to authenticated;

commit;
