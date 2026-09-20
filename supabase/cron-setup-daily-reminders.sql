-- =============================================================================
-- process-daily-reminders: pg_cron setup  ← THE MISSING PIECE
-- =============================================================================
-- The reminder worker (supabase/functions/process-daily-reminders) was written to
-- run "on a cron every 15 minutes", but that schedule was never created — so the
-- worker never ran and NO daily reminders were ever delivered. This registers it.
--
-- Run ONCE in the Supabase SQL editor (project vpnpembyqbbaaiynfvli).
--
-- REQUIREMENTS
--   1. pg_cron + pg_net extensions enabled (Dashboard → Database → Extensions).
--   2. Edge function deployed and named exactly: process-daily-reminders.
--   3. Its secrets set: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SHARED_SECRET
--      (already project-wide).
--
-- Cadence: every 15 minutes. The worker only fires reminders whose LOCAL set time
-- passed within the last GRACE_MINUTES (30), so a single missed tick still delivers,
-- and daily_reminder_sends dedups so a user never gets the same reminder twice a day.
--
-- FIXED BUG: this file originally sent an `Authorization: Bearer <anon key>`
-- header, but the function checks `x-cron-secret` against the CRON_SHARED_SECRET
-- function secret (no Bearer/anon fallback) — so the job registered by an
-- earlier run of this file was silently 401'ing on every tick since it was
-- first scheduled. Replace <CRON_SHARED_SECRET> below with the real value
-- (Supabase Dashboard → Edge Functions → Secrets) before running this.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: drop any prior registration before (re)scheduling.
SELECT cron.unschedule('process-daily-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-daily-reminders');

SELECT cron.schedule(
  'process-daily-reminders',
  '*/15 * * * *',                           -- every 15 minutes
  $$
    SELECT net.http_post(
      url     := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/process-daily-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', '<CRON_SHARED_SECRET>'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Verify it registered.
SELECT jobid, schedule, jobname, active
FROM cron.job
WHERE jobname = 'process-daily-reminders';

-- ---------------------------------------------------------------------------
-- Handy checks after it has run a tick or two:
--   -- did the worker create any notifications today?
--   -- SELECT * FROM cron.job_run_details WHERE jobname = 'process-daily-reminders' ORDER BY start_time DESC LIMIT 5;
--   -- SELECT * FROM public.daily_reminder_sends WHERE sent_on = current_date;
-- ---------------------------------------------------------------------------
