-- 0431: ministry admins can do what the dashboard lets them do.
--
-- Follow-up to 0430. A tester could not save Daily Devotional changes.
-- An audit of every write policy found the same pattern in several places:
-- the check only accepts the owner / leader_id user, or a member row with
-- is_leader = true, so a member with role 'admin' is blocked. Some helpers
-- also read ministry_members, an older table with 9 rows, while membership
-- lives in ministry_group_members (51 rows).
--
-- Fix: one rule, is_ministry_manager(), now also reads ministry_members,
-- and every helper and policy below accepts it. Nothing is narrowed.
-- No DROP statements (they hang the Supabase connector).

begin;

-- 1. Canonical check: owner, leader_id, or active admin/leader in either table.
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
    or exists (
      select 1 from public.ministry_members mm
      where mm.ministry_id = p_ministry_id
        and mm.user_id = p_uid
        and coalesce(mm.status, 'active') = 'active'
        and (mm.is_leader = true or mm.role in ('admin', 'leader'))
    )
  );
$$;

-- 2. Older helpers: keep what they allowed, and also accept managers.
create or replace function public.is_ministry_leader(p_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_ministry_manager(p_ministry_id, auth.uid());
$$;

create or replace function public.is_ministry_leader(p_ministry_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_ministry_manager(p_ministry_id, p_user_id);
$$;

create or replace function public.is_ministry_admin(p_ministry_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_ministry_manager(p_ministry_id, p_user_id);
$$;

create or replace function public.ga_is_ministry_admin(p_ministry_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_ministry_manager(p_ministry_id, p_uid);
$$;

-- 3. Policies that only accepted is_leader or owner/leader_id.
alter policy "Ministry leaders can manage devotionals" on public.ministry_devotionals
  using (public.is_ministry_manager(ministry_id, auth.uid()));

alter policy "ministry leader writes devotional settings" on public.ministry_devotional_settings
  using (
    public.is_ministry_manager(ministry_id, auth.uid())
    or exists (select 1 from public.user_profiles up
               where up.user_id = auth.uid() and up.role = any (array['admin','super_admin','moderator']))
  )
  with check (
    public.is_ministry_manager(ministry_id, auth.uid())
    or exists (select 1 from public.user_profiles up
               where up.user_id = auth.uid() and up.role = any (array['admin','super_admin','moderator']))
  );

alter policy "Leaders can insert announcements" on public.ministry_announcements
  with check (public.is_ministry_manager(ministry_id, auth.uid()));
alter policy "Leaders can update announcements" on public.ministry_announcements
  using (public.is_ministry_manager(ministry_id, auth.uid()))
  with check (public.is_ministry_manager(ministry_id, auth.uid()));
alter policy "Leaders can delete announcements" on public.ministry_announcements
  using (public.is_ministry_manager(ministry_id, auth.uid()));

alter policy birthday_settings_leader_all on public.ministry_birthday_settings
  using (public.is_ministry_manager(ministry_id, auth.uid()))
  with check (public.is_ministry_manager(ministry_id, auth.uid()));

alter policy leaders_can_create_broadcasts on public.broadcast_notifications
  with check (created_by = auth.uid() and public.is_ministry_manager(ministry_id, auth.uid()));

alter policy "Group leaders can create broadcasts" on public.ministry_group_broadcasts
  with check (public.is_ministry_manager(group_id, auth.uid()));
alter policy "Group leaders can update their broadcasts" on public.ministry_group_broadcasts
  using (sender_id = auth.uid() or public.is_ministry_manager(group_id, auth.uid()));
alter policy "Group leaders can delete their broadcasts" on public.ministry_group_broadcasts
  using (sender_id = auth.uid() or public.is_ministry_manager(group_id, auth.uid()));

commit;
