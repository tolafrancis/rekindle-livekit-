-- 0341_translation_session_lifecycle.sql
-- =====================================================================
-- Three related lifecycle fixes for Live Translation sessions (2026-09-12
-- feedback batch), all scoped to keep behavior predictable and reuse
-- existing plumbing rather than inventing new mechanisms:
--
-- 1. Auto-delete ended sessions 24h after they end. translation_logs and
--    translation_bot_instances both already cascade-delete off
--    translation_sessions (migration 0273), so this one deletion clears
--    the whole record — session, transcript, and bot-instance history
--    together. translation_services is untouched (on delete set null on
--    service_id), so a service's name/history survives even after its
--    old sessions age out.
--
-- 2. speaker_session_get_link(): one admin RPC that answers "give me a
--    working speaker link for this service" whether the session is still
--    running or already ended — the same underlying need behind two
--    separate asks: the Copy button should hand back a link that
--    actually still works (today it can't, because the Speaker Link's
--    raw token is deliberately never stored past its one-time reveal,
--    migration 0288), and "restart an ended service" needs a fresh
--    session anyway since the old one's bot/room are already torn down.
--    Same-row token refresh for an active session; a whole new session
--    (new room, same service_id so it stays grouped in the dashboard)
--    for an ended one.
-- =====================================================================

begin;

-- ── 1. Auto-delete ended sessions after 24h ──────────────────────────

create or replace function public.cleanup_ended_translation_sessions()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.translation_sessions
  where status = 'ended'
    and ended_at is not null
    and ended_at < now() - interval '24 hours';
$$;

create extension if not exists pg_cron;

select cron.unschedule('cleanup-ended-translation-sessions')
where exists (select 1 from cron.job where jobname = 'cleanup-ended-translation-sessions');

-- Hourly is plenty granular for a 24h window, and needs no edge function or
-- secret in the job body (unlike cleanup-recordings) — it's a plain delete.
select cron.schedule(
  'cleanup-ended-translation-sessions',
  '0 * * * *',
  $$ select public.cleanup_ended_translation_sessions(); $$
);

-- ── 2. speaker_session_get_link ──────────────────────────────────────

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
    -- Still running (or never actually got joined) — same session, same
    -- room, just a fresh token so a lost/never-copied link works again.
    -- Invalidates whatever token existed before, same as a password reset.
    update public.translation_sessions
      set speaker_token_hash = encode(digest(v_raw_token, 'sha256'), 'hex')
      where id = p_session_id;

    return jsonb_build_object('session_id', p_session_id, 'speaker_token', v_raw_token, 'restarted', false);
  end if;

  -- Ended — the old room's bot has already stopped and can't be revived by
  -- just swapping a token, so this mints a genuinely new session. Same
  -- ministry/service/language pair as the one it's restarting, so it stays
  -- grouped under the same service card in the dashboard.
  v_new_session_id   := gen_random_uuid();
  v_room_name        := 'speaker-' || v_new_session_id::text;
  v_speaker_identity := 'speaker-' || v_new_session_id::text;

  insert into public.translation_sessions (
    id, ministry_id, service_id, source_type, livekit_room_name,
    source_language, target_language, speaker_identity, status,
    speaker_token_hash, created_by
  )
  values (
    v_new_session_id, v_session.ministry_id, v_session.service_id, 'browser_speaker', v_room_name,
    v_session.source_language, v_session.target_language, v_speaker_identity, 'initialising',
    encode(digest(v_raw_token, 'sha256'), 'hex'), auth.uid()
  );

  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'start',
    'session_id', v_new_session_id,
    'ministry_id', v_session.ministry_id,
    'room_name', v_room_name,
    'source_language', v_session.source_language,
    'target_language', v_session.target_language,
    'speaker_identity', v_speaker_identity
  )::text);

  return jsonb_build_object('session_id', v_new_session_id, 'speaker_token', v_raw_token, 'restarted', true);
end;
$$;

grant execute on function public.speaker_session_get_link(uuid) to authenticated;

commit;
