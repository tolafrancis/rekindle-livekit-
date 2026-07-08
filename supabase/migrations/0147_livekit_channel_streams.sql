-- 0147_livekit_channel_streams.sql
-- Phase 6 (§6F/§6C/§6E) — self-hosted LiveKit: we track egress/ingress IDs per
-- channel ourselves (nothing auto-lists or auto-cleans them). Plus the simulcast
-- egress id, and the dead-code table drop.

-- §6F — per-channel LiveKit stream handles, for start/stop/cleanup.
create table if not exists public.channel_streams (
  channel_id     uuid primary key references public.live_channels (id) on delete cascade,
  hls_egress_id  text,          -- room-composite → HLS egress (the live broadcast)
  ingress_id     text,          -- RTMP/WHIP ingress (OBS/encoder), if used
  ingress_url    text,          -- OBS "Server" URL for this ingress
  updated_at     timestamptz not null default now()
);

alter table public.channel_streams enable row level security;

drop policy if exists "channel owner manages streams" on public.channel_streams;
create policy "channel owner manages streams"
  on public.channel_streams
  for select using (
    exists (select 1 from public.live_channels lc
            where lc.id = channel_streams.channel_id and lc.owner_id = auth.uid())
  );
-- Writes go through the service role (edge fns).

-- §6C — one RTMP Egress per simulcast destination. Add egress_id ALONGSIDE the
-- existing mux_target_id so Daily/Mux and LiveKit coexist during the migration;
-- Phase 7 drops mux_target_id.
alter table public.live_channel_simulcast_targets
  add column if not exists egress_id text;

-- §6E — retire the dead raw-WebRTC mesh. `voice_room_participants` has no code
-- references (grep-verified). Destructive but the feature is deleted.
drop table if exists public.voice_room_participants cascade;
