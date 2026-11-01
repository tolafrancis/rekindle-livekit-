-- 0427_webinar_guest_registration.sql
-- Zoom-style webinar registration:
--   • Guests (no Rekindle account) register for a PUBLIC webinar with a name +
--     email and get a personal join link (meeting_registrations.join_token).
--   • Hosts can require approval (ministry_webinars.registration_approval =
--     'manual'): new registrations start 'pending' until approved/declined.
--   • Webinar registrations now go through the webinar-registration edge
--     function (which sends the confirmation/approval emails), so the direct
--     client insert/update paths are closed for meeting_kind = 'webinar'.
--     Ministry/channel meeting registrations are unchanged.

begin;

-- ── Personal join link + approval states ────────────────────────────────
alter table public.meeting_registrations
  add column if not exists join_token uuid not null default gen_random_uuid();
create unique index if not exists meeting_reg_join_token_uniq
  on public.meeting_registrations (join_token);

alter table public.meeting_registrations
  add column if not exists decided_at timestamptz;

alter table public.meeting_registrations
  drop constraint if exists meeting_registrations_status_check;
alter table public.meeting_registrations
  add constraint meeting_registrations_status_check
  check (status in ('registered', 'cancelled', 'pending', 'declined'));

alter table public.ministry_webinars
  add column if not exists registration_approval text not null default 'automatic'
  check (registration_approval in ('automatic', 'manual'));

-- ── Close direct writes for webinar registrations ───────────────────────
-- (insert/approve happen in the webinar-registration edge function with the
-- service role; users can still cancel their own row.)
alter policy meeting_reg_self_insert on public.meeting_registrations
  with check (user_id = auth.uid() and meeting_kind <> 'webinar');
alter policy meeting_reg_guest_insert on public.meeting_registrations
  with check (user_id is null and guest_email is not null and meeting_kind <> 'webinar');
alter policy meeting_reg_self_update on public.meeting_registrations
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (meeting_kind <> 'webinar' or status = 'cancelled'));

-- ── Guest link lookup ───────────────────────────────────────────────────
-- A guest opens /ministry/:m/webinar/:w?tk=<join_token>. The token is the
-- credential: whoever holds it sees only that one registration.
create or replace function public.webinar_registration_by_token(p_token uuid)
returns table (
  registration_id uuid,
  webinar_id uuid,
  display_name text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.meeting_id, coalesce(r.guest_name, p.full_name, 'Guest'), r.status
  from public.meeting_registrations r
  left join public.user_profiles p on p.user_id = r.user_id
  where r.join_token = p_token and r.meeting_kind = 'webinar'
  limit 1;
$$;
grant execute on function public.webinar_registration_by_token(uuid) to anon, authenticated;

commit;
