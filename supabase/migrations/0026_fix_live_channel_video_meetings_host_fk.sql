-- supabase/migrations/0026_fix_live_channel_video_meetings_host_fk.sql
-- Fix live-channel interactive meeting creation.
--
-- The app inserts `host_id = auth.users.id` (the logged-in user) for BOTH
-- ministry_video_meetings and live_channel_video_meetings — identical payloads.
-- The ministry insert works, but the channel insert fails with:
--   insert or update on table "live_channel_video_meetings"
--   violates foreign key constraint "live_channel_video_meetings_host_id_fkey"
-- i.e. the channel table's host_id FK points at a table/column that does NOT
-- contain the auth user id (a schema drift from the working ministry table).
--
-- Re-point host_id at auth.users(id) so it matches the value the app inserts
-- (and the working ministry flow). Run in the Supabase SQL Editor. Idempotent.

alter table public.live_channel_video_meetings
  drop constraint if exists live_channel_video_meetings_host_id_fkey;

alter table public.live_channel_video_meetings
  add constraint live_channel_video_meetings_host_id_fkey
  foreign key (host_id) references auth.users (id) on delete cascade;
