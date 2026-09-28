-- 0375_webinar_backstage_auto_end.sql
-- Webinar lifecycle fixes:
--
-- 1. Backstage. Opening a webinar used to flip it straight to 'live', which
--    admitted every registrant and started the audience stream before the
--    host had checked their sound or briefed speakers. 'backstage' is a new
--    status in between: host, co-hosts and speakers are in the LiveKit room,
--    no HLS Egress runs, and attendees stay on the waiting screen. An explicit
--    "Go live" (WebinarStage.tsx) starts the Egress and moves to 'live'.
--
-- 2. Auto-end. A webinar nobody pressed End on stayed 'live' forever when the
--    LiveKit webhooks never fired (the room never opened, or the egress never
--    started). The webinar-auto-end edge function (run by pg_cron, see
--    supabase/cron-setup-webinar-auto-end.sql) checks LiveKit for a host or
--    co-host in the room and records when they went missing here, in
--    host_absent_since, so it can end the webinar after a grace period.

begin;

alter table public.ministry_webinars
  drop constraint if exists ministry_webinars_status_check;
alter table public.ministry_webinars
  add constraint ministry_webinars_status_check
  check (status in (
    'draft', 'scheduled', 'registration_open', 'starting_soon', 'backstage',
    'live', 'ending', 'ended', 'recording_processing', 'completed', 'cancelled'
  ));

alter table public.ministry_webinars
  add column if not exists backstage_started_at timestamptz,
  add column if not exists host_absent_since timestamptz,
  add column if not exists ended_reason text;

commit;
