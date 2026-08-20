-- 0286_device_start_session.sql
-- =====================================================================
-- Phase 4 (docs/rlt-build-checklist.md, edge agent build 2026-08-21): a
-- real gap in the original Phase 1 migration — start_bot_session exists
-- for the LiveKit-room pipeline (admin-triggered, source_type =
-- 'livekit_room'), but nothing lets the PA-MIXER pipeline create its own
-- translation_sessions row at all. device_update_session/device_insert_log
-- can only ever UPDATE a session that already exists.
--
-- Also folds in a real architecture finding from reading the actual
-- current bot code (not the original written plan, which predates this):
-- rekindle-translation-bot's /display delivery has since moved OFF HLS
-- entirely (config.ts: "WebRTC-only delivery... no HLS/Egress/S3
-- pipeline at all") onto a direct LiveKit room connection
-- (translation-listener-token + TranslationDisplayPage.tsx's Room.connect).
-- The edge agent is built the same way — it publishes its translated
-- audio into a LiveKit room (as a "rlt-bot-{sessionId}" participant,
-- identical identity/track-name convention the cloud bot already uses) —
-- so device_start_session auto-generates a room name rather than taking
-- one as input; there's no existing "meeting room" to join for a PA
-- session the way there is for the LiveKit-room pipeline.
-- =====================================================================

begin;

create or replace function public.device_start_session(
  p_token             text,
  p_source_language   text,
  p_target_language   text,
  p_service_id        uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_device_id       uuid;
  v_device_ministry uuid;
  v_room_name       text;
  v_session_id      uuid;
begin
  select device_id, ministry_id into v_device_id, v_device_ministry
    from public._translation_device_from_token(p_token);
  if v_device_id is null then
    raise exception 'Invalid or expired device token';
  end if;
  if p_source_language is null or p_target_language is null then
    raise exception 'source_language and target_language are required';
  end if;

  -- Unlike the LiveKit-room pipeline (which joins a room a meeting/
  -- broadcast already created), a PA session has no existing room — the
  -- edge agent's local mic input IS the source, so this mints one.
  v_room_name := 'pa-' || v_device_id::text || '-' || extract(epoch from now())::bigint::text;

  insert into public.translation_sessions (
    ministry_id, service_id, source_type, livekit_room_name,
    source_language, target_language, status, created_by
  )
  values (
    v_device_ministry, p_service_id, 'pa_mixer', v_room_name,
    p_source_language, p_target_language, 'initialising', null
  )
  returning id into v_session_id;

  return jsonb_build_object('session_id', v_session_id, 'room_name', v_room_name);
end;
$$;

grant execute on function public.device_start_session(text, text, text, uuid) to anon, authenticated, service_role;

commit;
