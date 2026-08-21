-- 0288_speaker_sessions.sql
-- =====================================================================
-- "Speaker Link" — a third way to start a translation session, alongside
-- Meetings (start_bot_session) and the PA edge agent (device_start_session).
-- No video call, no installed software: an admin generates a link from the
-- Service tab, hands it to whoever's speaking, they open it in any browser,
-- tap "Start Speaking", and their mic publishes straight into a LiveKit
-- room the cloud bot joins — same bot, same STT/translate/TTS pipeline
-- every other pipeline already uses. Listeners still use the existing
-- /display/:sessionId link, unchanged.
--
-- Auth model (explicit product decision, not a default): an unguessable
-- token in the link is the only gate, same shape as a Zoom link or this
-- app's own /display links — no login required to speak. That means the
-- link itself is as sensitive as a password: whoever holds it can publish
-- audio into the session. Scoped to exactly one session (not a reusable
-- credential like a PA device_key), so a leaked link's blast radius is one
-- service, not indefinite access.
--
-- One language pair per link (also explicit) — matches the PA device
-- model, not Meetings' multi-pair "Start Service". Running the same
-- speaker into several target languages at once means generating several
-- speaker links, each with its own room — a real limitation, not hidden:
-- documented in the dashboard UI, not just here.
-- =====================================================================

begin;

alter table public.translation_sessions
  add column if not exists speaker_token_hash text;

-- Widen source_type's CHECK constraint to allow 'browser_speaker' — the
-- original (migration 0273) only allows 'livekit_room'/'pa_mixer', and
-- start_speaker_session below would violate it on every insert otherwise.
-- Found by name dynamically (not hardcoded) since it was declared inline
-- with no explicit name, so its actual auto-generated name shouldn't be
-- guessed at — this finds whatever check constraint on this table actually
-- mentions source_type and replaces exactly that one.
do $$
declare
  v_conname text;
begin
  select conname into v_conname
    from pg_constraint
    where conrelid = 'public.translation_sessions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%source_type%';
  if v_conname is not null then
    execute format('alter table public.translation_sessions drop constraint %I', v_conname);
  end if;
end $$;

alter table public.translation_sessions
  add constraint translation_sessions_source_type_check
  check (source_type in ('livekit_room', 'pa_mixer', 'browser_speaker'));

-- Admin-only, same authorization shape as start_bot_session. Generates its
-- own room (no existing meeting/device involved) and dispatches the bot
-- exactly like every other pipeline — the bot service doesn't distinguish
-- source_type, it just joins whatever room_name/speaker_identity it's told.
create or replace function public.start_speaker_session(
  p_ministry_id      uuid,
  p_source_language  text,
  p_target_language  text,
  p_service_id       uuid default null
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
begin
  if auth.uid() is null or not public.is_group_admin(p_ministry_id, auth.uid()) then
    raise exception 'Not authorized to start a speaker session for this ministry';
  end if;
  if p_source_language is null or p_target_language is null then
    raise exception 'source_language and target_language are required';
  end if;

  v_room_name        := 'speaker-' || v_session_id::text;
  v_speaker_identity := 'speaker-' || v_session_id::text;
  v_raw_token         := encode(gen_random_bytes(24), 'hex');

  insert into public.translation_sessions (
    id, ministry_id, service_id, source_type, livekit_room_name,
    source_language, target_language, speaker_identity, status,
    speaker_token_hash, created_by
  )
  values (
    v_session_id, p_ministry_id, p_service_id, 'browser_speaker', v_room_name,
    p_source_language, p_target_language, v_speaker_identity, 'initialising',
    encode(digest(v_raw_token, 'sha256'), 'hex'), auth.uid()
  );

  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'start',
    'session_id', v_session_id,
    'ministry_id', p_ministry_id,
    'room_name', v_room_name,
    'source_language', p_source_language,
    'target_language', p_target_language,
    'speaker_identity', v_speaker_identity
  )::text);

  -- Raw token is returned exactly once — only its hash is ever stored,
  -- same discipline as register_translation_device's device_key.
  return jsonb_build_object(
    'session_id', v_session_id,
    'speaker_token', v_raw_token
  );
end;
$$;

grant execute on function public.start_speaker_session(uuid, text, text, uuid) to authenticated;

-- Token-authorized, not admin-authorized — the speaker's own browser calls
-- this directly (no Supabase session), same trust model as
-- device_update_session's token path. Distinct from stop_bot_session
-- (admin-only) since a speaker link visitor is never a ministry admin.
create or replace function public.speaker_stop_session(
  p_session_id     uuid,
  p_speaker_token  text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select speaker_token_hash into v_hash
    from public.translation_sessions
    where id = p_session_id and source_type = 'browser_speaker';

  if v_hash is null or v_hash <> encode(digest(coalesce(p_speaker_token, ''), 'sha256'), 'hex') then
    raise exception 'Invalid speaker token';
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

grant execute on function public.speaker_stop_session(uuid, text) to anon, authenticated;

commit;
