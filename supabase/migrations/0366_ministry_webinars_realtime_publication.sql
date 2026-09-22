-- 0366_ministry_webinars_realtime_publication.sql
-- Real bug found live (2026-09-22): an audience member reported getting
-- stuck "connecting" and never able to join a webinar. Root cause — same
-- class of bug as 0364, just one table 0364 missed: `ministry_webinars`
-- itself was never added to the supabase_realtime publication (confirmed
-- via pg_publication_tables). WebinarJoinPage.tsx subscribes to UPDATE
-- events on this exact table to notice the moment the host starts the
-- webinar (status -> 'live') and to pick up hls_playback_url once the
-- Egress produces it — with the table never actually in the publication,
-- that subscription was silently a no-op, so an attendee sitting on
-- WebinarLobby's "Waiting for the host to start the webinar…" screen (or
-- WebinarAttendeeViewer's "Stream is starting…") had no way to ever advance
-- without a manual page refresh timed after the host had already gone live.
-- `webinar_speakers` had the same gap and is included for the same reason,
-- even though nothing currently subscribes to it live — consistency with
-- the rest of the webinar table set, cheap to close now.

begin;

do $$
declare
  t text;
begin
  foreach t in array array['ministry_webinars', 'webinar_speakers'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;
