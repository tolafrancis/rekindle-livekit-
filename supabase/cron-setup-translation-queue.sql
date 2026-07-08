-- =============================================================================
-- process-translation-queue: pg_cron setup (content translation worker)
-- =============================================================================
-- This is what actually DRAINS the content-translation queue. Without it,
-- clicking "Translate" (or "Translate all") only enqueues rows that never run.
-- Run once in the Supabase SQL editor after deploying the edge function.
--
-- REQUIREMENTS
--   1. pg_cron + pg_net extensions enabled (Dashboard → Database → Extensions).
--   2. Edge function deployed: process-translation-queue
--   3. Nothing to replace — the project URL + anon key below match this project.
--
-- HOW IT WORKS
--   Every 2 minutes it calls the worker with { action: 'process_queue', limit }.
--   Each run translates up to `limit` pending items (title/content/etc.) via
--   OpenAI and stores the result in each content row's `translations` JSONB
--   column. Translation is one-time + cached (translate-content SHA-256 cache),
--   so viewing translated content never re-translates.
--   Keep `limit` modest so a run stays well under the edge wall-clock limit
--   (each item makes a real OpenAI call ~2-4s). 15 items ≈ 30-60s.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Runs every 2 minutes. Change '*/2 * * * *' to '*/1 * * * *' to drain a big
-- backlog faster (more OpenAI cost/min), or '*/5 * * * *' for the cheapest cadence.
SELECT cron.schedule(
  'process-translation-queue',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/process-translation-queue',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDQ1NTYsImV4cCI6MjA4MDQ4MDU1Nn0.Ij4KhYKntuAmCthL2dGJk4pfWa2gIq3QER4wt6oExd8'
      ),
      body    := jsonb_build_object('action', 'process_queue', 'limit', 15)
    );
  $$
);

-- Verify it registered
SELECT jobid, schedule, command, jobname, active
FROM cron.job
WHERE jobname = 'process-translation-queue';

-- =============================================================================
-- MAINTENANCE (run as needed)
-- =============================================================================
-- Recent runs / errors:
-- SELECT * FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-translation-queue')
-- ORDER BY start_time DESC LIMIT 20;
--
-- Pause / delete:
-- SELECT cron.unschedule('process-translation-queue');
--
-- Reset rows stuck in 'processing' > 10 min (e.g. after a crash):
-- UPDATE translation_queue SET status = 'pending'
-- WHERE status = 'processing' AND started_at < now() - interval '10 minutes';
