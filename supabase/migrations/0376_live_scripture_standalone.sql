-- =====================================================================
-- Live Scripture, standalone from Captions
--
-- Every Live Scripture surface (translation_scripture_events,
-- speaker_show_scripture/speaker_scripture_settings, ScripturePanel.tsx,
-- LiveScriptureOperatorCard.tsx) is keyed on translation_sessions.id —
-- none of that changes here. The actual gap: Meetings, Live Broadcast, and
-- Webinar only ever GET a translation_sessions row when Captions (or real
-- cross-language Translation) is turned on, via start_bot_session's
-- self-service path (0291) or the anon-safe start_captions_session (0289) /
-- start_webinar_captions_session (0358). Captions off meant Scripture had
-- nothing to attach to.
--
-- Adds a fourth session_kind, 'scripture_only': a session row that exists
-- purely as an anchor for translation_scripture_events, with no bot ever
-- dispatched for it (no pg_notify -> no STT, no cost, no dub audio). All
-- three dispatch RPCs get the same two behavior changes:
--   1. Skip pg_notify entirely when p_session_kind = 'scripture_only'.
--   2. If an EXISTING session for the room is found and it's a dormant
--      'scripture_only' row but the caller now wants a real kind
--      ('captions'/'translate'), upgrade it in place (session_kind update +
--      pg_notify now) instead of silently returning reused:true with no
--      bot ever running. A real existing session is always just reused
--      as-is regardless of what's requested — it already does more than
--      Scripture alone needs.
-- This means turning Scripture on alone creates a real but bot-less, free
-- session; turning Captions on afterward for the same room upgrades that
-- SAME session rather than forking a second one, so verses shown before
-- Captions started stay in the same event log for the rest of the
-- meeting/broadcast/webinar. Cleanup-on-end needs no new code: both
-- MinistryInteractiveMeetings.tsx's and webinarControl.ts's existing
-- stopTranslationForRoom() already stop EVERY non-ended session for the
-- room with no session_kind filter, so a scripture_only row is already
-- caught by the exact same call today.
-- =====================================================================

begin;

alter table public.translation_sessions
  drop constraint if exists translation_sessions_session_kind_check;
alter table public.translation_sessions
  add constraint translation_sessions_session_kind_check
    check (session_kind in ('translate', 'captions', 'notes', 'scripture_only'));

-- ---------------------------------------------------------------------
-- start_bot_session — Meetings' and Webinar-host's self-service path
-- (FloatingTranslationButton.tsx). Signature unchanged (p_session_kind
-- already existed, default 'translate').
-- ---------------------------------------------------------------------
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
  v_existing_kind   text;
  v_active_count    integer;
  v_is_admin        boolean;
  v_is_self_service boolean;
begin
  if p_session_kind not in ('translate', 'captions', 'notes', 'scripture_only') then
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

  select id, session_kind into v_existing, v_existing_kind
    from public.translation_sessions
    where ministry_id = p_ministry_id
      and livekit_room_name = p_room_name
      and target_language = p_target_language
      and status in ('initialising', 'joining', 'active', 'paused')
    order by created_at desc
    limit 1;

  if v_existing is not null then
    if v_existing_kind = 'scripture_only' and p_session_kind <> 'scripture_only' then
      update public.translation_sessions set session_kind = p_session_kind where id = v_existing;
      perform pg_notify('bot_dispatch', jsonb_build_object(
        'action', 'start',
        'session_id', v_existing,
        'ministry_id', p_ministry_id,
        'room_name', p_room_name,
        'source_language', p_source_language,
        'target_language', p_target_language,
        'speaker_identity', p_speaker_identity
      )::text);
    end if;
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

  if p_session_kind <> 'scripture_only' then
    perform pg_notify('bot_dispatch', jsonb_build_object(
      'action', 'start',
      'session_id', v_session_id,
      'ministry_id', p_ministry_id,
      'room_name', p_room_name,
      'source_language', p_source_language,
      'target_language', p_target_language,
      'speaker_identity', p_speaker_identity
    )::text);
  end if;

  return jsonb_build_object('session_id', v_session_id, 'reused', false);
end;
$$;

grant execute on function public.start_bot_session(uuid, text, text, text, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- start_captions_session — Live Broadcast anon viewers (BroadcastTranslationButton.tsx).
-- Drop the old 1-arg overload first: create or replace with a DIFFERENT
-- signature adds a second overload rather than replacing it, and an
-- existing caller passing only p_channel_id (every caller today, since
-- p_session_kind is new) would then be genuinely ambiguous between the
-- two — PostgREST has no reliable way to prefer one, since a defaulted
-- p_session_kind makes the 2-arg version an equally valid match for a
-- 1-arg call. One function, one signature, no ambiguity.
-- ---------------------------------------------------------------------
drop function if exists public.start_captions_session(uuid);

create or replace function public.start_captions_session(p_channel_id uuid, p_session_kind text default 'captions')
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
  v_existing_kind   text;
  v_session_id      uuid;
begin
  if p_session_kind not in ('captions', 'scripture_only') then
    raise exception 'Invalid session kind: %', p_session_kind;
  end if;

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

  v_room_name := 'channel-' || p_channel_id::text;

  select id, session_kind into v_existing, v_existing_kind
    from public.translation_sessions
    where ministry_id = v_ministry_id
      and livekit_room_name = v_room_name
      and target_language = v_source_language
      and status in ('initialising', 'joining', 'active', 'paused')
    order by created_at desc
    limit 1;

  if v_existing is not null then
    if v_existing_kind = 'scripture_only' and p_session_kind <> 'scripture_only' then
      update public.translation_sessions set session_kind = p_session_kind where id = v_existing;
      perform pg_notify('bot_dispatch', jsonb_build_object(
        'action', 'start',
        'session_id', v_existing,
        'ministry_id', v_ministry_id,
        'room_name', v_room_name,
        'source_language', v_source_language,
        'target_language', v_source_language,
        'speaker_identity', null
      )::text);
    end if;
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
    p_session_kind
  )
  returning id into v_session_id;

  if p_session_kind <> 'scripture_only' then
    perform pg_notify('bot_dispatch', jsonb_build_object(
      'action', 'start',
      'session_id', v_session_id,
      'ministry_id', v_ministry_id,
      'room_name', v_room_name,
      'source_language', v_source_language,
      'target_language', v_source_language,
      'speaker_identity', null
    )::text);
  end if;

  return jsonb_build_object('session_id', v_session_id, 'reused', false);
end;
$$;

grant execute on function public.start_captions_session(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- start_webinar_captions_session — Webinar anon viewers (WebinarTranslationButton.tsx).
-- Also fixes: this one never set session_kind on insert at all (unlike its
-- two siblings), silently defaulting to 'translate' for what's actually a
-- captions dispatch — set it explicitly now. Same old-overload drop as
-- start_captions_session above, same reason.
-- ---------------------------------------------------------------------
drop function if exists public.start_webinar_captions_session(uuid);

create or replace function public.start_webinar_captions_session(p_webinar_id uuid, p_session_kind text default 'captions')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_webinar_id      uuid;
  v_ministry_id     uuid;
  v_status          text;
  v_room_name       text;
  v_source_language text;
  v_existing        uuid;
  v_existing_kind   text;
  v_session_id      uuid;
begin
  if p_session_kind not in ('captions', 'scripture_only') then
    raise exception 'Invalid session kind: %', p_session_kind;
  end if;

  select id, ministry_id, status, room_name
    into v_webinar_id, v_ministry_id, v_status, v_room_name
    from public.ministry_webinars
    where id = p_webinar_id;

  if v_webinar_id is null then
    raise exception 'Webinar not found';
  end if;

  if v_status <> 'live' then
    raise exception 'This webinar is not currently live';
  end if;

  if exists (
    select 1 from public.language_configs lc
    where lc.ministry_id = v_ministry_id and lc.is_public = false
  ) then
    raise exception 'Captions are not available for this webinar';
  end if;

  select coalesce(source_language, 'en') into v_source_language
    from public.language_configs
    where ministry_id = v_ministry_id;
  v_source_language := coalesce(v_source_language, 'en');

  select id, session_kind into v_existing, v_existing_kind
    from public.translation_sessions
    where ministry_id = v_ministry_id
      and livekit_room_name = v_room_name
      and target_language = v_source_language
      and status in ('initialising', 'joining', 'active', 'paused')
    order by created_at desc
    limit 1;

  if v_existing is not null then
    if v_existing_kind = 'scripture_only' and p_session_kind <> 'scripture_only' then
      update public.translation_sessions set session_kind = p_session_kind where id = v_existing;
      perform pg_notify('bot_dispatch', jsonb_build_object(
        'action', 'start',
        'session_id', v_existing,
        'ministry_id', v_ministry_id,
        'room_name', v_room_name,
        'source_language', v_source_language,
        'target_language', v_source_language,
        'speaker_identity', null
      )::text);
    end if;
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
    p_session_kind
  )
  returning id into v_session_id;

  if p_session_kind <> 'scripture_only' then
    perform pg_notify('bot_dispatch', jsonb_build_object(
      'action', 'start',
      'session_id', v_session_id,
      'ministry_id', v_ministry_id,
      'room_name', v_room_name,
      'source_language', v_source_language,
      'target_language', v_source_language,
      'speaker_identity', null
    )::text);
  end if;

  return jsonb_build_object('session_id', v_session_id, 'reused', false);
end;
$$;

grant execute on function public.start_webinar_captions_session(uuid, text) to anon, authenticated;

commit;
