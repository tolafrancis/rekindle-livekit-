-- Schedule process-daily-reminders to run every 15 minutes via pg_cron.
-- Run this ONCE in the Supabase SQL editor AFTER the function is deployed.
--
-- Requires the pg_cron and pg_net extensions (enable under Database → Extensions).
-- Replace <PROJECT_REF> and <CRON_SHARED_SECRET> with your project's values.
--
-- IMPORTANT: the function checks the `x-cron-secret` header against the
-- CRON_SHARED_SECRET function secret — NOT an Authorization: Bearer token
-- (unlike some other functions in this repo). An earlier version of this doc
-- used a Bearer <SERVICE_ROLE_KEY> header, which the function has always
-- rejected with 401 — the cron job silently failed on every tick since it
-- was first scheduled until this was caught and fixed.

-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;

select cron.schedule(
  'process-daily-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/process-daily-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SHARED_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Optional: prune the dedup ledger nightly so it does not grow forever.
select cron.schedule(
  'prune-daily-reminder-sends',
  '30 3 * * *',
  $$ delete from public.daily_reminder_sends where sent_on < (now() at time zone 'utc')::date - 7; $$
);

-- To inspect / remove:
--   select * from cron.job;
--   select cron.unschedule('process-daily-reminders');
