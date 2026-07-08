-- supabase/migrations/0016_drop_live_channels_mux_live_stream_id.sql
-- Option A: make `mux_streams` the single source of truth for a channel's Mux
-- live stream id.
--
-- `channel-simulcast` now resolves the stream id from `mux_streams`
-- (scope_type='channel', scope_id=<channel id>), which `manage-stream-input`
-- keeps current on every (re-)provision. The redundant
-- `live_channels.mux_live_stream_id` column added in 0015 was never maintained
-- by manage-stream-input, so it went stale after a re-provision (e.g. toggling
-- recording mints a new Mux stream) and pointed simulcast at a dead stream.
--
-- Run in the Supabase SQL Editor (idempotent; safe to re-run).
-- ORDER MATTERS: deploy the updated `channel-simulcast` function FIRST, then run
-- this — so no live code reads the column while it is being dropped.

alter table public.live_channels
  drop column if exists mux_live_stream_id;
