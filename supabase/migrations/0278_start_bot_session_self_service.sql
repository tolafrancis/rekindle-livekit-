-- 0278_start_bot_session_self_service.sql
-- =====================================================================
-- "Ask a question" (build plan: bidirectional Q&A translation) — lets a
-- participant push-to-talk a REVERSE translation (their language -> the
-- room's source language) without a host bottleneck, e.g. a Spanish
-- listener asks a question and the English-speaking host hears it in
-- English. Reuses the exact same bot-dispatch mechanism as the host's
-- "+ Add language" flow — just triggered by a participant, for a
-- session where they name themselves as the speaker.
--
-- start_bot_session previously required is_group_admin — a plain
-- participant could never call it at all. This adds a second,
-- self-service path: any ministry MEMBER (not stranger, not guest) may
-- start a session, but ONLY ever naming themselves
-- (p_speaker_identity = auth.uid()::text) as the speaker — never
-- anyone else's identity, and the admin-only path above is untouched.
-- That closes the obvious abuse hole (a stranger spinning up arbitrary
-- paid STT/translate/TTS sessions) while enabling self-service.
--
-- Also adds a light concurrency guard (max 5 non-ended sessions per
-- ministry) — the dashboard's "Start Service" flow has no such cap
-- today because a host manually starting sessions is naturally
-- self-limiting; self-service dispatch has no such friction, so it
-- gets an explicit ceiling instead.
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
  v_session_id      uuid;
  v_existing        uuid;
  v_active_count    integer;
  v_is_admin        boolean;
  v_is_self_service boolean;
begin
  v_is_admin := auth.uid() is not null and public.is_group_admin(p_ministry_id, auth.uid());

  v_is_self_service := auth.uid() is not null
    and p_speaker_identity = auth.uid()::text
    and public.is_group_member(p_ministry_id, auth.uid());

  if not (v_is_admin or v_is_self_service) then
    raise exception 'Not authorized to start a translation session for this ministry';
  end if;

  if v_is_self_service and not v_is_admin then
    select count(*) into v_active_count
      from public.translation_sessions
      where ministry_id = p_ministry_id
        and status in ('initialising', 'joining', 'active', 'paused');
    if v_active_count >= 5 then
      raise exception 'Too many live translations running for this ministry right now — try again shortly';
    end if;
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
