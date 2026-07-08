-- supabase/migrations/0015_live_channel_simulcast_targets.sql
-- Phase 1: manual simulcast (restream) of a channel's live broadcast to
-- YouTube Live & Facebook Live via Mux Simulcast Targets.
--
-- Run in the Supabase SQL Editor (idempotent; safe to re-run).

-- ── live_channels.mux_live_stream_id ─────────────────────────────────────────
-- The Mux live stream id is needed to attach/detach simulcast targets. The
-- manage-stream-input `create` action mints the Mux stream; persist its id here
-- so simulcast actions know which stream to target. (The edge function also
-- back-fills this column on demand if it is null — see simulcast-actions.ts.)
alter table public.live_channels
  add column if not exists mux_live_stream_id text;

-- ── live_channel_simulcast_targets ───────────────────────────────────────────
create table if not exists public.live_channel_simulcast_targets (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid not null references public.live_channels(id) on delete cascade,
  platform        text not null check (platform in ('youtube','facebook')),
  server_url      text not null,
  stream_key      text not null,          -- secret; lock down with RLS
  mux_target_id   text,                   -- id returned by Mux when attached
  enabled         boolean not null default true,
  source          text not null default 'manual',  -- forward-compat: 'manual' | 'oauth'
  status          text not null default 'idle',     -- 'idle' | 'active' | 'error'
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (channel_id, platform)
);

create index if not exists idx_simulcast_targets_channel
  on public.live_channel_simulcast_targets (channel_id);

alter table public.live_channel_simulcast_targets enable row level security;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Only the channel's owner may read/write its simulcast targets. Stream keys are
-- password-equivalent and must never be readable by non-owners. The
-- manage-stream-input edge function uses the service role and bypasses RLS, and
-- it omits stream_key from every response it returns to the client.
--
-- Mirrors the owner-scoped pattern used for live_channels / channel config:
-- access is gated by live_channels.owner_id = auth.uid().

drop policy if exists "simulcast_targets_owner_select" on public.live_channel_simulcast_targets;
create policy "simulcast_targets_owner_select" on public.live_channel_simulcast_targets
  for select using (
    exists (
      select 1 from public.live_channels lc
      where lc.id = live_channel_simulcast_targets.channel_id
        and lc.owner_id = auth.uid()
    )
  );

drop policy if exists "simulcast_targets_owner_insert" on public.live_channel_simulcast_targets;
create policy "simulcast_targets_owner_insert" on public.live_channel_simulcast_targets
  for insert with check (
    exists (
      select 1 from public.live_channels lc
      where lc.id = live_channel_simulcast_targets.channel_id
        and lc.owner_id = auth.uid()
    )
  );

drop policy if exists "simulcast_targets_owner_update" on public.live_channel_simulcast_targets;
create policy "simulcast_targets_owner_update" on public.live_channel_simulcast_targets
  for update using (
    exists (
      select 1 from public.live_channels lc
      where lc.id = live_channel_simulcast_targets.channel_id
        and lc.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.live_channels lc
      where lc.id = live_channel_simulcast_targets.channel_id
        and lc.owner_id = auth.uid()
    )
  );

drop policy if exists "simulcast_targets_owner_delete" on public.live_channel_simulcast_targets;
create policy "simulcast_targets_owner_delete" on public.live_channel_simulcast_targets
  for delete using (
    exists (
      select 1 from public.live_channels lc
      where lc.id = live_channel_simulcast_targets.channel_id
        and lc.owner_id = auth.uid()
    )
  );

-- keep updated_at fresh on every write
create or replace function public.touch_simulcast_targets_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_simulcast_targets_updated_at on public.live_channel_simulcast_targets;
create trigger trg_simulcast_targets_updated_at
  before update on public.live_channel_simulcast_targets
  for each row execute function public.touch_simulcast_targets_updated_at();
