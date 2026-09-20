-- 0356_meeting_attendance.sql
-- Replaces meeting_participants as the backing table for per-meeting
-- attendance analytics (MeetingParticipantsPanel.tsx / livekit-egress's
-- track-participant + list-participants actions).
--
-- BUG FOUND & FIXED: migration 0353 assumed `meeting_participants` was a
-- fresh name and created it with `create table if not exists` — but a table
-- of that exact name already existed in production, left over from the old
-- Daily.co-era call UI (participant role/removal tracking, still live —
-- see useDailyRoom.ts / MinistryInteractiveMeetings.tsx / LiveChannel-
-- InteractiveMeetings.tsx, all of which UPDATE it by session_id). That old
-- table has no meeting_table or is_guest column, meeting_id is a uuid FK
-- hard-locked to ministry_video_meetings(id) only, and user_id is a uuid FK
-- to auth.users (no guest support). `create table if not exists` silently
-- no-op'd against it, so 0353's intended columns never existed — every
-- track-participant insert has been failing (caught, swallowed) since,
-- meaning attendance analytics has had 0 rows for every meeting kind, not
-- just webinars.
--
-- Fix: give the analytics feature its OWN table instead of colliding with
-- the legacy one. meeting_participants itself is untouched — confirmed
-- (grepped the whole repo) it's only ever UPDATEd by session_id from three
-- call sites for live-call role/removal, never INSERTed anywhere in current
-- code, so nothing there depends on its shape changing or not.

begin;

create table if not exists public.meeting_attendance (
  id             uuid primary key default gen_random_uuid(),
  -- Generic id, not a strict FK — mirrors livekit_recordings.meeting_id /
  -- meeting_ai_notes.meeting_id, since this spans every meeting kind
  -- (ministry meetings, channel meetings, counselling, webinars), not just
  -- one FK-able table.
  meeting_id     text        not null,
  meeting_table  text        not null default 'ministry_video_meetings'
                 check (meeting_table in ('meetings', 'ministry_video_meetings',
                                          'live_channel_video_meetings', 'ministry_webinars')),
  -- A real auth.users uuid (as text) for signed-in members, or a synthetic
  -- 'guest-...' string for guests — never a foreign key, so guests (who
  -- have no auth.users row) can be tracked too.
  user_id        text        not null,
  user_name      text        not null,
  is_guest       boolean     not null default false,
  joined_at      timestamptz not null default now(),
  left_at        timestamptz,
  is_active      boolean     not null default true
);

create index if not exists idx_meeting_attendance_meeting
  on public.meeting_attendance (meeting_id, joined_at);
create index if not exists idx_meeting_attendance_active
  on public.meeting_attendance (meeting_id, user_id) where is_active;

alter table public.meeting_attendance enable row level security;
-- No client-side policies — service role only (livekit-egress enforces the
-- host check before any read, and accepts join/leave writes from any
-- current participant, same trust model 0353 intended).

commit;
