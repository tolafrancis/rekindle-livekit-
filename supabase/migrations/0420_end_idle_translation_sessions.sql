-- 0420_end_idle_translation_sessions.sql
-- =====================================================================
-- A translation session only ends when the speaker presses Stop, an admin
-- ends the service, or the bot sees the speaker leave the room. If the
-- speaker opens the link but never connects (no microphone, closed tab
-- before starting), the bot never sees anyone leave, so the session stays
-- "active" forever. RCCG Vietnam had one open for over a day (2026-10-23,
-- service "gdsgsd": started, no speech ever arrived, service never ended).
-- Besides looking wrong, an open session now counts against the
-- ministry's Live Translation hours (0419).
--
-- Every 5 minutes, end any running translate/captions/notes session that
-- hasn't had speech for 60 minutes (or never had any, 60 minutes after it
-- started), and tell the bot to leave. 60 minutes leaves room for a long
-- worship set with no speech. 'scripture_only' sessions don't run the bot
-- and are left alone. The session is marked as ended at its last speech,
-- so the idle time doesn't count against the ministry's hours.
-- =====================================================================

begin;

create or replace function public.end_idle_translation_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_count   integer := 0;
begin
  for v_session in
    update public.translation_sessions
       set status = 'ended',
           -- End it at the last speech, so the silent hour (or the whole
           -- session, if no one ever spoke) doesn't use translation hours.
           ended_at = coalesce(interim_updated_at, started_at, created_at),
           error_message = 'Stopped: no speech for 60 minutes.'
     where status in ('initialising', 'joining', 'active', 'paused')
       and session_kind in ('translate', 'captions', 'notes')
       and coalesce(interim_updated_at, started_at, created_at) < now() - interval '60 minutes'
    returning id
  loop
    -- The bot ignores a stop for a session it isn't running, which would
    -- leave its instance row 'active' and make the next bot restart rejoin
    -- the ended session (crash recovery). Close it here too.
    update public.translation_bot_instances
       set status = 'stopped'
     where session_id = v_session.id
       and status in ('active', 'joining');
    perform pg_notify('bot_dispatch', jsonb_build_object('action', 'stop', 'session_id', v_session.id)::text);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.end_idle_translation_sessions() from public, anon, authenticated;

select cron.schedule(
  'end-idle-translation-sessions',
  '*/5 * * * *',
  'select public.end_idle_translation_sessions();'
);

commit;
