-- 0248_channel_meeting_timezone_registration.sql
-- 1) Mirror the ministry meeting scheduling fields onto live-channel meetings.
-- 2) Generalize the reminder ledger so ONE cron covers both meeting kinds and can
--    dedupe guests (who have no user id) by a recipient_key.
-- 3) Add meeting_registrations so people (members/followers AND guests) can RSVP.

-- ── 1. Live-channel meetings: timezone + reminder offsets ─────────────────────
alter table public.live_channel_video_meetings
  add column if not exists timezone text,
  add column if not exists reminder_offsets integer[] not null default '{}'::integer[];

-- ── 2. Generalize the reminder ledger ────────────────────────────────────────
-- 0247 created meeting_reminder_sends keyed on (meeting_id, user_id). It has no
-- rows yet (the cron was never deployed), so redefine it: `recipient_key` is the
-- user uuid as text OR 'guest:'+lower(email), and `meeting_kind` distinguishes the
-- two source tables. The uuid FK is dropped since ids now come from either table.
drop table if exists public.meeting_reminder_sends;
create table public.meeting_reminder_sends (
  id             uuid primary key default gen_random_uuid(),
  meeting_id     uuid not null,
  meeting_kind   text not null default 'ministry',
  recipient_key  text not null,
  offset_minutes integer not null,
  sent_at        timestamptz not null default now(),
  unique (meeting_id, recipient_key, offset_minutes)
);
create index idx_meeting_reminder_sends_meeting on public.meeting_reminder_sends (meeting_id);
alter table public.meeting_reminder_sends enable row level security; -- service-role only

-- ── 3. Meeting registrations (RSVP) ──────────────────────────────────────────
create table if not exists public.meeting_registrations (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null,
  meeting_kind  text not null check (meeting_kind in ('ministry','channel')),
  user_id       uuid references auth.users(id) on delete cascade,
  guest_name    text,
  guest_email   text,
  status        text not null default 'registered' check (status in ('registered','cancelled')),
  registered_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- One registration per user per meeting, and one per guest email per meeting.
create unique index if not exists meeting_reg_user_uniq
  on public.meeting_registrations (meeting_id, user_id) where user_id is not null;
create unique index if not exists meeting_reg_guest_uniq
  on public.meeting_registrations (meeting_id, lower(guest_email)) where guest_email is not null;
create index if not exists idx_meeting_reg_meeting_status
  on public.meeting_registrations (meeting_id, status);

alter table public.meeting_registrations enable row level security;

-- Read: a user sees their own rows; a host sees all rows for their meeting.
create policy meeting_reg_self_read on public.meeting_registrations
  for select using (user_id = auth.uid());
create policy meeting_reg_host_read on public.meeting_registrations
  for select using (
    (meeting_kind = 'ministry' and exists (
      select 1 from public.ministry_video_meetings m where m.id = meeting_id and m.host_id = auth.uid()))
    or (meeting_kind = 'channel' and exists (
      select 1 from public.live_channel_video_meetings m where m.id = meeting_id and m.host_id = auth.uid()))
  );

-- Insert: authenticated users register themselves; guests insert guest rows.
create policy meeting_reg_self_insert on public.meeting_registrations
  for insert to authenticated with check (user_id = auth.uid());
create policy meeting_reg_guest_insert on public.meeting_registrations
  for insert to anon with check (user_id is null and guest_email is not null);

-- A user can cancel/update or remove their own registration.
create policy meeting_reg_self_update on public.meeting_registrations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy meeting_reg_self_delete on public.meeting_registrations
  for delete using (user_id = auth.uid());

-- Public registrant COUNT without exposing PII (names/emails). Used to render the
-- "N registered" badge for everyone, including guests.
create or replace function public.meeting_registration_count(p_meeting_id uuid)
returns integer language sql security definer stable as $$
  select count(*)::int
  from public.meeting_registrations
  where meeting_id = p_meeting_id and status = 'registered';
$$;
grant execute on function public.meeting_registration_count(uuid) to anon, authenticated;
