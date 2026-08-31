-- supabase/migrations/0332_small_groups_notifications.sql
-- In-app notifications (public.notifications table only — no push edge
-- function wiring in this pass, see plan) for the Small Groups feature:
--   1. New pending join request -> notify the group's leaders/coordinators.
--   2. Join request approved    -> notify the requester.
--   3. New meeting scheduled    -> notify active group members.
--
-- Mirrors the confirmed public.notifications insert shape from
-- 0159_notify_followers_on_channel_live.sql. Idempotent.

begin;

-- 1. New pending join request ----------------------------------------------

create or replace function public.notify_on_small_group_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
  v_requester_name text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select name into v_group_name from public.small_groups where id = new.group_id;
  select coalesce(full_name, email) into v_requester_name from public.user_profiles where user_id = new.user_id;

  insert into public.notifications (user_id, type, title, message, link, is_read)
  select
    leader.user_id,
    'small_group_join_request',
    '🙋 New join request',
    coalesce(v_requester_name, 'Someone') || ' wants to join "' || coalesce(v_group_name, 'your small group') || '"',
    '/ministry-small-group/' || new.group_id,
    false
  from public.small_group_members leader
  where leader.group_id = new.group_id
    and leader.status = 'active'
    and leader.role in ('leader', 'assistant_leader')
  union
  select
    coord.user_id,
    'small_group_join_request',
    '🙋 New join request',
    coalesce(v_requester_name, 'Someone') || ' wants to join "' || coalesce(v_group_name, 'a small group') || '"',
    '/ministry-small-group/' || new.group_id,
    false
  from public.small_groups sg
  join public.small_group_coordinators coord on coord.ministry_id = sg.ministry_id
  where sg.id = new.group_id;

  return new;
exception when others then
  -- Never let a notification failure block the join-request write itself.
  raise warning 'notify_on_small_group_join_request failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_small_group_join_request on public.small_group_members;
create trigger trg_notify_on_small_group_join_request
  after insert on public.small_group_members
  for each row execute function public.notify_on_small_group_join_request();

-- 2. Join request approved ---------------------------------------------------

create or replace function public.notify_on_small_group_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
begin
  if new.status = 'active' and old.status = 'pending' then
    select name into v_group_name from public.small_groups where id = new.group_id;
    insert into public.notifications (user_id, type, title, message, link, is_read)
    values (
      new.user_id,
      'small_group_join_approved',
      '✅ You''re in!',
      'Your request to join "' || coalesce(v_group_name, 'the small group') || '" was approved.',
      '/ministry-small-group/' || new.group_id,
      false
    );
  end if;
  return new;
exception when others then
  raise warning 'notify_on_small_group_approval failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_small_group_approval on public.small_group_members;
create trigger trg_notify_on_small_group_approval
  after update of status on public.small_group_members
  for each row execute function public.notify_on_small_group_approval();

-- 3. New meeting scheduled ---------------------------------------------------

create or replace function public.notify_on_small_group_meeting_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
begin
  select name into v_group_name from public.small_groups where id = new.group_id;

  insert into public.notifications (user_id, type, title, message, link, is_read)
  select
    m.user_id,
    'small_group_meeting',
    '📅 New meeting: ' || coalesce(v_group_name, 'Small Group'),
    new.title || ' on ' || to_char(new.meeting_date, 'FMMonth DD') ||
      case when new.start_time is not null then ' at ' || to_char(new.start_time, 'HH12:MI AM') else '' end,
    '/ministry-small-group/' || new.group_id,
    false
  from public.small_group_members m
  where m.group_id = new.group_id and m.status = 'active' and m.user_id <> new.created_by;

  return new;
exception when others then
  raise warning 'notify_on_small_group_meeting_created failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_small_group_meeting_created on public.small_group_meetings;
create trigger trg_notify_on_small_group_meeting_created
  after insert on public.small_group_meetings
  for each row execute function public.notify_on_small_group_meeting_created();

commit;
