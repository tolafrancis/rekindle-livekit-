-- 0249_meeting_registration_toggle.sql
-- Host-controlled "Enable registration" flag for scheduled meetings. When off, the
-- Register button/RSVP flow is hidden; reminders still work for eligible members.
-- Default false so existing meetings keep their current (no-registration) behaviour.

alter table public.ministry_video_meetings
  add column if not exists registration_enabled boolean not null default false;

alter table public.live_channel_video_meetings
  add column if not exists registration_enabled boolean not null default false;
