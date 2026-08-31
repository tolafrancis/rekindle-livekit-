-- supabase/migrations/0334_deletion_grace_period_admin_notify.sql
-- Extends 0333_leave_ministry_delete_data.sql with the two gaps flagged
-- after that feature shipped:
--   1. Delete My Data becomes a 30-day GRACE PERIOD request (cancellable)
--      instead of an instant, irreversible hard-delete — matches the
--      "we remove your personal data within 30 days" promise already made
--      in PrivacyPolicyPage.tsx §6.
--   2. Ministry admins/leaders get an in-app notification when a member
--      leaves, requests deletion, cancels a deletion request, or a
--      scheduled deletion actually completes.
--
-- Leave Ministry is NOT given a grace period — it only removes access
-- (history stays intact either way), so it isn't the irreversible action
-- that needed one; it still gets the new admin notification, though.
--
-- Same schema caveat as 0333: several tables here have no CREATE TABLE
-- anywhere in this repo's migrations, so every write against one is
-- wrapped in its own begin/exception block. member_deletion_requests below
-- is the one table this migration fully owns, so it gets real DDL + RLS.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- New table: pending/cancelled/completed data-deletion requests.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.member_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade,
  user_id uuid not null,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'completed')),
  cancelled_at timestamptz,
  completed_at timestamptz
);

-- Only one live pending request per member per ministry.
create unique index if not exists uniq_member_deletion_requests_pending
  on public.member_deletion_requests (ministry_id, user_id)
  where status = 'pending';

-- What the daily sweep scans.
create index if not exists idx_member_deletion_requests_due
  on public.member_deletion_requests (scheduled_for)
  where status = 'pending';

alter table public.member_deletion_requests enable row level security;

-- Member sees their own request; the ministry's owner can also see it (so a
-- future admin-facing view is possible without a second migration). All
-- writes go through the security-definer RPCs below, not direct client
-- inserts/updates — no insert/update/delete policy is defined on purpose.
drop policy if exists member_deletion_requests_select_own on public.member_deletion_requests;
create policy member_deletion_requests_select_own on public.member_deletion_requests
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ministry_groups g
      where g.id = member_deletion_requests.ministry_id and g.owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Internal helper: notify a ministry's owner/leader/admins. Confirmed
-- schema: ministry_groups(owner_id, leader_id) + ministry_group_members
-- (ministry_id, user_id, role, is_leader) — same predicate already trusted
-- in production by public.is_group_admin() (0150_rls_hardening_phase4.sql).
-- public.notifications(user_id, type, title, message, link, is_read)
-- confirmed shape from 0159_notify_followers_on_channel_live.sql / reused
-- in 0332_small_groups_notifications.sql.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public._notify_ministry_admins(
  p_ministry_id uuid, p_type text, p_title text, p_message text, p_link text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, message, link, is_read)
  select admin_id, p_type, p_title, p_message, p_link, false
  from (
    select owner_id as admin_id from public.ministry_groups where id = p_ministry_id and owner_id is not null
    union
    select leader_id as admin_id from public.ministry_groups where id = p_ministry_id and leader_id is not null
    union
    select user_id as admin_id from public.ministry_group_members
      where ministry_id = p_ministry_id and (is_leader = true or role in ('admin', 'moderator'))
  ) admins;
exception when others then
  raise warning '_notify_ministry_admins failed: %', sqlerrm;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- leave_ministry: unchanged behavior, now also notifies admins.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.leave_ministry(p_ministry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select owner_id, name into v_owner_id, v_name from public.ministry_groups where id = p_ministry_id;
  if v_owner_id is null then
    raise exception 'Ministry not found';
  end if;
  if v_owner_id = v_uid then
    raise exception 'Ministry owners must transfer ownership before leaving';
  end if;

  perform public._do_leave_ministry(p_ministry_id, v_uid);

  begin
    insert into public.member_registration_audit (ministry_id, user_id, event_type)
      values (p_ministry_id, v_uid, 'member_left');
  exception when others then
    raise warning 'leave_ministry: audit insert failed: %', sqlerrm;
  end;

  perform public._notify_ministry_admins(
    p_ministry_id, 'member_left', '👋 A member left',
    'Someone left ' || coalesce(v_name, 'your ministry') || '.',
    '/ministry-management'
  );
end;
$$;
grant execute on function public.leave_ministry(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- delete_my_ministry_data becomes the INTERNAL execution step — same body
-- as 0333, unchanged, just re-pointed at an explicit target uid so the
-- scheduled sweep (which has no auth.uid() session) can invoke it. No
-- longer granted to `authenticated` directly: the public entry point is
-- request_data_deletion() below now.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.delete_my_ministry_data(uuid);

create or replace function public.delete_my_ministry_data(p_ministry_id uuid, p_target_uid uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_target_uid, auth.uid());
  v_owner_id uuid;
  v_profile_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select owner_id into v_owner_id from public.ministry_groups where id = p_ministry_id;
  if v_owner_id is null then
    raise exception 'Ministry not found';
  end if;
  if v_owner_id = v_uid then
    raise exception 'Ministry owners must transfer ownership before deleting their data';
  end if;

  -- Can't sensibly remain "in" the ministry with your profile erased.
  perform public._do_leave_ministry(p_ministry_id, v_uid);

  begin
    select id into v_profile_id
      from public.ministry_member_profiles
      where ministry_id = p_ministry_id and user_id = v_uid;
  exception when others then
    v_profile_id := null;
    raise warning 'delete_my_ministry_data: profile lookup failed: %', sqlerrm;
  end;

  if v_profile_id is not null then
    begin
      delete from public.member_children where parent_profile_id = v_profile_id;
    exception when others then
      raise warning 'delete_my_ministry_data: member_children cleanup failed: %', sqlerrm;
    end;

    begin
      delete from public.member_emergency_contacts where ministry_member_profile_id = v_profile_id;
    exception when others then
      raise warning 'delete_my_ministry_data: member_emergency_contacts cleanup failed: %', sqlerrm;
    end;

    begin
      delete from public.member_ministry_interests where ministry_member_profile_id = v_profile_id;
    exception when others then
      raise warning 'delete_my_ministry_data: member_ministry_interests cleanup failed: %', sqlerrm;
    end;

    begin
      delete from public.member_communication_preferences where ministry_member_profile_id = v_profile_id;
    exception when others then
      raise warning 'delete_my_ministry_data: member_communication_preferences cleanup failed: %', sqlerrm;
    end;

    begin
      update public.member_consents set user_id = null
        where ministry_member_profile_id = v_profile_id and user_id = v_uid;
    exception when others then
      raise warning 'delete_my_ministry_data: member_consents anonymize failed: %', sqlerrm;
    end;

    begin
      delete from public.ministry_attendance where ministry_id = p_ministry_id and profile_id = v_profile_id;
    exception when others then
      raise warning 'delete_my_ministry_data: ministry_attendance cleanup failed: %', sqlerrm;
    end;
  end if;

  begin
    delete from public.ministry_member_profiles where ministry_id = p_ministry_id and user_id = v_uid;
  exception when others then
    raise warning 'delete_my_ministry_data: ministry_member_profiles delete failed: %', sqlerrm;
  end;

  begin
    delete from public.ministry_event_registrations
      where user_id = v_uid
        and event_id in (select id from public.ministry_events where ministry_id = p_ministry_id);
  exception when others then
    raise warning 'delete_my_ministry_data: ministry_event_registrations cleanup failed: %', sqlerrm;
  end;

  begin
    update public.ministry_testimonies
      set user_name = 'Former Member', user_email = null
      where ministry_id = p_ministry_id and user_id = v_uid;
  exception when others then
    raise warning 'delete_my_ministry_data: ministry_testimonies anonymize failed: %', sqlerrm;
  end;

  begin
    update public.ministry_prayer_requests set user_id = null
      where ministry_id = p_ministry_id and user_id = v_uid;
  exception when others then
    raise warning 'delete_my_ministry_data: ministry_prayer_requests anonymize failed: %', sqlerrm;
  end;

  begin
    update public.ministry_announcements set author_id = null
      where ministry_id = p_ministry_id and author_id = v_uid;
  exception when others then
    raise warning 'delete_my_ministry_data: ministry_announcements anonymize failed: %', sqlerrm;
  end;

  begin
    update public.member_registration_audit set user_id = null
      where ministry_id = p_ministry_id and user_id = v_uid;
  exception when others then
    raise warning 'delete_my_ministry_data: member_registration_audit anonymize failed: %', sqlerrm;
  end;

  -- Proof-of-deletion record — kept, NOT anonymized.
  begin
    insert into public.member_registration_audit (ministry_id, user_id, event_type)
      values (p_ministry_id, v_uid, 'data_deleted');
  exception when others then
    raise warning 'delete_my_ministry_data: completion audit insert failed: %', sqlerrm;
  end;
end;
$$;
-- Deliberately NOT granted to authenticated/anon — only reachable via
-- request_data_deletion() (schedules it) + run_scheduled_deletions()
-- (carries it out once due), both of which are security definer and
-- therefore have implicit execute on this as the owning role.

-- ─────────────────────────────────────────────────────────────────────────
-- Public RPC: request data deletion (replaces the old instant-delete entry
-- point). Schedules a 30-day grace period instead of deleting immediately.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.request_data_deletion(p_ministry_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_name text;
  v_slug text;
  v_scheduled timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select owner_id, name, slug into v_owner_id, v_name, v_slug from public.ministry_groups where id = p_ministry_id;
  if v_owner_id is null then
    raise exception 'Ministry not found';
  end if;
  if v_owner_id = v_uid then
    raise exception 'Ministry owners must transfer ownership before deleting their data';
  end if;

  -- Idempotent: already-pending request just returns its existing date
  -- instead of erroring or stacking a second one (blocked by the partial
  -- unique index anyway).
  select scheduled_for into v_scheduled
    from public.member_deletion_requests
    where ministry_id = p_ministry_id and user_id = v_uid and status = 'pending';
  if v_scheduled is not null then
    return v_scheduled;
  end if;

  v_scheduled := now() + interval '30 days';
  insert into public.member_deletion_requests (ministry_id, user_id, scheduled_for)
    values (p_ministry_id, v_uid, v_scheduled);

  begin
    insert into public.member_registration_audit (ministry_id, user_id, event_type)
      values (p_ministry_id, v_uid, 'data_deletion_requested');
  exception when others then
    raise warning 'request_data_deletion: audit insert failed: %', sqlerrm;
  end;

  perform public._notify_ministry_admins(
    p_ministry_id, 'member_data_deletion_requested', '🗑️ Data deletion requested',
    'A member has requested their data be deleted on ' || to_char(v_scheduled, 'FMMonth DD, YYYY') || '. They can still cancel this before then.',
    '/ministry-management'
  );

  begin
    insert into public.notifications (user_id, type, title, message, link, is_read)
      values (
        v_uid, 'member_data_deletion_scheduled', '🗑️ Deletion scheduled',
        'Your data at ' || coalesce(v_name, 'this ministry') || ' will be deleted on ' || to_char(v_scheduled, 'FMMonth DD, YYYY') || '. You can cancel anytime before then from your membership page.',
        case when v_slug is not null then '/my-membership/' || v_slug else null end,
        false
      );
  exception when others then
    raise warning 'request_data_deletion: requester notification failed: %', sqlerrm;
  end;

  return v_scheduled;
end;
$$;
grant execute on function public.request_data_deletion(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Public RPC: cancel a pending deletion request.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.cancel_data_deletion_request(p_ministry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_found uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.member_deletion_requests
    set status = 'cancelled', cancelled_at = now()
    where ministry_id = p_ministry_id and user_id = v_uid and status = 'pending'
    returning id into v_found;

  if v_found is null then
    raise exception 'No pending deletion request found';
  end if;

  begin
    insert into public.member_registration_audit (ministry_id, user_id, event_type)
      values (p_ministry_id, v_uid, 'data_deletion_cancelled');
  exception when others then
    raise warning 'cancel_data_deletion_request: audit insert failed: %', sqlerrm;
  end;

  perform public._notify_ministry_admins(
    p_ministry_id, 'member_data_deletion_cancelled', '↩️ Deletion request cancelled',
    'A member cancelled their pending data-deletion request.',
    '/ministry-management'
  );
end;
$$;
grant execute on function public.cancel_data_deletion_request(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Scheduled sweep: carries out any request whose grace period has elapsed.
-- Not granted to authenticated/anon — invoked only by the pg_cron job set
-- up via supabase/cron-setup-member-deletion-sweep.sql, which calls this
-- function directly (no edge function/service-role key needed, unlike the
-- other cron-setup-*.sql files in this repo, because the sweep logic here
-- is pure SQL).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.run_scheduled_deletions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id, ministry_id, user_id
      from public.member_deletion_requests
      where status = 'pending' and scheduled_for <= now()
  loop
    begin
      perform public.delete_my_ministry_data(r.ministry_id, r.user_id);
      update public.member_deletion_requests set status = 'completed', completed_at = now() where id = r.id;
      perform public._notify_ministry_admins(
        r.ministry_id, 'member_data_deleted', '🗑️ Data deletion completed',
        'A member''s data-deletion request has been carried out (their 30-day grace period elapsed).',
        '/ministry-management'
      );
    exception when others then
      raise warning 'run_scheduled_deletions: failed for request %: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;

commit;
