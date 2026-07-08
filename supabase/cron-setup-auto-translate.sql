-- =============================================================================
-- auto-translate-new-content: pg_cron setup
-- =============================================================================
-- Hands-off translation of NEW content. Every hour it calls the worker with
-- { action: 'auto_enqueue' }, which enqueues any content NOT yet translated into
-- every PUBLISHED language (app_languages). queueAllContent skips anything
-- already done or in flight, so each run only picks up genuinely new items.
-- The separate process-translation-queue cron then does the actual translating.
--
-- REQUIREMENTS
--   1. pg_cron + pg_net extensions enabled.
--   2. process-translation-queue edge function deployed (with the auto_enqueue action).
--   3. cron-setup-translation-queue.sql already installed (that's what drains the queue).
--   4. At least one language is published in Admin → Languages (else it no-ops).
--
-- NET EFFECT: publish a devotional/prayer/book → it's translated automatically
-- within ~1 hour (enqueue) + a few minutes (drain), no admin clicks.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Hourly. Change '0 * * * *' to '*/30 * * * *' (every 30 min) or '*/15 * * * *'
-- for faster pickup of newly published content.
SELECT cron.schedule(
  'auto-translate-new-content',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/process-translation-queue',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDQ1NTYsImV4cCI6MjA4MDQ4MDU1Nn0.Ij4KhYKntuAmCthL2dGJk4pfWa2gIq3QER4wt6oExd8'
      ),
      -- action only: content types default to DEFAULT_AUTO_CONTENT_TYPES and
      -- languages default to published app_languages. To pin specific languages
      -- instead, use: jsonb_build_object('action','auto_enqueue','targetLanguages', jsonb_build_array('vi'))
      body    := jsonb_build_object('action', 'auto_enqueue')
    );
  $$
);

-- Verify it registered
SELECT jobid, schedule, command, jobname, active
FROM cron.job
WHERE jobname = 'auto-translate-new-content';

-- =============================================================================
-- MAINTENANCE
-- =============================================================================
-- Recent runs / errors:
-- SELECT * FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-translate-new-content')
-- ORDER BY start_time DESC LIMIT 20;
--
-- Pause / delete:
-- SELECT cron.unschedule('auto-translate-new-content');
--
-- Run it once right now (don't wait for the hour) to smoke-test:
-- SELECT net.http_post(
--   url := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/process-translation-queue',
--   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <anon-key>'),
--   body := jsonb_build_object('action','auto_enqueue')
-- );
