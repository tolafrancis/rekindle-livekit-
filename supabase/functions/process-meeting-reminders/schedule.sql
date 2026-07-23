-- Schedule process-meeting-reminders to run every 5 minutes via pg_cron.
-- Run this ONCE in the Supabase SQL editor AFTER the function is deployed.
--
-- Requires pg_cron and pg_net (Database → Extensions). Replace <PROJECT_REF> and
-- <SERVICE_ROLE_KEY> with your project's values.

-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;

select cron.schedule(
  'process-meeting-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/process-meeting-reminders',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Optional: prune the dedup ledger for meetings that already happened.
select cron.schedule(
  'prune-meeting-reminder-sends',
  '20 3 * * *',
  $$ delete from public.meeting_reminder_sends
     where meeting_id in (
       select id from public.ministry_video_meetings
       where scheduled_time < now() - interval '2 days'
     ); $$
);

-- To inspect / remove:
--   select * from cron.job;
--   select cron.unschedule('process-meeting-reminders');
