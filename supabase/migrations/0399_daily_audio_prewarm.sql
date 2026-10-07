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
-- for the next run. private.call_edge_fn sends the cron shared secret.
select cron.schedule(
  'prewarm-devotional-audio',
  '20 * * * *',
  $$ select private.call_edge_fn('prewarm-devotional-audio') $$
);
