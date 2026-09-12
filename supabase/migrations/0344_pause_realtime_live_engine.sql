-- 0344_pause_realtime_live_engine.sql
-- =====================================================================
-- URGENT correctness fix (2026-09-13, same day as 0342/0343): "Realtime
-- Live" (GeminiLiveEngine) was tested against a real Gemini Live session
-- and confirmed non-functional — audio verifiably reaches the model (real
-- peak-level telemetry, 700+ server messages received) but it never once
-- generates a response (no serverContent, ever — only sessionResumptionUpdate
-- housekeeping messages), through two different fix attempts (dropping
-- invalid setup fields, explicit high-sensitivity VAD config), with zero
-- error feedback from the API to chase further. Root cause: the preview
-- model's actual server behavior diverging from its own documentation, not
-- something fixable from this codebase alone.
--
-- The real danger this migration closes: 'auto' was resolving to
-- 'realtime_live' (0342/0343's explicit instruction — "Auto could select
-- Gemini for normal live translation"), and "Auto" is the pre-selected,
-- "Recommended" default option in the already-shipped Create Speaker Link
-- dialog. Every admin who took the default got a silently broken session.
--
-- Fix: 'auto' now resolves to 'rekindle_ai' (the only confirmed-working
-- engine) until Realtime Live is actually fixed. The UI's "Realtime Live"
-- radio option is removed in this same commit (MinistryTranslationServiceManager.tsx)
-- so no admin can select a known-broken engine at all — 'realtime_live'
-- stays a valid, functioning CODE PATH (BotSession.ts, GeminiLiveEngine.ts)
-- for whenever this is revisited, just not reachable from the UI right now.
-- =====================================================================

begin;

create or replace function public.start_speaker_session(
  p_ministry_id      uuid,
  p_source_language  text,
  p_target_language  text,
  p_service_id       uuid default null,
  p_engine           text default 'rekindle_ai'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session_id       uuid := gen_random_uuid();
  v_room_name        text;
  v_raw_token        text;
  v_speaker_identity text;
  v_engine           text;
begin
  if auth.uid() is null or not public.is_group_admin(p_ministry_id, auth.uid()) then
    raise exception 'Not authorized to start a speaker session for this ministry';
  end if;
  if not public.ministry_has_active_translation_plan(p_ministry_id) then
    raise exception 'Live Translation requires a paid ministry plan. Upgrade in Billing settings to use this feature.';
  end if;
  if p_source_language is null or p_target_language is null then
    raise exception 'source_language and target_language are required';
  end if;
  if p_engine not in ('rekindle_ai', 'realtime_live', 'auto') then
    raise exception 'Invalid engine: %', p_engine;
  end if;

  -- PAUSED (see header comment): was 'realtime_live', now 'rekindle_ai'
  -- until Realtime Live is confirmed working again.
  v_engine := case when p_engine = 'auto' then 'rekindle_ai' else p_engine end;

  v_room_name        := 'speaker-' || v_session_id::text;
  v_speaker_identity := 'speaker-' || v_session_id::text;
  v_raw_token         := encode(gen_random_bytes(24), 'hex');

  insert into public.translation_sessions (
    id, ministry_id, service_id, source_type, livekit_room_name,
    source_language, target_language, speaker_identity, status,
    speaker_token_hash, created_by, engine
  )
  values (
    v_session_id, p_ministry_id, p_service_id, 'browser_speaker', v_room_name,
    p_source_language, p_target_language, v_speaker_identity, 'initialising',
    encode(digest(v_raw_token, 'sha256'), 'hex'), auth.uid(), v_engine
  );

  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'start',
    'session_id', v_session_id,
    'ministry_id', p_ministry_id,
    'room_name', v_room_name,
    'source_language', p_source_language,
    'target_language', p_target_language,
    'speaker_identity', v_speaker_identity,
    'engine', v_engine
  )::text);

  return jsonb_build_object('session_id', v_session_id, 'speaker_token', v_raw_token);
end;
$$;

grant execute on function public.start_speaker_session(uuid, text, text, uuid, text) to authenticated;

-- speaker_session_get_link's restart branch carries forward whatever engine
-- the ORIGINAL session already had (v_session.engine) — no change needed
-- here for existing rows, but any row that was already stored as
-- 'realtime_live' from before this pause will keep restarting as
-- 'realtime_live' (a known, broken engine) since this function only reads,
-- never re-resolves, the stored value. Explicitly downgrade on restart too,
-- so "Restart" on an old Realtime Live session doesn't perpetuate it.
create or replace function public.speaker_session_get_link(
  p_session_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session          record;
  v_new_session_id   uuid;
  v_room_name        text;
  v_raw_token        text;
  v_speaker_identity text;
  v_restart_engine   text;
begin
  select * into v_session
    from public.translation_sessions
    where id = p_session_id and source_type = 'browser_speaker';

  if v_session.id is null then
    raise exception 'Speaker session not found';
  end if;
  if auth.uid() is null or not public.is_group_admin(v_session.ministry_id, auth.uid()) then
    raise exception 'Not authorized for this session';
  end if;

  v_raw_token := encode(gen_random_bytes(24), 'hex');

  if v_session.status <> 'ended' then
    update public.translation_sessions
      set speaker_token_hash = encode(digest(v_raw_token, 'sha256'), 'hex')
      where id = p_session_id;

    return jsonb_build_object('session_id', p_session_id, 'speaker_token', v_raw_token, 'restarted', false);
  end if;

  -- PAUSED (see this migration's header comment): downgrade a restarted
  -- realtime_live session to rekindle_ai rather than perpetuating a known-
  -- broken engine.
  v_restart_engine := case when coalesce(v_session.engine, 'rekindle_ai') = 'realtime_live'
                        then 'rekindle_ai'
                        else coalesce(v_session.engine, 'rekindle_ai') end;

  v_new_session_id   := gen_random_uuid();
  v_room_name        := 'speaker-' || v_new_session_id::text;
  v_speaker_identity := 'speaker-' || v_new_session_id::text;

  insert into public.translation_sessions (
    id, ministry_id, service_id, source_type, livekit_room_name,
    source_language, target_language, speaker_identity, status,
    speaker_token_hash, created_by, engine
  )
  values (
    v_new_session_id, v_session.ministry_id, v_session.service_id, 'browser_speaker', v_room_name,
    v_session.source_language, v_session.target_language, v_speaker_identity, 'initialising',
    encode(digest(v_raw_token, 'sha256'), 'hex'), auth.uid(), v_restart_engine
  );

  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'start',
    'session_id', v_new_session_id,
    'ministry_id', v_session.ministry_id,
    'room_name', v_room_name,
    'source_language', v_session.source_language,
    'target_language', v_session.target_language,
    'speaker_identity', v_speaker_identity,
    'engine', v_restart_engine
  )::text);

  return jsonb_build_object('session_id', v_new_session_id, 'speaker_token', v_raw_token, 'restarted', true);
end;
$$;

grant execute on function public.speaker_session_get_link(uuid) to authenticated;

commit;
