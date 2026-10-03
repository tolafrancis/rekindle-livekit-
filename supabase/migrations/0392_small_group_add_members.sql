-- 0392_small_group_add_members.sql
-- =====================================================================
-- Lets small-group leaders (and ministry admins/coordinators, i.e. anyone
-- is_small_group_leader() accepts) add existing ministry members straight
-- into a group, including invite-only groups that members can't join
-- themselves.
--
-- Both functions are security definer because ministry_group_members and
-- user_profiles RLS don't let a group leader read the ministry's member
-- list; each checks is_small_group_leader() itself first.
-- =====================================================================

-- Ministry members with their names and whether they're already in the group.
create or replace function public.small_group_ministry_roster(p_group_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  avatar_url text,
  group_status text,
  group_role text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_ministry_id uuid;
begin
  if not public.is_small_group_leader(p_group_id, auth.uid()) then
    raise exception 'Only this group''s leaders can view the ministry roster.';
  end if;
  select sg.ministry_id into v_ministry_id from public.small_groups sg where sg.id = p_group_id;

  return query
    select distinct on (mgm.user_id)
      mgm.user_id,
      coalesce(nullif(trim(up.full_name), ''), split_part(up.email, '@', 1), 'Member')::text,
      up.email::text,
      up.avatar_url::text,
      sgm.status::text,
      sgm.role::text
    from public.ministry_group_members mgm
    left join public.user_profiles up on up.user_id = mgm.user_id
    left join public.small_group_members sgm on sgm.group_id = p_group_id and sgm.user_id = mgm.user_id
    where mgm.ministry_id = v_ministry_id and mgm.user_id is not null
    order by mgm.user_id;
end;
$$;
grant execute on function public.small_group_ministry_roster(uuid) to authenticated;

-- Adds the given ministry members as active group members. Pending join
-- requests among them are approved; people already active are skipped;
-- user ids that aren't members of the group's ministry are ignored.
-- Returns how many people were added.
create or replace function public.add_small_group_members(p_group_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group     public.small_groups%rowtype;
  v_ids       uuid[];
  v_active    integer;
  v_added     integer := 0;
  v_uid       uuid;
  v_was_pending boolean;
begin
  if not public.is_small_group_leader(p_group_id, auth.uid()) then
    raise exception 'Only this group''s leaders can add members.';
  end if;
  select * into v_group from public.small_groups where id = p_group_id;

  -- Only real members of this ministry who aren't already active in the group.
  select coalesce(array_agg(distinct mgm.user_id), '{}') into v_ids
    from public.ministry_group_members mgm
    where mgm.ministry_id = v_group.ministry_id
      and mgm.user_id = any(p_user_ids)
      and not exists (
        select 1 from public.small_group_members s
        where s.group_id = p_group_id and s.user_id = mgm.user_id and s.status = 'active'
      );

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return 0;
  end if;

  if v_group.max_members is not null then
    select count(*) into v_active from public.small_group_members where group_id = p_group_id and status = 'active';
    if v_active + array_length(v_ids, 1) > v_group.max_members then
      raise exception 'This group only has room for % more member(s) (max %).',
        greatest(v_group.max_members - v_active, 0), v_group.max_members;
    end if;
  end if;

  foreach v_uid in array v_ids loop
    v_was_pending := exists (
      select 1 from public.small_group_members s
      where s.group_id = p_group_id and s.user_id = v_uid and s.status = 'pending'
    );
    insert into public.small_group_members (group_id, user_id, role, status, approved_by, approved_at, joined_at)
      values (p_group_id, v_uid, 'member', 'active', auth.uid(), now(), now())
      on conflict (group_id, user_id) do update
        set status = 'active', approved_by = excluded.approved_by,
            approved_at = excluded.approved_at, joined_at = excluded.joined_at;
    v_added := v_added + 1;

    -- A pending request flipping to active is already announced by
    -- trg_notify_on_small_group_approval (0332); only notify fresh adds.
    if not v_was_pending then
      begin
        insert into public.notifications (user_id, type, title, message, link, is_read)
        values (
          v_uid, 'small_group_member_added', '👥 You''ve been added to a group',
          'You were added to the small group "' || coalesce(v_group.name, 'Small group') || '".',
          '/ministry-small-group/' || p_group_id, false
        );
      exception when others then
        raise warning 'add_small_group_members: notification failed: %', sqlerrm;
      end;
    end if;
  end loop;

  return v_added;
end;
$$;
grant execute on function public.add_small_group_members(uuid, uuid[]) to authenticated;
