-- 0369_translation_speaker_attribution.sql
-- F-CAP-3 (captions pipeline review, 2026-09-23, "Option C" design — user
-- confirmed: one bot session, host re-targets live, instead of one bot per
-- speaker). Adds:
--   1. translation_logs.speaker_name — tagged per utterance so a transcript
--      can show who said what, even though it's still one STT/translate/TTS
--      pipeline serving whoever the host currently points it at.
--   2. translation_sessions.current_speaker_identity/current_speaker_name —
--      lets the host UI show "Now captioning: X" and know who to offer as
--      the "switch to" targets, without re-deriving it from LiveKit state.
--   3. device_insert_log widened to accept p_speaker_name (the bot passes
--      whoever LiveKitAgent is currently locked onto at write time).
--   4. New retarget_bot_session RPC — same auth shape as start_bot_session/
--      stop_bot_session (is_group_admin), updates the session's current-
--      speaker columns and notifies the already-running bot process via the
--      same bot_dispatch channel start/stop already use, so it can hand off
--      live without tearing down the session.

begin;

alter table public.translation_logs
  add column if not exists speaker_name text;

alter table public.translation_sessions
  add column if not exists current_speaker_identity text,
  add column if not exists current_speaker_name text;

-- ── device_insert_log: widen with p_speaker_name ────────────────────────
-- New param appended at the end (default null) so any caller still on the
-- old 7-arg signature keeps working unchanged.
create or replace function public.device_insert_log(
  p_session_id       uuid,
  p_source_text      text,
  p_translated_text  text,
  p_stt_ms           integer default null,
  p_translate_ms     integer default null,
  p_tts_ms           integer default null,
  p_token            text default null,
  p_speaker_name     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id        uuid;
  v_device_ministry  uuid;
  v_session_ministry uuid;
  v_log_id           uuid;
begin
  select ministry_id into v_session_ministry
    from public.translation_sessions where id = p_session_id;
  if v_session_ministry is null then
    raise exception 'Unknown translation session';
  end if;

  if auth.role() <> 'service_role' then
    select device_id, ministry_id into v_device_id, v_device_ministry
      from public._translation_device_from_token(p_token);
    if v_device_id is null then
      raise exception 'Invalid or expired device token';
    end if;
    if v_device_ministry <> v_session_ministry then
      raise exception 'Device is not authorized for this session';
    end if;
  end if;

  insert into public.translation_logs (session_id, ministry_id, source_text, translated_text, stt_ms, translate_ms, tts_ms, speaker_name)
  values (p_session_id, v_session_ministry, p_source_text, p_translated_text, p_stt_ms, p_translate_ms, p_tts_ms, p_speaker_name)
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.device_insert_log(uuid, text, text, integer, integer, integer, text, text) to anon, authenticated, service_role;

-- ── retarget_bot_session ─────────────────────────────────────────────────
create or replace function public.retarget_bot_session(
  p_session_id       uuid,
  p_speaker_identity text,
  p_speaker_name     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ministry_id uuid;
  v_status      text;
begin
  select ministry_id, status into v_ministry_id, v_status
    from public.translation_sessions where id = p_session_id;
  if v_ministry_id is null then
    raise exception 'Unknown translation session';
  end if;
  if auth.uid() is null or not public.is_group_admin(v_ministry_id, auth.uid()) then
    raise exception 'Not authorized to retarget this session';
  end if;
  if v_status in ('ended', 'error') then
    raise exception 'This session has already ended';
  end if;

  update public.translation_sessions
    set current_speaker_identity = p_speaker_identity,
        current_speaker_name = p_speaker_name
    where id = p_session_id;

  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'retarget',
    'session_id', p_session_id,
    'speaker_identity', p_speaker_identity,
    'speaker_name', p_speaker_name
  )::text);
end;
$$;

grant execute on function public.retarget_bot_session(uuid, text, text) to authenticated;

commit;
