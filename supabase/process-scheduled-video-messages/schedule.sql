-- Schedule process-scheduled-video-messages to run every 15 minutes via pg_cron.
-- Run this ONCE in the Supabase SQL editor AFTER the function is deployed.
--
-- Requires the pg_cron and pg_net extensions (enable under Database → Extensions).
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> with your project's values, or
-- better, read the key from Vault if you have it configured.

-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;

select cron.schedule(
  'process-scheduled-video-messages',
  '0,15,30,45 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/process-scheduled-video-messages',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- To inspect / remove:
--   select * from cron.job;
--   select cron.unschedule('process-scheduled-video-messages');
