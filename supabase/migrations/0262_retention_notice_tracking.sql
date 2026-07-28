-- 0262_retention_notice_tracking.sql
-- =====================================================================
-- Tracks whether the "expires soon, download now" notice has already been
-- sent for a recording / video message, so the retention sweep (see
-- supabase/functions/ministry-retention-sweep) doesn't re-notify admins
-- every time it runs between the notice window opening and the actual
-- deletion.
-- =====================================================================

begin;

alter table public.livekit_recordings
  add column if not exists retention_notice_sent_at timestamptz;

alter table public.ministry_video_messages
  add column if not exists retention_notice_sent_at timestamptz;

commit;
