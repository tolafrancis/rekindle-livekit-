-- 0363_webinar_chat_recording_visibility_analytics.sql
-- Three fixes for the Webinar feature, investigated and grounded against the
-- live DB before writing this (see the user's explicit "check existing
-- architecture" ask this turn):
--
-- 1. meeting_chat.meeting_id had a hard FK to ministry_video_meetings(id)
--    only — every webinar chat insert (webinar.id is a ministry_webinars row)
--    hit a foreign-key violation. Widened the same way meeting_attendance/
--    livekit_recordings already handle "one column, several possible parent
--    tables": drop the single-table FK, add a meeting_table discriminator
--    instead (app-layer validated, not DB-level — same established pattern).
--
-- 2. ministry_webinars gets a recording_visibility column (public/private,
--    default private) — the recording pipeline itself already works for
--    webinars (kind='webinar' rows in livekit_recordings, confirmed live with
--    real completed recordings); this is purely the missing visibility flag.
--    Enforcement lives in livekit-egress's list-recordings action (code
--    change, not this migration).
--
-- 3. webinar_attendance_summary (0357) was registration-anchored — it built
--    attended_count/avg_duration from `regs join att`, so a webinar with
--    registration_required=false (confirmed: every test webinar so far) always
--    reported 0 attended regardless of how many real meeting_attendance rows
--    existed (confirmed live: 22 real rows, all reported as 0). Replaced with
--    an attendance-anchored version — registered_count/no_show_count stay
--    registration-based (that concept requires registration to be meaningful),
--    but attended_count/avg_duration_minutes now come directly from real
--    attendance, matching the common case where registration isn't required.

begin;

-- ── 1. meeting_chat: widen for cross-kind meeting_id (same pattern as
--    meeting_attendance/livekit_recordings) ─────────────────────────────────
alter table public.meeting_chat drop constraint if exists meeting_chat_meeting_id_fkey;
alter table public.meeting_chat add column if not exists meeting_table text not null default 'ministry_video_meetings';

-- ── 2. ministry_webinars: recording visibility ──────────────────────────────
alter table public.ministry_webinars
  add column if not exists recording_visibility text not null default 'private'
  check (recording_visibility in ('public', 'private'));

-- ── 3. webinar_attendance_summary: attendance-anchored ──────────────────────
create or replace function public.webinar_attendance_summary(p_webinar_id uuid)
returns table (
  registered_count      integer,
  attended_count        integer,
  no_show_count         integer,
  avg_duration_minutes  numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_webinar_manager(p_webinar_id, auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
  with regs as (
    select user_id from public.meeting_registrations
    where meeting_id = p_webinar_id and meeting_kind = 'webinar'
      and status = 'registered' and user_id is not null
  ),
  att as (
    select user_id::uuid as user_id,
           min(joined_at) as first_joined,
           max(coalesce(left_at, joined_at)) as last_left
    from public.meeting_attendance
    where meeting_id = p_webinar_id::text and meeting_table = 'ministry_webinars'
      and user_id !~ '^guest-'
    group by user_id
  )
  select
    (select count(*) from regs)::int,
    (select count(*) from att)::int,
    (select count(*) from regs r where not exists (select 1 from att a where a.user_id = r.user_id))::int,
    (select avg(extract(epoch from (a.last_left - a.first_joined)) / 60.0) from att a);
end;
$$;

commit;
