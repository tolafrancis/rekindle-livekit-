-- 0337_meeting_streams.sql
-- =====================================================================
-- Adds meeting_streams and meeting_simulcast_targets tables to support
-- OBS RTMP ingest and YouTube/Facebook restreaming for Interactive Meetings,
-- mirroring channel_streams and live_channel_simulcast_targets.
-- =====================================================================

begin;

-- 1. OBS Ingest credentials per meeting (mirroring channel_streams)
create table if not exists public.meeting_streams (
  meeting_id           uuid primary key,
  meeting_kind         text not null default 'meeting' check (meeting_kind in ('meeting', 'ministry_meeting', 'channel_meeting')),
  ingress_id           text,
  ingress_url          text,
  ingress_stream_key   text,
  hls_egress_id        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 2. Restream destinations (YouTube / Facebook) per meeting (mirroring live_channel_simulcast_targets)
create table if not exists public.meeting_simulcast_targets (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null,
  platform     text not null check (platform in ('youtube', 'facebook')),
  server_url   text not null,
  egress_id    text,
  enabled      boolean not null default true,
  status       text not null default 'idle' check (status in ('idle', 'active', 'error')),
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (meeting_id, platform)
);

-- Enable RLS
alter table public.meeting_streams enable row level security;
alter table public.meeting_simulcast_targets enable row level security;

-- Write policies: Only service_role can mutate (all mutations run through livekit-ingress/livekit-egress)
create policy "Service role write access on meeting_streams"
  on public.meeting_streams for all using (auth.role() = 'service_role');

create policy "Service role write access on meeting_simulcast_targets"
  on public.meeting_simulcast_targets for all using (auth.role() = 'service_role');

-- Read policies: Service role or meeting host only
create policy "Hosts can view meeting_streams"
  on public.meeting_streams for select using (
    auth.role() = 'service_role' or
    exists (
      select 1 from public.ministry_video_meetings m where m.id = meeting_streams.meeting_id and m.host_id = auth.uid()
      union all
      select 1 from public.live_channel_video_meetings m where m.id = meeting_streams.meeting_id and m.host_id = auth.uid()
    )
  );

create policy "Hosts can view meeting_simulcast_targets"
  on public.meeting_simulcast_targets for select using (
    auth.role() = 'service_role' or
    exists (
      select 1 from public.ministry_video_meetings m where m.id = meeting_simulcast_targets.meeting_id and m.host_id = auth.uid()
      union all
      select 1 from public.live_channel_video_meetings m where m.id = meeting_simulcast_targets.meeting_id and m.host_id = auth.uid()
    )
  );

commit;
