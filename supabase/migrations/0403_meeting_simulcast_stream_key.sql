-- 0403_meeting_simulcast_stream_key.sql
-- =====================================================================
-- Restream (YouTube / Facebook) destinations are now saved first and
-- started when the room goes live (livekit-egress add-simulcast /
-- start-hls, supabase/functions/_shared/simulcast.ts), so the stream key
-- has to be stored. live_channel_simulcast_targets already has the column;
-- meeting_simulcast_targets (0337) never did. Writes stay service-role only
-- and the edge function never returns the key.
-- =====================================================================

alter table public.meeting_simulcast_targets
  add column if not exists stream_key text;
