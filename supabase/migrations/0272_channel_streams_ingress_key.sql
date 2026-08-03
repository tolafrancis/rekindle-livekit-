-- 0272_channel_streams_ingress_key.sql
-- =====================================================================
-- livekit-ingress (OBS/encoder RTMP ingest for live channels) needs to
-- persist the ingress's stream key so 'get' can hand it back without
-- re-calling LiveKit. channel_streams already tracks ingress_id/ingress_url
-- per channel (0147) — this just adds the one missing field rather than
-- creating a separate table for what's still one row per channel.
-- =====================================================================

begin;

alter table public.channel_streams
  add column if not exists ingress_stream_key text;

commit;
