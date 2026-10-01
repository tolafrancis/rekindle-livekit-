-- 0368_translation_session_retention_align.sql
-- F-CAP-6 (captions pipeline review, 2026-09-23): cleanup_ended_translation_sessions
-- (migration 0341) deleted the whole translation_sessions row — and everything
-- that cascades off it (translation_logs, translation_bot_instances) — just 24
-- HOURS after the session ended. Recordings/VODs live far longer: confirmed
-- against 0027_schedule_recording_cleanup.sql's own header comment, the
-- platform's default sweep is 30 days for interactive meetings and 90 days
-- for live broadcasts (webinars/channels fall under the broadcast default).
-- A viewer watching a replay "the next day" — the review's own scenario 9 —
-- found the recording still there and the transcript already gone.
--
-- Bumped to 90 days (the LONGER of the two defaults) rather than 30: captions
-- are used heavily on webinars in this product, and it's better for a
-- transcript to slightly outlive a meeting-kind recording's 30-day window
-- than to disappear 60 days before a webinar/channel recording's 90-day one.
-- Known simplification, called out explicitly: this does NOT read a
-- ministry's own custom recording_retention_days (30/60/90/180/Never,
-- storage_pack ministries only, ministry_groups table) — doing that properly
-- means joining each translation_session back to whichever meeting/webinar/
-- channel room it ran in and that ministry's own setting, real added
-- complexity deliberately deferred rather than guessed at here. A ministry
-- that has shortened ITS OWN recording retention below 90 days will now have
-- transcripts outlive recordings, not the other way around — the safer
-- direction for this simplification to err in.

begin;

create or replace function public.cleanup_ended_translation_sessions()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.translation_sessions
  where status = 'ended'
    and ended_at is not null
    and ended_at < now() - interval '90 days';
$$;

commit;
