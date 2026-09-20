-- 0354_ministry_webinars.sql
-- Webinar Phase 1 — a wholly new, separate meeting type from
-- ministry_video_meetings (see docs/plans — approved 2026-09-20). Attendees
-- are HLS-only viewers who never join the LiveKit room; only host/co-host/
-- speakers ever call livekit-token. Reuses the existing meeting_presenters/
-- meeting_raised_hands "stage" tables unchanged (both uuid-keyed on
-- meeting_id, confirmed directly against the live DB before writing this —
-- see plan's "Before writing code" step; meeting_presenters.meeting_id is
-- `uuid`, so ministry_webinars.id — also uuid — is a drop-in key).
--
-- FIXED PRE-EXISTING BUG, found while verifying the above: the
-- `claim_meeting_seat` RPC that useMeetingStage.ts's claimSeat() calls did
-- not exist anywhere in this database (searched all schemas) — every
-- raise-hand-to-seat claim in today's Interactive Meetings webinar mode has
-- been silently failing (caught, logged, swallowed) in production. Defined
-- for real at the bottom of this migration. Webinar's own accept-invite flow
-- (packages/live/src/webinar/useWebinarSpeakerRequests.ts) still inserts
-- into meeting_presenters directly rather than calling it, since its
-- request/accept handshake already IS the capacity check (a request is only
-- ever invited if the host chose to invite it) — this RPC's job is purely
-- the existing raise-hand/ad-hoc-claim path in useMeetingStage.ts.
--
-- FLAGGED, NOT FIXED HERE: meeting_participants (attendance analytics, added
-- by migration 0353) also turned out to be broken in production for the same
-- reason — a table of that name already existed (older, unrelated purpose)
-- before 0353 ran, so `create table if not exists` no-op'd and 0353's
-- intended columns were never added. See the note beside the (removed)
-- meeting_participants ALTER below for detail. This is a bigger, cross-
-- cutting fix than this migration's scope, so it's surfaced to the user
-- rather than patched inline here.

begin;

-- ── Main webinar record ─────────────────────────────────────────────────
create table if not exists public.ministry_webinars (
  id                     uuid primary key default gen_random_uuid(),
  ministry_id            uuid not null references public.ministry_groups (id) on delete cascade,
  host_id                uuid not null references auth.users (id),

  title                  text not null,
  description            text,
  cover_image_url        text,

  -- One real UTC instant + the zone it was entered in, for display — same
  -- shape as ministry_video_meetings.scheduled_time/timezone.
  scheduled_start_at     timestamptz,
  timezone               text,
  duration_minutes       integer not null default 60,

  room_name              text not null unique,
  max_attendees          integer not null default 500,

  -- Registration is Phase 2+, but the columns exist now so the schema
  -- doesn't need another migration to turn it on later.
  registration_required  boolean not null default false,
  is_public              boolean not null default true,
  access_level           text not null default 'public'
                         check (access_level in ('public', 'members', 'invite_only')),

  -- Feature toggles settable at creation. enable_recording/enable_reactions/
  -- enable_captions/enable_translation are wired to real runtime behavior in
  -- Phase 1; enable_chat/enable_qa/enable_polls are captured now but inert
  -- until those phases land (creation wizard shows them as "coming soon").
  enable_recording       boolean not null default true,
  enable_chat            boolean not null default false,
  enable_qa              boolean not null default false,
  enable_polls           boolean not null default false,
  enable_reactions       boolean not null default true,
  enable_captions        boolean not null default false,
  enable_translation     boolean not null default false,
  default_language       text not null default 'en',

  -- Full lifecycle from the product spec. Phase 1 only drives a subset
  -- (draft/scheduled/live/ended/completed/cancelled) — the rest exist so
  -- Phase 2+ (registration_open/starting_soon/ending/recording_processing)
  -- doesn't need a CHECK constraint migration of its own.
  status                 text not null default 'draft'
                         check (status in (
                           'draft', 'scheduled', 'registration_open', 'starting_soon',
                           'live', 'ending', 'ended', 'recording_processing',
                           'completed', 'cancelled'
                         )),

  hls_playback_url            text,
  recording_status            text,
  recording_url                text,
  recording_duration_seconds  integer,
  recording_started_at        timestamptz,
  recording_ended_at          timestamptz,

  attendee_count         integer not null default 0,

  started_at             timestamptz,
  ended_at               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_ministry_webinars_ministry_status
  on public.ministry_webinars (ministry_id, status);
create index if not exists idx_ministry_webinars_scheduled
  on public.ministry_webinars (scheduled_start_at);

alter table public.ministry_webinars enable row level security;

-- Read: a public webinar is readable by anyone; otherwise ministry
-- members/leaders/owner. Reuses the canonical is_group_member predicate
-- (migration 0150) rather than re-deriving the membership check inline.
drop policy if exists "read ministry webinars" on public.ministry_webinars;
create policy "read ministry webinars"
  on public.ministry_webinars for select using (
    is_public = true or public.is_group_member(ministry_id, auth.uid())
  );

-- Write: host, or a ministry admin/leader/owner (is_group_admin already
-- covers owner/leader — see migration 0150).
drop policy if exists "manage ministry webinars" on public.ministry_webinars;
create policy "manage ministry webinars"
  on public.ministry_webinars for all using (
    host_id = auth.uid() or public.is_group_admin(ministry_id, auth.uid())
  ) with check (
    host_id = auth.uid() or public.is_group_admin(ministry_id, auth.uid())
  );

-- ── Pre-assigned speaker/panelist roster (invite/accept BEFORE the event) ──
-- Distinct from meeting_presenters (the live, ad-hoc seat roster during the
-- event itself — reused unchanged, not duplicated here).
create table if not exists public.webinar_speakers (
  id             uuid primary key default gen_random_uuid(),
  webinar_id     uuid not null references public.ministry_webinars (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete cascade,
  invited_email  text,
  invited_name   text,
  role           text not null default 'speaker' check (role in ('host', 'co-host', 'speaker')),
  status         text not null default 'invited' check (status in ('invited', 'confirmed', 'declined', 'removed')),
  invited_at     timestamptz not null default now(),
  responded_at   timestamptz,
  created_at     timestamptz not null default now(),
  check (user_id is not null or invited_email is not null)
);

create unique index if not exists uq_webinar_speakers_user
  on public.webinar_speakers (webinar_id, user_id) where user_id is not null;
create unique index if not exists uq_webinar_speakers_email
  on public.webinar_speakers (webinar_id, lower(invited_email)) where invited_email is not null;

alter table public.webinar_speakers enable row level security;

drop policy if exists "host manages webinar_speakers" on public.webinar_speakers;
create policy "host manages webinar_speakers"
  on public.webinar_speakers for all using (
    exists (select 1 from public.ministry_webinars w where w.id = webinar_speakers.webinar_id and w.host_id = auth.uid())
  ) with check (
    exists (select 1 from public.ministry_webinars w where w.id = webinar_speakers.webinar_id and w.host_id = auth.uid())
  );

drop policy if exists "invited speaker reads own row" on public.webinar_speakers;
create policy "invited speaker reads own row"
  on public.webinar_speakers for select using (user_id = auth.uid());

drop policy if exists "invited speaker responds" on public.webinar_speakers;
create policy "invited speaker responds"
  on public.webinar_speakers for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Live "request to speak" handshake ───────────────────────────────────
-- request -> host invites -> attendee accepts -> granted. Kept separate from
-- meeting_raised_hands (a simple presence-only raise/lower, no status/
-- approval concept) so the richer handshake doesn't have to fight that
-- table's existing shape.
create table if not exists public.webinar_speaker_requests (
  id            uuid primary key default gen_random_uuid(),
  webinar_id    uuid not null references public.ministry_webinars (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  user_name     text,
  status        text not null default 'requested'
                check (status in ('requested', 'invited', 'accepted', 'declined', 'withdrawn', 'revoked')),
  requested_at  timestamptz not null default now(),
  invited_at    timestamptz,
  accepted_at   timestamptz,
  granted_at    timestamptz,
  unique (webinar_id, user_id)
);

create index if not exists idx_webinar_speaker_requests_webinar
  on public.webinar_speaker_requests (webinar_id, status);

alter table public.webinar_speaker_requests enable row level security;

drop policy if exists "attendee manages own request" on public.webinar_speaker_requests;
create policy "attendee manages own request"
  on public.webinar_speaker_requests for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "host manages all requests" on public.webinar_speaker_requests;
create policy "host manages all requests"
  on public.webinar_speaker_requests for all using (
    exists (select 1 from public.ministry_webinars w where w.id = webinar_speaker_requests.webinar_id and w.host_id = auth.uid())
  ) with check (
    exists (select 1 from public.ministry_webinars w where w.id = webinar_speaker_requests.webinar_id and w.host_id = auth.uid())
  );

-- ── Widen existing closed sets so already-shipped infrastructure works for
--    webinars with ZERO component changes ───────────────────────────────
-- NOTE: meeting_participants is deliberately NOT touched here. It was
-- assumed (per migration 0353's own header comment) to be a fresh table with
-- a meeting_table discriminator column — but a table of that exact name
-- already existed in production (an older, unrelated Daily.co-era
-- participant/waiting-room tracker: no meeting_table column, meeting_id is a
-- uuid FK hard-locked to ministry_video_meetings(id), user_id is a uuid FK to
-- auth.users so it can't even hold guests). `create table if not exists` in
-- 0353 silently no-op'd against it, so the "attendance analytics" feature
-- has 0 rows in production and has never worked for ANY meeting kind, not
-- just webinars — flagged to the user as a separate, pre-existing bug rather
-- than fixed here, since untangling two different features sharing one table
-- name is a bigger call than this migration's scope.

alter table public.livekit_recordings
  drop constraint if exists livekit_recordings_kind_check;
alter table public.livekit_recordings
  add constraint livekit_recordings_kind_check
  check (kind in ('meeting', 'channel', 'webinar'));

-- ── Fix: claim_meeting_seat (see header comment) ────────────────────────
-- Atomically takes one of the limited live seats. pg_advisory_xact_lock
-- (not `select ... for update`) because a brand-new meeting has zero
-- existing meeting_presenters rows to lock — nothing to contend on there,
-- so two concurrent first-claimers could otherwise both read count=0 and
-- both insert, exceeding p_max. The advisory lock is keyed on the meeting
-- id regardless of whether any rows exist yet, closing that race.
create or replace function public.claim_meeting_seat(
  p_meeting_id uuid,
  p_user_id text,
  p_user_name text,
  p_max integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_meeting_id::text));

  -- Already seated — idempotent success, not a new claim against the cap.
  if exists (
    select 1 from public.meeting_presenters
    where meeting_id = p_meeting_id and user_id = p_user_id
  ) then
    return true;
  end if;

  if (select count(*) from public.meeting_presenters where meeting_id = p_meeting_id) >= p_max then
    return false;
  end if;

  insert into public.meeting_presenters (meeting_id, user_id, user_name, role)
  values (p_meeting_id, p_user_id, p_user_name, 'speaker');

  return true;
end;
$$;

grant execute on function public.claim_meeting_seat(uuid, text, text, integer) to authenticated;

commit;
