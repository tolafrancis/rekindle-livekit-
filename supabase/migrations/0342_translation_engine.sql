-- 0342_translation_engine.sql
-- =====================================================================
-- "Translation Engine" admin setting (2026-09-13), scoped to Speaker Link
-- creation per explicit product decision — a ministry picks per-service,
-- not once ministry-wide.
--
-- Three choices, only two of which are real engines:
--   'rekindle_ai'   — today's pipeline (Deepgram STT -> GPT-5 translate ->
--                      ElevenLabs TTS), unchanged. High accuracy, higher
--                      latency (measured 2.5-5s translate alone).
--   'realtime_live' — genuine end-to-end speech-to-speech translation via
--                      a single continuous model (rekindle-translation-bot's
--                      new GeminiLiveEngine). Built specifically to cut the
--                      latency 'rekindle_ai' can't get under with its
--                      three-hop shape.
--   'auto'          — resolved to 'realtime_live' right here, at session
--                      creation, per explicit instruction ("Auto could
--                      select Gemini for normal live translation"). The bot
--                      never sees the literal string 'auto' — every session
--                      row and every bot_dispatch payload always carries
--                      the ALREADY-RESOLVED engine, so the bot process
--                      never has to make this decision itself.
--
-- IMPORTANT — vendor name never surfaces to admins: the UI calls this
-- engine "Realtime Live", never mentioning the underlying model. Keep that
-- split when touching this again — column/payload naming can stay accurate
-- (engine, 'realtime_live') since that's developer-facing; only rendered
-- UI text is under the naming constraint.
-- =====================================================================

begin;

alter table public.translation_sessions
  add column if not exists engine text not null default 'rekindle_ai'
    check (engine in ('rekindle_ai', 'realtime_live', 'auto'));

-- start_speaker_session: add p_engine, default 'rekindle_ai' so any existing
-- caller that doesn't pass it keeps today's behavior exactly.
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
  if p_source_language is null or p_target_language is null then
    raise exception 'source_language and target_language are required';
  end if;
  if p_engine not in ('rekindle_ai', 'realtime_live', 'auto') then
    raise exception 'Invalid engine: %', p_engine;
  end if;

  -- Resolved once, here — see this migration's header comment. Every
  -- downstream reader (the session row itself, the bot_dispatch payload)
  -- gets the real engine, never 'auto'.
  v_engine := case when p_engine = 'auto' then 'realtime_live' else p_engine end;

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

  -- Raw token is returned exactly once — only its hash is ever stored,
  -- same discipline as register_translation_device's device_key.
  return jsonb_build_object(
    'session_id', v_session_id,
    'speaker_token', v_raw_token
  );
end;
$$;

grant execute on function public.start_speaker_session(uuid, text, text, uuid, text) to authenticated;

-- speaker_session_get_link (migration 0341): the "restart an ended session"
-- branch carries forward the ORIGINAL session's engine (v_session.engine,
-- already selected via `select * into v_session`) so restarting a service
-- doesn't silently drop back to rekindle_ai.
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
    encode(digest(v_raw_token, 'sha256'), 'hex'), auth.uid(), coalesce(v_session.engine, 'rekindle_ai')
  );

  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'start',
    'session_id', v_new_session_id,
    'ministry_id', v_session.ministry_id,
    'room_name', v_room_name,
    'source_language', v_session.source_language,
    'target_language', v_session.target_language,
    'speaker_identity', v_speaker_identity,
    'engine', coalesce(v_session.engine, 'rekindle_ai')
  )::text);

  return jsonb_build_object('session_id', v_new_session_id, 'speaker_token', v_raw_token, 'restarted', true);
end;
$$;

grant execute on function public.speaker_session_get_link(uuid) to authenticated;

commit;
