-- 0146_livekit_recordings.sql
-- Phase 5 (§12) — self-hosted LiveKit Egress has no managed recordings list, so we
-- track every egress output ourselves (see plan §6F). One row per recording;
-- `livekit-egress` writes it on start and updates it on stop / webhook.

create table if not exists public.livekit_recordings (
  id             uuid primary key default gen_random_uuid(),
  egress_id      text        not null,
  room_name      text        not null,
  kind           text        not null default 'meeting'
                 check (kind in ('meeting', 'channel')),
  channel_id     uuid        references public.live_channels (id) on delete cascade,
  meeting_id     text,                         -- meetingId or room name for meetings
  meeting_table  text,                         -- which meetings table to write recording_url back to (meeting VOD)
  status         text        not null default 'recording'
                 check (status in ('recording', 'processing', 'completed', 'failed')),
  filepath       text,                         -- S3 key / HLS prefix
  playback_url   text,                         -- HLS .m3u8 (or MP4) URL for VOD
  duration_seconds integer,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz
);

create index if not exists idx_livekit_recordings_channel
  on public.livekit_recordings (channel_id, started_at desc);
create index if not exists idx_livekit_recordings_meeting
  on public.livekit_recordings (meeting_id, started_at desc);
create unique index if not exists uq_livekit_recordings_egress
  on public.livekit_recordings (egress_id);

alter table public.livekit_recordings enable row level security;

-- Channel owners can read their channel's recordings; meeting rows are read via
-- the service role (list-recordings edge fn). Writes are service-role only.
drop policy if exists "channel owner reads recordings" on public.livekit_recordings;
create policy "channel owner reads recordings"
  on public.livekit_recordings
  for select using (
    channel_id is not null
    and exists (
      select 1 from public.live_channels lc
      where lc.id = livekit_recordings.channel_id and lc.owner_id = auth.uid()
    )
  );
