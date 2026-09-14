-- 0348_developer_api_usage_cron.sql
-- =====================================================================
-- Schedules developer-api-usage-report (migration 0347's pay-as-you-go
-- billing) to run every 6 hours — frequent enough that a developer's
-- Stripe invoice reflects usage without much lag, infrequent enough to
-- not hammer Stripe's API for what's usually a handful of accounts.
--
-- ⚠️ Same pattern as 0027_schedule_recording_cleanup.sql: replace
-- <PROJECT_REF> and <SERVICE_ROLE_KEY> below with real values before
-- running this in the SQL editor — never commit real secrets to a
-- tracked migration file, per this repo's standing rule.
-- =====================================================================

select cron.unschedule('developer-api-usage-report')
where exists (select 1 from cron.job where jobname = 'developer-api-usage-report');

select cron.schedule(
  'developer-api-usage-report',
  '0 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/developer-api-usage-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- To inspect / remove:
--   select * from cron.job where jobname = 'developer-api-usage-report';
--   select * from cron.job_run_details where jobname = 'developer-api-usage-report' order by start_time desc limit 5;
--   select cron.unschedule('developer-api-usage-report');
