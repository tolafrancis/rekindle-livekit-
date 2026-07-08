-- =============================================================================
-- process-scheduled-broadcasts: pg_cron setup
-- =============================================================================
-- Run this once in the Supabase SQL editor after deploying the edge function.
--
-- REQUIREMENTS
--   1. pg_cron extension must be enabled:
--        Supabase Dashboard → Database → Extensions → pg_cron  (toggle on)
--   2. pg_net extension must be enabled (it's on by default in Supabase):
--        Supabase Dashboard → Database → Extensions → pg_net
--   3. Edge function deployed:
--        supabase functions deploy process-scheduled-broadcasts
--   4. Replace the two placeholder values below before running:
--        <YOUR_SUPABASE_URL>        e.g. https://abcdefgh.supabase.co
--        <YOUR_SERVICE_ROLE_KEY>    from Dashboard → Settings → API
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Enable required extensions (safe to run even if already enabled)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ---------------------------------------------------------------------------
-- 2. Schedule the cron job — runs every 2 minutes
--
--    Adjust the cron expression if you want a different frequency:
--      '*/1 * * * *'  every 1 minute  (highest responsiveness, more cost)
--      '*/2 * * * *'  every 2 minutes (recommended default)
--      '*/5 * * * *'  every 5 minutes (lowest cost, acceptable for most apps)
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'process-scheduled-broadcasts',           -- job name (unique, used for updates/deletes)
  '*/2 * * * *',                            -- cron expression: every 2 minutes
  $$
    SELECT net.http_post(
      url     := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/process-scheduled-broadcasts',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDQ1NTYsImV4cCI6MjA4MDQ4MDU1Nn0.Ij4KhYKntuAmCthL2dGJk4pfWa2gIq3QER4wt6oExd8'
      ),
      body    := '{}'::jsonb
    );
  $$
);


-- ---------------------------------------------------------------------------
-- 3. Verify the job was registered
-- ---------------------------------------------------------------------------
SELECT jobid, schedule, command, jobname, active
FROM cron.job
WHERE jobname = 'process-scheduled-broadcasts';


-- =============================================================================
-- MAINTENANCE QUERIES (run as needed, not on first setup)
-- =============================================================================

-- View recent cron run history and any errors
-- SELECT * FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-scheduled-broadcasts')
-- ORDER BY start_time DESC
-- LIMIT 20;

-- Pause the job without deleting it
-- SELECT cron.unschedule('process-scheduled-broadcasts');

-- Re-enable after pausing (re-run the cron.schedule block above)

-- Change frequency to every 5 minutes
-- SELECT cron.unschedule('process-scheduled-broadcasts');
-- SELECT cron.schedule('process-scheduled-broadcasts', '*/5 * * * *', $$ ... $$);

-- Delete the job permanently
-- SELECT cron.unschedule('process-scheduled-broadcasts');


-- =============================================================================
-- RECOVERY: stuck 'processing' rows
-- =============================================================================
-- If the edge function crashed mid-run, rows can get stuck in 'processing'.
-- Run this to reset rows that have been processing for more than 10 minutes:
--
-- UPDATE broadcast_notifications
-- SET status = 'scheduled'
-- WHERE status = 'processing'
--   AND updated_at < now() - interval '10 minutes';
--
-- UPDATE ministry_group_broadcasts
-- SET status = 'scheduled'
-- WHERE status = 'processing'
--   AND updated_at < now() - interval '10 minutes';
--
-- Note: add an `updated_at` column (with a trigger) if it doesn't exist:
--
-- ALTER TABLE broadcast_notifications
--   ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
--
-- ALTER TABLE ministry_group_broadcasts
--   ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
--
-- CREATE OR REPLACE FUNCTION set_updated_at()
-- RETURNS trigger LANGUAGE plpgsql AS $$
-- BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
--
-- CREATE TRIGGER broadcast_notifications_updated_at
--   BEFORE UPDATE ON broadcast_notifications
--   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--
-- CREATE TRIGGER ministry_group_broadcasts_updated_at
--   BEFORE UPDATE ON ministry_group_broadcasts
--   FOR EACH ROW EXECUTE FUNCTION set_updated_at();