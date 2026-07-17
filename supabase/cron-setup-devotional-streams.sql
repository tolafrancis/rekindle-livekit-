-- =============================================================================
-- Devotional stream automation: pg_cron setup
-- =============================================================================
-- Schedules the two daily ingest jobs that populate AUTOMATED devotional streams.
-- Streams with NO row in devotional_stream_sources stay MANUAL and are untouched.
--
-- See docs/devotional-stream-automation-plan.md
--
-- REQUIREMENTS
--   1. Migration 0161_devotional_stream_sources.sql applied.
--   2. Edge functions deployed (Dashboard → Edge Functions):
--        ingest-devotional-scrape
--        ingest-devotional-ai      (also needs the existing meeting-ai fn + OPENAI_API_KEY)
--   3. pg_cron + pg_net enabled (both already used by cron-setup.sql).
--   4. Replace <YOUR_SERVICE_ROLE_KEY> below before running
--        (Dashboard → Settings → API → service_role key).
--
-- Both jobs run early UTC. schedule_date is a DATE and the client resolves
-- "today" locally against it, so a single early-UTC run is correct for a global
-- audience. The two are staggered 30 min apart so they don't contend.
--
-- Both jobs insert DRAFTS (is_published = false) — an admin approves them.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- 1. Scraper — 05:15 UTC daily (source must have published for the day)
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('ingest-devotional-scrape')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingest-devotional-scrape');

SELECT cron.schedule(
  'ingest-devotional-scrape',
  '15 5 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/ingest-devotional-scrape',
      headers := jsonb_build_object(
                   'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>',
                   'Content-Type',  'application/json'
                 ),
      body    := '{}'::jsonb
    );
  $$
);

-- ---------------------------------------------------------------------------
-- 2. AI generator — 05:45 UTC daily (offset from the scraper)
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('ingest-devotional-ai')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingest-devotional-ai');

SELECT cron.schedule(
  'ingest-devotional-ai',
  '45 5 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/ingest-devotional-ai',
      headers := jsonb_build_object(
                   'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>',
                   'Content-Type',  'application/json'
                 ),
      body    := '{}'::jsonb
    );
  $$
);

-- ---------------------------------------------------------------------------
-- Useful checks
-- ---------------------------------------------------------------------------
-- Scheduled jobs:
--   SELECT jobname, schedule, active FROM cron.job
--    WHERE jobname LIKE 'ingest-devotional-%';
--
-- Last outcome per automated stream:
--   SELECT s.name, src.kind, src.is_active, src.last_run_at, src.last_status
--     FROM devotional_stream_sources src
--     JOIN devotional_streams s ON s.id = src.stream_id
--    ORDER BY src.last_run_at DESC NULLS LAST;
--
-- Recent job runs:
--   SELECT jobname, status, return_message, start_time
--     FROM cron.job_run_details
--    WHERE jobname LIKE 'ingest-devotional-%'
--    ORDER BY start_time DESC LIMIT 20;
--
-- To stop a job:  SELECT cron.unschedule('ingest-devotional-ai');
