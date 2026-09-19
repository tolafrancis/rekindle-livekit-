-- 0353_meeting_participants.sql
-- Per-meeting attendance analytics (total participants, who, and when they
-- joined) for the host: "how many people came to this meeting?"
--
-- A `meeting_participants` table was already referenced by DailyVideoCall.tsx
-- (trackParticipantJoin/trackParticipantLeave) but never actually created by
-- any migration — every one of those writes has been silently failing (caught
-- and console.error'd) since that code was written. This creates the real
-- table. Written/read exclusively through livekit-egress's service role (see
-- 'track-participant' / 'list-participants' actions) rather than client-side
-- RLS, because guest participants (userId like 'guest-...') have no
-- auth.users row for an RLS policy to key off.

create table if not exists public.meeting_participants (
  id             uuid primary key default gen_random_uuid(),
  -- The meeting row id (text — mirrors livekit_recordings.meeting_id /
  -- meeting_ai_notes.meeting_id, which are also arbitrary room/meeting ids,
  -- not always a real ministry_video_meetings uuid).
  meeting_id     text        not null,
  meeting_table  text        not null default 'ministry_video_meetings'
                 check (meeting_table in ('meetings', 'ministry_video_meetings',
                                          'live_channel_video_meetings')),
  -- A real auth.users uuid for signed-in members, or a synthetic 'guest-...'
  -- string for guests (see MinistryInteractiveMeetings.tsx's isGuest check) —
  -- never a foreign key for that reason.
  user_id        text        not null,
  user_name      text        not null,
  is_guest       boolean     not null default false,
  joined_at      timestamptz not null default now(),
  left_at        timestamptz,
  is_active      boolean     not null default true
);

create index if not exists idx_meeting_participants_meeting
  on public.meeting_participants (meeting_id, joined_at);
create index if not exists idx_meeting_participants_active
  on public.meeting_participants (meeting_id, user_id) where is_active;

alter table public.meeting_participants enable row level security;
-- No client-side policies — service role only (see header comment). The
-- livekit-egress function enforces the host check before any read, and
-- accepts join/leave writes from any current participant of the meeting.
