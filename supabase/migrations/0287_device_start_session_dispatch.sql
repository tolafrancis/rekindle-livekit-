-- 0287_device_start_session_dispatch.sql
-- =====================================================================
-- Real architecture revision (2026-08-21), decided before building the
-- edge agent itself: rather than the edge agent running its own local
-- Deepgram/GPT-4o/ElevenLabs pipeline (the written plan's §4.2-4.3 — which
-- would mean shipping real third-party API keys inside installed client
-- software on every church's own PC, extractable by anyone with the
-- installer), the edge agent is a thin LiveKit audio bridge: it publishes
-- the PA mixer's audio as a normal room participant and subscribes back
-- to the CLOUD bot's translated track for local PA playback. All
-- STT/translate/TTS stays server-side, unchanged — same bot, same code,
-- same API keys that already exist today for meetings/broadcasts.
--
-- That means starting a PA session now needs to do everything
-- start_bot_session already does for the LiveKit-room pipeline —
-- including firing pg_notify('bot_dispatch', ...) so a cloud bot actually
-- joins the room device_start_session just created. speaker_identity is
-- set to 'pa-device-{device_id}' (fixed/deterministic — known before the
-- edge agent has even connected) so the bot locks onto the edge agent
-- specifically rather than the fallback "first speaker" mode.
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
  v_speaker_identity text;
begin
  select device_id, ministry_id into v_device_id, v_device_ministry
    from public._translation_device_from_token(p_token);
  if v_device_id is null then
    raise exception 'Invalid or expired device token';
  end if;
  if p_source_language is null or p_target_language is null then
    raise exception 'source_language and target_language are required';
  end if;

  v_room_name := 'pa-' || v_device_id::text || '-' || extract(epoch from now())::bigint::text;
  -- Matches translation-device-publish-token's own botIdentity for the
  -- edge agent's join — fixed so it's known before the agent connects.
  v_speaker_identity := 'pa-device-' || v_device_id::text;

  insert into public.translation_sessions (
    ministry_id, service_id, source_type, livekit_room_name,
    source_language, target_language, speaker_identity, status, created_by
  )
  values (
    v_device_ministry, p_service_id, 'pa_mixer', v_room_name,
    p_source_language, p_target_language, v_speaker_identity, 'initialising', null
  )
  returning id into v_session_id;

  -- Same shape start_bot_session's own pg_notify uses — the bot service
  -- doesn't distinguish source_type, it just joins whatever room_name it's
  -- told to and locks onto whatever speaker_identity it's given.
  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'start',
    'session_id', v_session_id,
    'ministry_id', v_device_ministry,
    'room_name', v_room_name,
    'source_language', p_source_language,
    'target_language', p_target_language,
    'speaker_identity', v_speaker_identity
  )::text);

  return jsonb_build_object('session_id', v_session_id, 'room_name', v_room_name, 'speaker_identity', v_speaker_identity);
end;
$$;

grant execute on function public.device_start_session(text, text, text, uuid) to anon, authenticated, service_role;

commit;
