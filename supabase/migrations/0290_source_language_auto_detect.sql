-- 0290_source_language_auto_detect.sql
-- =====================================================================
-- "Auto-detect the spoken language" (2026-08-22) — real gap reported live:
-- Show Captions (and a couple of other same-language STT dispatches) were
-- effectively pinned to English whenever a ministry hadn't explicitly
-- configured a source_language, because every fallback in this system
-- defaulted to the string 'en'. 'auto' is now a real, understood sentinel
-- (no schema change needed — source_language has always been a plain `text`
-- column, never constrained to ISO codes): rekindle-translation-bot's
-- AudioPipeline.ts reads it and switches Deepgram into real-time
-- multilingual mode instead of pinning STT to one language.
--
-- This migration only updates start_captions_session's OWN fallback (used
-- when a ministry's language_configs row has no source_language at all,
-- which shouldn't normally happen since the column is `not null default
-- 'en'`, but this function coalesces defensively anyway) from 'en' to
-- 'auto' — the same behavior-only change already made to
-- MinistryTranslationSettings.tsx's new-ministry default. Existing
-- ministries with an explicit source_language keep it untouched; this
-- function already just forwards whatever's actually stored.
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
    source_language, target_language, speaker_identity, status, created_by
  )
  values (
    v_ministry_id, null, 'livekit_room', v_room_name,
    v_source_language, v_source_language, null, 'initialising',
    case when auth.uid() is not null then auth.uid() else null end
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
