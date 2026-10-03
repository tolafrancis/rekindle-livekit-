-- 0391_ministry_member_limit_notify.sql
-- =====================================================================
-- Warn ministry admins before the member cap starts turning people away.
--
-- enforce_ministry_member_limit (0297) rejects a join once the ministry is at
-- its plan's member_limit, and until now nobody heard about it beforehand.
-- This AFTER INSERT trigger notifies the ministry's admins (via
-- _notify_ministry_admins, 0334) exactly when the member count crosses 80% of
-- the cap, and again when it reaches the cap. Equality checks (not >=) keep it
-- to one notification per crossing. Same limit resolution as 0297: latest
-- subscription row, non-active/absent -> free-tier 25, -1 -> unlimited.
-- =====================================================================

create or replace function public.notify_ministry_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit   integer;
  v_status  text;
  v_current integer;
  v_warn_at integer;
begin
  if new.ministry_id is null then
    return new;
  end if;

  select member_limit, status into v_limit, v_status
    from public.ministry_subscriptions
    where ministry_id = new.ministry_id
    order by created_at desc
    limit 1;

  if v_status is distinct from 'active' or v_limit is null then
    v_limit := 25;
  end if;
  if v_limit <= 0 then
    return new; -- -1 = unlimited
  end if;

  select count(*) into v_current from public.ministry_group_members where ministry_id = new.ministry_id;
  v_warn_at := ceil(v_limit * 0.8)::integer;

  if v_current = v_limit then
    perform public._notify_ministry_admins(
      new.ministry_id, 'ministry_member_limit_reached', '🚫 Member limit reached',
      'Your ministry now has ' || v_current || ' of ' || v_limit || ' members. New members can''t join until you upgrade your plan.',
      '/settings/billing'
    );
  elsif v_current = v_warn_at then
    perform public._notify_ministry_admins(
      new.ministry_id, 'ministry_member_limit_warning', '📈 Approaching your member limit',
      'Your ministry has ' || v_current || ' of ' || v_limit || ' members (80%). Upgrade before new members are turned away.',
      '/settings/billing'
    );
  end if;

  return new;
exception when others then
  raise warning 'notify_ministry_member_limit failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_ministry_member_limit on public.ministry_group_members;
create trigger trg_notify_ministry_member_limit
  after insert on public.ministry_group_members
  for each row
  execute function public.notify_ministry_member_limit();
