-- 0430: ministry admins can save the ministry profile.
--
-- Bug: ministry_groups_update_v2 only let the owner, the leader_id user or a
-- platform admin update a ministry. A member with role 'admin' (or 'leader' /
-- is_leader) in ministry_group_members sees the Settings page in the app, but
-- their UPDATE matched zero rows. PostgREST returns no error for that, so the
-- app said "Settings saved", reloaded, and showed the old logo, banner and
-- description again (reported by Bali Bible Study, 2026-11-02).
--
-- Fix: let active ministry admins/leaders update, and add a guard so only
-- the owner (or a platform admin / service role) can change who owns or
-- leads the ministry.

begin;

create or replace function public.is_ministry_manager(p_ministry_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and (
    exists (
      select 1 from public.ministry_groups g
      where g.id = p_ministry_id and (g.owner_id = p_uid or g.leader_id = p_uid)
    )
    or exists (
      select 1 from public.ministry_group_members m
      where (m.group_id = p_ministry_id or m.ministry_id = p_ministry_id)
        and m.user_id = p_uid
        and coalesce(m.status, 'active') = 'active'
        and (m.is_leader = true or m.role in ('admin', 'leader'))
    )
  );
$$;

revoke all on function public.is_ministry_manager(uuid, uuid) from public;
grant execute on function public.is_ministry_manager(uuid, uuid) to authenticated, service_role;

alter policy ministry_groups_update_v2 on public.ministry_groups
  using (
    owner_id = auth.uid()
    or leader_id = auth.uid()
    or public.is_platform_admin(auth.uid())
    or public.is_ministry_manager(id, auth.uid())
  )
  with check (
    owner_id = auth.uid()
    or leader_id = auth.uid()
    or public.is_platform_admin(auth.uid())
    or public.is_ministry_manager(id, auth.uid())
  );

create or replace function public.ministry_groups_guard_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_platform_admin(auth.uid()) or old.owner_id = auth.uid() then
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
     or new.leader_id is distinct from old.leader_id then
    raise exception 'Only the ministry owner can change who owns or leads the ministry';
  end if;

  return new;
end;
$$;

create trigger trg_ministry_groups_guard_ownership
  before update on public.ministry_groups
  for each row execute function public.ministry_groups_guard_ownership();

commit;
