-- 0399_daily_audio_prewarm.sql
-- Prepares each day's devotional read-aloud audio ahead of the first listener
-- (edge function prewarm-devotional-audio). Settings live in platform_settings
-- and are edited in Platform Admin > Bulk TTS > Daily Audio.

-- English only by default; admins switch on more languages.
-- (platform_settings.value is a text column holding JSON.)
insert into public.platform_settings (key, value, updated_at)
values ('daily_audio_prewarm', '{"enabled":true,"languages":["en"]}', now())
on conflict (key) do nothing;

-- Hourly: the job covers today's and tomorrow's devotionals (UTC dates), only
-- generates what isn't cached yet, and leaves anything past its time budget
-- for the next run. Signs in with the vault's service role key (the function
-- runs with verify_jwt and accepts the service_role claim) rather than going
-- through private.call_edge_fn, which calls public.get_cron_secret(), dropped
-- in 0258, so that helper currently fails for every job that uses it.
select cron.schedule(
  'prewarm-devotional-audio',
  '20 * * * *',
  $$
  select net.http_post(
    url     := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/prewarm-devotional-audio',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
