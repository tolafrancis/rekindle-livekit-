-- 0407_set_ministry_member_role.sql
-- =====================================================================
-- Fixes "new row violates row-level security policy for table
-- ministry_group_members" when a ministry admin saves a member's role in
-- the Manage role dialog.
--
-- ministry_group_members' admin policies (admins_view/insert/update_...)
-- check the GLOBAL user_profiles.role, so a ministry owner/leader/admin who
-- isn't a platform admin can neither read another member's row nor update
-- it. The client's lookup came back empty, it fell through to an INSERT for
-- someone else's user_id, and users_can_join_ministries rejected it.
-- (Flagged as a follow-up in 0155.)
--
-- Rather than widening table RLS (which would let a ministry admin set any
-- column on any row, including making themselves owner), role changes go
-- through this security definer function, which applies the same rules as
-- the UI (packages/auth/src/ministryPermissions.ts):
--   * caller is the ministry's owner/leader, or holds owner/leader/admin in
--     ministry_group_members;
--   * only leader/admin/content_editor/member can be assigned;
--   * the owner's role and the caller's own role can't be changed here.
-- It upserts ministry_group_members and mirrors to ministry_members
-- best-effort (that table's checks don't know content_editor).
-- =====================================================================

create or replace function public.set_ministry_member_role(
  p_ministry_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller    uuid := auth.uid();
  v_owner_id  uuid;
  v_leader_id uuid;
  v_is_leader boolean := p_role = 'leader';
  v_mm_role   text;
begin
  if v_caller is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if p_role not in ('leader', 'admin', 'content_editor', 'member') then
    raise exception 'That role can''t be assigned here.' using errcode = '22023';
  end if;

  select owner_id, leader_id into v_owner_id, v_leader_id
  from public.ministry_groups where id = p_ministry_id;
  if not found then
    raise exception 'Ministry not found.' using errcode = 'P0002';
  end if;

  if not (
    v_caller = coalesce(v_owner_id, '00000000-0000-0000-0000-000000000000'::uuid)
    or v_caller = coalesce(v_leader_id, '00000000-0000-0000-0000-000000000000'::uuid)
    or exists (
      select 1 from public.ministry_group_members
      where ministry_id = p_ministry_id and user_id = v_caller
        and (lower(role) in ('owner', 'leader', 'admin') or is_leader = true)
    )
  ) then
    raise exception 'You don''t have permission to change roles in this ministry.' using errcode = '42501';
  end if;

  if p_user_id = v_caller then
    raise exception 'You can''t change your own role.' using errcode = '42501';
  end if;
  if p_user_id = coalesce(v_owner_id, '00000000-0000-0000-0000-000000000000'::uuid) or exists (
    select 1 from public.ministry_group_members
    where ministry_id = p_ministry_id and user_id = p_user_id and lower(role) = 'owner'
  ) then
    raise exception 'The owner''s role can''t be changed.' using errcode = '42501';
  end if;

  update public.ministry_group_members
     set role = p_role, is_leader = v_is_leader, group_id = p_ministry_id
   where ministry_id = p_ministry_id and user_id = p_user_id;
  if not found then
    -- e.g. a QR registrant with an account being promoted.
    insert into public.ministry_group_members (ministry_id, group_id, user_id, role, is_leader, joined_at)
    values (p_ministry_id, p_ministry_id, p_user_id, p_role, v_is_leader, now());
  end if;

  -- Mirror to ministry_members (used by some checks, e.g. Gift Aid).
  v_mm_role := case when p_role in ('leader', 'admin') then p_role else 'member' end;
  begin
    update public.ministry_members
       set role = v_mm_role, member_role = v_mm_role, is_leader = v_is_leader
     where ministry_id = p_ministry_id and user_id = p_user_id;
    if not found then
      insert into public.ministry_members (ministry_id, user_id, role, member_role, is_leader, status)
      values (p_ministry_id, p_user_id, v_mm_role, v_mm_role, v_is_leader, 'active');
    end if;
  exception when others then
    raise warning 'ministry_members mirror skipped: %', sqlerrm;
  end;
end;
$$;

revoke all on function public.set_ministry_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_ministry_member_role(uuid, uuid, text) to authenticated;
