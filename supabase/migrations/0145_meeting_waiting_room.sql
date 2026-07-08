-- 0145_meeting_waiting_room.sql
-- Phase 1 (§1C) — custom waiting room. LiveKit has no native knock, so non-host
-- callers to `livekit-token` with waiting-room enabled are queued here instead of
-- being issued a token. Phase 3D builds the host-side realtime UI + admit/reject
-- on top of this table.

create table if not exists public.meeting_waiting_room (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   text        not null,          -- meetingId when known, else the LiveKit room name
  user_id      uuid        not null references auth.users (id) on delete cascade,
  name         text,
  requested_at timestamptz not null default now(),
  status       text        not null default 'waiting'
               check (status in ('waiting', 'admitted', 'rejected')),
  unique (meeting_id, user_id)
);

create index if not exists idx_meeting_waiting_room_meeting
  on public.meeting_waiting_room (meeting_id, status);

alter table public.meeting_waiting_room enable row level security;

-- A user can see / withdraw their own request. The edge function writes via the
-- service role (bypasses RLS); host-side reads/admits in Phase 3D also go through
-- the service role, so no broad host policy is needed here yet.
drop policy if exists "own waiting-room row" on public.meeting_waiting_room;
create policy "own waiting-room row"
  on public.meeting_waiting_room
  for select using (auth.uid() = user_id);

drop policy if exists "withdraw own waiting-room row" on public.meeting_waiting_room;
create policy "withdraw own waiting-room row"
  on public.meeting_waiting_room
  for delete using (auth.uid() = user_id);
