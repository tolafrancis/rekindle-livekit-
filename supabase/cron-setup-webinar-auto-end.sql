-- =============================================================================
-- webinar-auto-end: pg_cron setup
-- =============================================================================
-- Ends webinars that were left running without anyone pressing End (and
-- returns abandoned backstages to 'scheduled'). Run once in the Supabase SQL
-- editor after applying migration 0375_webinar_backstage_auto_end.sql and
-- deploying the webinar-auto-end edge function.
--
-- REQUIREMENTS
--   1. pg_cron + pg_net extensions enabled (Dashboard → Database → Extensions).
--   2. Edge function deployed: webinar-auto-end
--   3. Nothing to replace — the project URL + anon key below match this project
--      (same as cron-setup-translation-queue.sql). The anon key is enough: the
--      function only acts on its own rules and is safe to call repeatedly.
--
-- HOW IT WORKS
--   Every 5 minutes the function checks each backstage/live webinar's LiveKit
--   room for the host or a co-host. Once they've been gone for 10 minutes a
--   live webinar is ended (stream stopped, recording finalized) and a backstage
--   one goes back to 'scheduled'. A live webinar also ends 2 hours past its
--   booked duration regardless.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'webinar-auto-end',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/webinar-auto-end',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDQ1NTYsImV4cCI6MjA4MDQ4MDU1Nn0.Ij4KhYKntuAmCthL2dGJk4pfWa2gIq3QER4wt6oExd8'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Verify it registered
SELECT jobid, schedule, command, jobname, active
FROM cron.job
WHERE jobname = 'webinar-auto-end';

-- =============================================================================
-- MAINTENANCE (run as needed)
-- =============================================================================
-- Recent runs / errors:
-- SELECT * FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'webinar-auto-end')
-- ORDER BY start_time DESC LIMIT 20;
--
-- Pause / delete:
-- SELECT cron.unschedule('webinar-auto-end');
--
-- Webinars it ended, and why:
-- SELECT id, title, ended_at, ended_reason FROM ministry_webinars
-- WHERE ended_reason IS NOT NULL ORDER BY ended_at DESC LIMIT 20;
