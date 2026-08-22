-- 0291_translation_session_kind.sql
-- =====================================================================
-- Real bug reported live (2026-08-22): clicking "Show Captions" was also
-- auto-activating the AI Notes banner ("your speech may be transcribed,
-- feel free to ask questions...") for EVERY participant in the meeting.
--
-- Root cause: useMeetingNotes.ts's syncSession() treats the mere EXISTENCE
-- of any active translation_sessions row for the room as "AI Notes must be
-- running" (setActive(true)) — a reasonable inference back when the only
-- way a SAME-LANGUAGE session could exist was AI Notes' own dispatch. Show
-- Captions (this session's earlier feature) also dispatches a same-
-- language session now, for an entirely different reason, and
-- translation_sessions has never recorded WHY a session was created —
-- source_type only records the audio pipeline (livekit_room/pa_mixer/
-- browser_speaker), not the caller's intent.
--
-- Adds an explicit session_kind so every reader can tell these apart
-- instead of guessing from source_language == target_language (which is
-- also true of a real cross-language translation dispatched with an
-- 'auto' source — see migration 0290 — so that heuristic was never fully
-- reliable either).
-- =====================================================================

begin;

alter table public.translation_sessions
  add column if not exists session_kind text not null default 'translate'
    check (session_kind in ('translate', 'captions', 'notes'));

-- start_bot_session (Meetings + Live Broadcast host + PA/self-service):
-- adds p_session_kind, defaulted 'translate' so every EXISTING caller
-- (real cross-language "+ Add language", "Ask a question" reverse-
-- translate, MinistryTranslationServiceManager's Start Service) is
-- unaffected without touching a single call site. Only
-- FloatingTranslationButton.tsx's startCaptionsSession() and
-- useMeetingNotes.ts's own dispatch pass a non-default value.
create or replace function public.start_bot_session(
  p_ministry_id       uuid,
  p_room_name         text,
  p_source_language   text,
  p_target_language   text,
  p_speaker_identity  text default null,
  p_service_id        uuid default null,
  p_session_kind      text default 'translate'
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
  if p_session_kind not in ('translate', 'captions', 'notes') then
    raise exception 'Invalid session kind: %', p_session_kind;
  end if;

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
    source_language, target_language, speaker_identity, status, created_by,
    session_kind
  )
  values (
    p_ministry_id, p_service_id, 'livekit_room', p_room_name,
    p_source_language, p_target_language, p_speaker_identity, 'initialising', auth.uid(),
    p_session_kind
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

grant execute on function public.start_bot_session(uuid, text, text, text, text, uuid, text) to authenticated;

-- start_captions_session (Live Broadcast anonymous viewers, migration
-- 0289/0290): always a captions-only dispatch by construction — hardcode
-- session_kind rather than adding a parameter nothing would ever vary.
create or replace function public.start_captions_session(p_channel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id      uuid;
  v_ministry_id     uuid;
  v_is_live         boolean;
  v_is_hls_live     boolean;
  v_source_language text;
  v_room_name       text;
  v_existing        uuid;
  v_session_id      uuid;
begin
  select id, ministry_id, is_live, is_hls_live
    into v_channel_id, v_ministry_id, v_is_live, v_is_hls_live
    from public.live_channels
    where id = p_channel_id;

  if v_channel_id is null then
    raise exception 'Channel not found';
  end if;

  if not (coalesce(v_is_live, false) or coalesce(v_is_hls_live, false)) then
    raise exception 'This channel is not currently live';
  end if;

  if exists (
    select 1 from public.language_configs lc
    where lc.ministry_id = v_ministry_id and lc.is_public = false
  ) then
    raise exception 'Captions are not available for this broadcast';
  end if;

  select coalesce(source_language, 'auto') into v_source_language
    from public.language_configs
    where ministry_id = v_ministry_id;
  v_source_language := coalesce(v_source_language, 'auto');

  v_room_name := 'channel-' || p_channel_id::text;

  select id into v_existing
    from public.translation_sessions
    where ministry_id = v_ministry_id
      and livekit_room_name = v_room_name
      and target_language = v_source_language
      and status in ('initialising', 'joining', 'active', 'paused')
    order by created_at desc
    limit 1;

  if v_existing is not null then
    return jsonb_build_object('session_id', v_existing, 'reused', true);
  end if;

  insert into public.translation_sessions (
    ministry_id, service_id, source_type, livekit_room_name,
    source_language, target_language, speaker_identity, status, created_by,
    session_kind
  )
  values (
    v_ministry_id, null, 'livekit_room', v_room_name,
    v_source_language, v_source_language, null, 'initialising',
    case when auth.uid() is not null then auth.uid() else null end,
    'captions'
  )
  returning id into v_session_id;

  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'start',
    'session_id', v_session_id,
    'ministry_id', v_ministry_id,
    'room_name', v_room_name,
    'source_language', v_source_language,
    'target_language', v_source_language,
    'speaker_identity', null
  )::text);

  return jsonb_build_object('session_id', v_session_id, 'reused', false);
end;
$$;

grant execute on function public.start_captions_session(uuid) to anon, authenticated;

commit;
