-- 0247_meeting_timezone_reminders.sql
-- Timezone-aware scheduled meetings + per-meeting reminder offsets, and a ledger
-- that makes the reminder sender idempotent.
--
-- scheduled_time stays a timestamptz (a real UTC instant). `timezone` records the
-- IANA zone the host scheduled it in, so the client can render the wall-clock time
-- in that zone with its label (e.g. "2:00 PM EDT") no matter where the viewer is.
-- `reminder_offsets` is the list of "minutes before start" the host chose.

alter table public.ministry_video_meetings
  add column if not exists timezone text,
  add column if not exists reminder_offsets integer[] not null default '{}'::integer[];

-- Idempotency ledger for process-meeting-reminders: one row per (meeting, user,
-- offset) that has been delivered. The unique constraint is what stops a cron tick
-- from re-sending a reminder it already sent.
create table if not exists public.meeting_reminder_sends (
  id             uuid primary key default gen_random_uuid(),
  meeting_id     uuid not null references public.ministry_video_meetings(id) on delete cascade,
  user_id        uuid not null,
  offset_minutes integer not null,
  sent_at        timestamptz not null default now(),
  unique (meeting_id, user_id, offset_minutes)
);

create index if not exists idx_meeting_reminder_sends_meeting
  on public.meeting_reminder_sends (meeting_id);

-- The sender runs as the service role (which bypasses RLS). Enable RLS with no
-- policies so no client can read or write the ledger directly.
alter table public.meeting_reminder_sends enable row level security;
