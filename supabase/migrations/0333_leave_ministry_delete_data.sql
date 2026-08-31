-- supabase/migrations/0333_leave_ministry_delete_data.sql
-- Self-service "Leave Ministry" and "Delete My Data" for members.
--
-- SCHEMA CAVEAT: a large share of the tables touched below
-- (ministry_member_profiles, member_consents, member_registration_audit,
-- ministry_prayer_requests, ministry_testimonies, ministry_announcements,
-- ministry_event_registrations, ministry_attendance, member_children,
-- member_emergency_contacts, member_ministry_interests,
-- member_communication_preferences, ministry_members, user_roles) are
-- DASHBOARD-MANAGED — there is no CREATE TABLE for them anywhere in this
-- repo's migrations. Every statement against one of those tables below is
-- wrapped in its own `begin ... exception when others then null; end;`
-- block so an unexpected column/constraint on any ONE table can't abort the
-- rest of the operation (mirrors the existing "best-effort mirror" pattern
-- already used elsewhere in this codebase, e.g.
-- MinistryMembersManager.tsx's role-change mirror to ministry_members).
-- RUN THIS AGAINST A REAL TEST MINISTRY/MEMBER FIRST — some blocks may need
-- adjusting once run against the live schema; watch Postgres logs for
-- WARNINGs the exception handlers below raise.
--
-- Idempotent (create or replace). Paste into the Supabase SQL Editor.

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- Internal helper: removes membership/access rows only. Called by both
-- leave_ministry() and delete_my_ministry_data() (deleting your data means
-- you can't sensibly stay "in" the ministry). Not granted to `authenticated`
-- directly — only reachable via the two public-facing RPCs below, which do
-- their own auth/ownership checks first.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public._do_leave_ministry(p_ministry_id uuid, p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Three parallel membership/role representations (confirmed real —
  -- see docs/investigations/3a-tenant-identity.md).
  begin
    delete from public.ministry_group_members where ministry_id = p_ministry_id and user_id = p_uid;
  exception when others then
    raise warning '_do_leave_ministry: ministry_group_members cleanup failed: %', sqlerrm;
  end;

  begin
    delete from public.ministry_members where ministry_id = p_ministry_id and user_id = p_uid;
  exception when others then
    raise warning '_do_leave_ministry: ministry_members cleanup failed: %', sqlerrm;
  end;

  begin
    delete from public.user_roles where ministry_id = p_ministry_id and user_id = p_uid;
  exception when others then
    raise warning '_do_leave_ministry: user_roles cleanup failed: %', sqlerrm;
  end;

  -- Small Groups under this ministry (0331_small_groups.sql — confirmed
  -- schema; the member_count recount triggers added there fire automatically
  -- on this delete).
  begin
    delete from public.small_group_members
      where user_id = p_uid
        and group_id in (select id from public.small_groups where ministry_id = p_ministry_id);
  exception when others then
    raise warning '_do_leave_ministry: small_group_members cleanup failed: %', sqlerrm;
  end;

  begin
    delete from public.small_group_coordinators where ministry_id = p_ministry_id and user_id = p_uid;
  exception when others then
    raise warning '_do_leave_ministry: small_group_coordinators cleanup failed: %', sqlerrm;
  end;

  -- Volunteer teams (0254_ministry_volunteer_teams.sql — confirmed schema).
  begin
    delete from public.ministry_volunteer_assignments where ministry_id = p_ministry_id and user_id = p_uid;
  exception when others then
    raise warning '_do_leave_ministry: ministry_volunteer_assignments cleanup failed: %', sqlerrm;
  end;

  -- Mark the profile as left rather than touching its data (Delete My Data
  -- is the separate, explicit action for that).
  begin
    update public.ministry_member_profiles
      set registration_status = 'left', updated_at = now()
      where ministry_id = p_ministry_id and user_id = p_uid;
  exception when others then
    raise warning '_do_leave_ministry: ministry_member_profiles status update failed: %', sqlerrm;
  end;

  -- Recompute member_count atomically server-side (the existing client-side
  -- blind-decrement in MinistryGroupsManager.tsx races under concurrent leaves).
  begin
    update public.ministry_groups
      set member_count = (select count(*) from public.ministry_group_members where ministry_id = p_ministry_id)
      where id = p_ministry_id;
  exception when others then
    raise warning '_do_leave_ministry: member_count recompute failed: %', sqlerrm;
  end;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Public RPC: Leave Ministry
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
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select owner_id into v_owner_id from public.ministry_groups where id = p_ministry_id;
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
end;
$$;
grant execute on function public.leave_ministry(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Public RPC: Delete My Data
-- ─────────────────────────────────────────────────────────────────────────
-- Deliberately does NOT touch ministry_donations, gift_aid_declarations,
-- donor_gift_aid_status, gift_aid_claims, or gift_aid_audit_log — UK tax
-- retention obligations apply to these and no retention period is
-- documented anywhere in this repo, so this migration can't respond with
-- legal certainty about what's safe to alter. Routed to manual support
-- instead (same as the Privacy Policy already promises today).

create or replace function public.delete_my_ministry_data(p_ministry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
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

  -- Hard-delete: profile + its FK'd child tables (MemberMinistryProfile.tsx).
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

    -- Anonymize (append-only evidence tables — keep the event trail, drop
    -- the identifying link). Scoped by profile_id: each ministry has its
    -- own profile, so this never touches consents/audit rows from a
    -- different ministry.
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

  -- Anonymize authored content (author becomes untraceable, content stays
  -- for thread/community continuity — per product decision).
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

  -- small_group_posts.author_id is `not null references auth.users(id)`
  -- (0331_small_groups.sql) — deliberately left untouched, can't be nulled
  -- without a schema change. No active name-leak today: SmallGroupDetailManager.tsx
  -- / SmallGroupPage.tsx render author_id as a raw id, not a resolved name.

  begin
    update public.member_registration_audit set user_id = null
      where ministry_id = p_ministry_id and user_id = v_uid;
  exception when others then
    raise warning 'delete_my_ministry_data: member_registration_audit anonymize failed: %', sqlerrm;
  end;

  -- Proof-of-deletion record — kept, NOT anonymized (unlike the historical
  -- rows just anonymized above, this one is the compliance evidence that
  -- the deletion actually happened).
  begin
    insert into public.member_registration_audit (ministry_id, user_id, event_type)
      values (p_ministry_id, v_uid, 'data_deleted');
  exception when others then
    raise warning 'delete_my_ministry_data: completion audit insert failed: %', sqlerrm;
  end;
end;
$$;
grant execute on function public.delete_my_ministry_data(uuid) to authenticated;

commit;
