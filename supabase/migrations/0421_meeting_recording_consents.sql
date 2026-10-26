-- 0421_meeting_recording_consents.sql
-- =====================================================================
-- A record of each participant tapping OK on the "This meeting is being
-- recorded" pop-up (DailyVideoCall). One row per OK, so a meeting recorded
-- twice has two rows per person.
--
-- Written through record_recording_consent() so guests, who join meetings
-- without signing in, are recorded too; the function fills user_id from the
-- caller's session itself, so nobody can record consent for someone else's
-- account. Readable by the person themselves and by platform admins.
-- =====================================================================

create table if not exists public.meeting_recording_consents (
  id uuid primary key default gen_random_uuid(),
  meeting_id text not null,
  meeting_kind text,
  -- The signed-in user, or null for a guest.
  user_id uuid references auth.users (id) on delete set null,
  -- The in-meeting identity (user id, or the guest's generated id).
  participant_id text not null,
  participant_name text,
  is_guest boolean not null default false,
  acknowledged_at timestamptz not null default now()
);

create index if not exists idx_meeting_recording_consents_meeting
  on public.meeting_recording_consents (meeting_id, acknowledged_at);
create index if not exists idx_meeting_recording_consents_user
  on public.meeting_recording_consents (user_id);

alter table public.meeting_recording_consents enable row level security;

drop policy if exists p_meeting_recording_consents_read on public.meeting_recording_consents;
create policy p_meeting_recording_consents_read on public.meeting_recording_consents
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));
-- No insert/update/delete policies: rows only come from the function below.

create or replace function public.record_recording_consent(
  p_meeting_id text,
  p_meeting_kind text,
  p_participant_id text,
  p_participant_name text,
  p_is_guest boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_meeting_id), '') = '' or coalesce(trim(p_participant_id), '') = '' then
    raise exception 'meeting id and participant id are required' using errcode = '22023';
  end if;

  insert into public.meeting_recording_consents
    (meeting_id, meeting_kind, user_id, participant_id, participant_name, is_guest)
  values (
    left(p_meeting_id, 200),
    left(p_meeting_kind, 40),
    auth.uid(),
    left(p_participant_id, 200),
    left(p_participant_name, 200),
    coalesce(p_is_guest, auth.uid() is null)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_recording_consent(text, text, text, text, boolean) from public;
grant execute on function public.record_recording_consent(text, text, text, text, boolean) to anon, authenticated;
