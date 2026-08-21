-- 0289_start_captions_session_public.sql
-- =====================================================================
-- "Show Captions" (standalone from Live Translate) — see the plan this
-- implements: rekindle-livekit-'s Interactive Meeting + Live Broadcast
-- captions feature, 2026-08-22.
--
-- The one genuinely new piece of backend surface that feature needs.
-- Interactive Meetings and Live Broadcast HOSTS already have everything
-- they need via the existing start_bot_session (its self-service path,
-- migration 0278, already lets any real ministry member dispatch a
-- session for themselves with source_language == target_language — no
-- constraint anywhere prevents that). Live Broadcast VIEWERS are the gap:
-- they are frequently anonymous (packages/live/src/components/
-- LiveChannelViewer.tsx passes `userId: user?.id || 'anonymous'`), and
-- start_bot_session is granted only to `authenticated` with an
-- is_group_member check on top — genuinely unusable by an anon viewer.
--
-- This function is deliberately narrower than start_bot_session, not just
-- "the same thing minus the auth check":
--   - Takes only a channel id, never a caller-supplied ministry/room —
--     both are derived server-side from live_channels, same reasoning
--     translation-listener-token already uses for deriving room name
--     from a sessionId rather than trusting a client-supplied one.
--   - Accepts NO target_language parameter at all. target_language is
--     hardcoded to the ministry's own source_language internally, so this
--     function can never be used to spin up a real (costed) translation —
--     only ever the one same-language captions session per room the
--     existing dedupe key (ministry_id, room_name, target_language)
--     already guarantees is unique, no matter how many anonymous viewers
--     click "Show Captions" independently.
--   - Requires the channel to actually be live, and reuses the exact
--     "public unless explicitly private" predicate /display's own anon
--     SELECT policies already use (migration 0273) — not a new privacy
--     model, the same trust boundary this exact viewer surface already
--     operates under for watching the broadcast itself.
-- =====================================================================

begin;

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

  select coalesce(source_language, 'en') into v_source_language
    from public.language_configs
    where ministry_id = v_ministry_id;
  v_source_language := coalesce(v_source_language, 'en');

  -- Matches FloatingTranslationButton's own roomName={`channel-${channel.id}`}
  -- for the host side of the exact same broadcast (LiveChannelBroadcast.tsx)
  -- — both sides of one broadcast must resolve to the identical LiveKit room.
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
    source_language, target_language, speaker_identity, status, created_by
  )
  values (
    v_ministry_id, null, 'livekit_room', v_room_name,
    v_source_language, v_source_language, null, 'initialising',
    case when auth.uid() is not null then auth.uid() else null end
  )
  returning id into v_session_id;

  -- Same shape every other bot_dispatch caller uses — the bot service
  -- doesn't distinguish source_type or who dispatched it, it just joins
  -- whatever room_name it's told and locks onto whatever speaker_identity
  -- it's given (null here = first-active-speaker fallback, same as the
  -- host's own "+ Add language").
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
