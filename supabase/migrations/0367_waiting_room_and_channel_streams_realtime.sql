-- 0367_waiting_room_and_channel_streams_realtime.sql
-- Real gap found in a pre-test pipeline review (2026-09-23): meeting_waiting_room
-- has live subscriptions in useDailyRoom.ts — a host-side "who's waiting" feed
-- (filter meeting_id=eq...) and a participant-side "was I admitted?" feed
-- (filter user_id=eq...) — but was never added to the supabase_realtime
-- publication (confirmed via pg_publication_tables), the same class of bug
-- already found and fixed twice for webinar tables (migrations 0364, 0366).
-- Without this, a host's waiting-room panel doesn't update live when someone
-- joins the queue, and — worse — a participant the host admits has no way to
-- know without a manual page refresh. channel_streams included for
-- consistency with the ingress/egress tracking pattern, even though nothing
-- currently subscribes to it live.

begin;

do $$
declare
  t text;
begin
  foreach t in array array['meeting_waiting_room', 'channel_streams'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;
