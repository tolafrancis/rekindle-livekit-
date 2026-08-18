-- 0277_start_bot_session_dedupe.sql
-- =====================================================================
-- Fixes a real bug hit live (2026-08-18): start_bot_session had no
-- duplicate guard at all — every call unconditionally inserted a new
-- translation_sessions row and dispatched a new bot, even if one was
-- already running for the exact same room + target_language. A double
-- click on "+ Add language" (or one click landing while an earlier
-- session was still 'joining', before its track had published — the
-- only state FloatingTranslationButton's own "already has a track"
-- filter can see) silently produced TWO independent bot participants
-- in the same meeting, both permanently connected until manually
-- stopped one by one. The host's "Remove participant" control could
-- only ever remove one of them at a time — with no indication a
-- second one existed, that looked exactly like "removal doesn't
-- work" even though it did.
--
-- Fix: start_bot_session now checks for an existing non-ended session
-- with the same (ministry_id, livekit_room_name, target_language)
-- first. If one is still initialising/joining/active/paused, it is
-- returned as-is (idempotent "start" — no new row, no new dispatch,
-- no duplicate bot). Only a genuinely fresh combination, or one whose
-- prior session already ended/errored, starts a new one.
-- =====================================================================

begin;

create or replace function public.start_bot_session(
  p_ministry_id       uuid,
  p_room_name         text,
  p_source_language   text,
  p_target_language   text,
  p_speaker_identity  text default null,
  p_service_id        uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_existing   uuid;
begin
  if auth.uid() is null or not public.is_group_admin(p_ministry_id, auth.uid()) then
    raise exception 'Not authorized to start a translation session for this ministry';
  end if;

  select id into v_existing
    from public.translation_sessions
    where ministry_id = p_ministry_id
      and livekit_room_name = p_room_name
      and target_language = p_target_language
      and status in ('initialising', 'joining', 'active', 'paused')
    order by created_at desc
    limit 1;

  if v_existing is not null then
    return jsonb_build_object('session_id', v_existing, 'reused', true);
  end if;

  insert into public.translation_sessions (
    ministry_id, service_id, source_type, livekit_room_name,
    source_language, target_language, speaker_identity, status, created_by
  )
  values (
    p_ministry_id, p_service_id, 'livekit_room', p_room_name,
    p_source_language, p_target_language, p_speaker_identity, 'initialising', auth.uid()
  )
  returning id into v_session_id;

  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'start',
    'session_id', v_session_id,
    'ministry_id', p_ministry_id,
    'room_name', p_room_name,
    'source_language', p_source_language,
    'target_language', p_target_language,
    'speaker_identity', p_speaker_identity
  )::text);

  return jsonb_build_object('session_id', v_session_id, 'reused', false);
end;
$$;

grant execute on function public.start_bot_session(uuid, text, text, text, text, uuid) to authenticated;

commit;
