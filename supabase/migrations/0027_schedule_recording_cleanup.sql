-- supabase/migrations/0027_schedule_recording_cleanup.sql
-- Schedule the daily recording-retention cleanup.
--
-- Deletes recordings past their retention window (interactive meetings: 30 days,
-- live broadcasts: 90 days) by invoking the `cleanup-recordings` edge function
-- once a day. Deploy that function FIRST (see supabase/cleanup-recordings/index.ts).
--
-- ── Before running ───────────────────────────────────────────────────────────
--   Replace the two placeholders below:
--     <PROJECT_REF>       your Supabase project ref (Dashboard → Settings → General)
--     <SERVICE_ROLE_KEY>  Dashboard → Settings → API → service_role key
--   The service-role key is a secret. Prefer storing it in Vault and reading it
--   back (see the commented Vault variant at the bottom) rather than pasting it
--   inline. Run in the Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace any previous schedule so this migration is safe to re-run.
select cron.unschedule('cleanup-recordings-daily')
where exists (select 1 from cron.job where jobname = 'cleanup-recordings-daily');

-- 03:00 UTC daily — off-peak.
select cron.schedule(
  'cleanup-recordings-daily',
  '0 3 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/cleanup-recordings',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── Vault variant (recommended) ──────────────────────────────────────────────
-- Instead of pasting the key inline, store it once:
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- then schedule with a lookup:
--   ... 'Authorization',
--       'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
--                      where name = 'service_role_key') ...
--
-- ── Preview before enabling deletions ────────────────────────────────────────
-- Set DRY_RUN=true in the cleanup-recordings function's secrets to log what WOULD
-- be deleted without deleting, then flip it off once you're happy.
--
-- ── Unschedule ───────────────────────────────────────────────────────────────
--   select cron.unschedule('cleanup-recordings-daily');
