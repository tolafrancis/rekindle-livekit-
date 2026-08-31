-- =============================================================================
-- member-deletion-sweep: pg_cron setup
-- =============================================================================
-- Run this once in the Supabase SQL editor, AFTER
-- 0334_deletion_grace_period_admin_notify.sql has been applied.
--
-- Unlike the other cron-setup-*.sql files in this folder, this job does NOT
-- call an edge function over net.http_post, so there's no service-role key
-- to paste in here. run_scheduled_deletions() is pure SQL — pg_cron calls
-- it directly.
--
-- What it does: once a day, carries out any member data-deletion request
-- (request_data_deletion() RPC) whose 30-day grace period has elapsed —
-- see 0334_deletion_grace_period_admin_notify.sql.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'member-deletion-sweep',
  '0 3 * * *',   -- daily at 03:00 UTC
  $$ SELECT public.run_scheduled_deletions(); $$
);

-- ---------------------------------------------------------------------------
-- Verify the job was registered
-- ---------------------------------------------------------------------------
SELECT jobid, schedule, command, jobname, active
FROM cron.job
WHERE jobname = 'member-deletion-sweep';

-- =============================================================================
-- MAINTENANCE QUERIES (run as needed, not on first setup)
-- =============================================================================

-- View recent run history / errors
-- SELECT * FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'member-deletion-sweep')
-- ORDER BY start_time DESC LIMIT 20;

-- Pause without deleting
-- SELECT cron.unschedule('member-deletion-sweep');

-- Run it once by hand (e.g. to test without waiting for 03:00 UTC)
-- SELECT public.run_scheduled_deletions();

-- See what's currently pending / due
-- SELECT * FROM public.member_deletion_requests WHERE status = 'pending' ORDER BY scheduled_for;
