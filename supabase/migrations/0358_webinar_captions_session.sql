-- 0358_webinar_captions_session.sql
-- Webinar Phase 3: live captions/translation for HLS-only webinar attendees.
--
-- The host/speaker side needs zero new backend surface — WebinarStage.tsx
-- wires the existing FloatingTranslationButton.tsx exactly like
-- MinistryInteractiveMeetings.tsx already does (start_bot_session's
-- self-service path already covers any ministry member). The attendee side
-- (WebinarTranslationButton.tsx, mirroring BroadcastTranslationButton.tsx)
-- needs only one new door: start_captions_session (migration 0289) is
-- deliberately narrow to live_channels — this is that same function,
-- mirrored for ministry_webinars instead of re-deriving a channel_id.

begin;

create or replace function public.start_webinar_captions_session(p_webinar_id uuid)
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
  v_session_id      uuid;
begin
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

grant execute on function public.start_webinar_captions_session(uuid) to anon, authenticated;

commit;
