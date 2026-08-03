-- 0268_livekit_recordings_meeting_table.sql
-- =====================================================================
-- livekit-egress (start-recording/start-hls) and livekit-webhook have always
-- written/read a `meeting_table` column on livekit_recordings (which meetings
-- table to write recording_url/recording_status back onto — see 0146's
-- design comment). The live table never actually had it: 0146 used
-- `create table if not exists`, which no-ops when the table already exists,
-- and this table predates that migration. Every recording insert has been
-- silently failing on the unknown column ever since (the insert's error was
-- never checked) — the Egress itself started fine, but no row was ever
-- persisted, so no recording could ever show up in any recordings list.
-- =====================================================================

begin;

alter table public.livekit_recordings
  add column if not exists meeting_table text;

commit;
