-- 0352_livekit_recordings_download_url.sql
-- The "Download" button on meeting/webinar recordings used to point at the HLS
-- .m3u8 playlist (playback_url reused as-is) — not a real file, so browsers
-- can't download it and instead just navigate to it. Egress now also writes a
-- single MP4 (EncodedFileOutput) alongside the HLS segments for start-recording,
-- and that file's URL goes here. NULL for recordings made before this migration.

alter table public.livekit_recordings
  add column if not exists download_url text;
