-- supabase/migrations/0405_small_group_chat_notifications.sql
-- =====================================================================
-- Notifications for Small Group chat (0404).
--
-- New messages do NOT create in-app notification rows (that would flood
-- the bell); the Messages inbox shows unread counts instead. They send a
-- push, at most one per group every 5 minutes per person, to members whose
-- group setting is "All messages". Replies notify the person replied to
-- (in-app + push) unless they muted the group. Invitations, removals and
-- role changes create in-app notifications; invitations also push.
--
-- Push goes through the existing send-push-notification edge function via
-- private.call_edge_fn (0402), one call per recipient, and respects the
-- account-wide notif_push / notif_group_messages settings. Failures never
-- block the message or membership write.
--
-- Also points the existing small-group notification links (0332, 0392) at
-- routes that exist: /messages/<group> for "you're in" and /small-group/<id>
-- for leaders' join requests (the old /ministry-small-group/ path matched
-- no route).
--
-- Idempotent. Paste into the Supabase SQL Editor after 0404.
-- =====================================================================

begin;

-- Push to one person, honouring their account-wide settings.
create or replace function public.small_group_chat_push(
  p_user_id uuid, p_title text, p_body text, p_link text, p_type text default 'small_group_chat')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.user_profiles
     where user_id = p_user_id
       and (notif_push = false or notif_group_messages = false or is_banned = true)
  ) then
    return;
  end if;
  perform private.call_edge_fn('send-push-notification', jsonb_build_object(
    'notificationType', p_type,
    'targetAudience', 'specific_user',
    'userId', p_user_id,
    'title', left(p_title, 120),
    'body', left(p_body, 180),
    'link', p_link,
    'push', true,
    'inApp', false
  ));
exception when others then
  raise warning 'small_group_chat_push failed: %', sqlerrm;
end;
$$;
revoke all on function public.small_group_chat_push(uuid, text, text, text, text) from public, anon, authenticated;

-- New message ------------------------------------------------------------

create or replace function public.notify_on_small_group_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
  v_sender_name text;
  v_preview text;
  v_link text := '/messages/' || new.group_id;
  v_reply_to_sender uuid;
  r record;
begin
  if new.message_type = 'system' or new.deleted_at is not null then
    return null;
  end if;

  select name into v_group_name from public.small_groups where id = new.group_id;
  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(full_name), ''))
    into v_sender_name from public.user_profiles where user_id = new.sender_id;
  v_sender_name := coalesce(v_sender_name, 'Someone');
  v_group_name := coalesce(v_group_name, 'your group');
  v_preview := case new.message_type
    when 'image' then 'sent a photo'
    when 'prayer_request' then 'shared a prayer request'
    when 'scripture' then 'shared ' || coalesce(new.scripture_ref, 'a Scripture')
    else left(new.body, 120)
  end;

  if new.reply_to_id is not null then
    select sender_id into v_reply_to_sender from public.small_group_messages where id = new.reply_to_id;
  end if;

  -- 1. The person replied to.
  if v_reply_to_sender is not null and v_reply_to_sender is distinct from new.sender_id
     and exists (
       select 1 from public.small_group_members
        where group_id = new.group_id and user_id = v_reply_to_sender
          and status = 'active' and notify_level <> 'muted'
     ) then
    insert into public.notifications (user_id, type, title, message, link, is_read, sender_name)
    values (v_reply_to_sender, 'small_group_chat_reply',
            left(v_sender_name || ' replied in ' || v_group_name, 120),
            left(v_preview, 200), v_link, false, v_sender_name);
    perform public.small_group_chat_push(v_reply_to_sender, v_group_name,
                                         v_sender_name || ' replied: ' || v_preview, v_link);
    update public.small_group_members set last_push_at = now()
     where group_id = new.group_id and user_id = v_reply_to_sender;
  end if;

  -- 2. Everyone else on "All messages", throttled per group.
  for r in
    select m.user_id
      from public.small_group_members m
     where m.group_id = new.group_id
       and m.status = 'active'
       and m.notify_level = 'all'
       and m.user_id is distinct from new.sender_id
       and m.user_id is distinct from v_reply_to_sender
       and (m.last_push_at is null or m.last_push_at < now() - interval '5 minutes')
       and (m.last_read_at is null or m.last_read_at < now() - interval '1 minute')
     limit 500
  loop
    perform public.small_group_chat_push(r.user_id, v_group_name, v_sender_name || ': ' || v_preview, v_link);
    update public.small_group_members set last_push_at = now()
     where group_id = new.group_id and user_id = r.user_id;
  end loop;

  return null;
exception when others then
  raise warning 'notify_on_small_group_message failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists trg_notify_on_small_group_message on public.small_group_messages;
create trigger trg_notify_on_small_group_message
  after insert on public.small_group_messages
  for each row execute function public.notify_on_small_group_message();

-- Membership changes -----------------------------------------------------

create or replace function public.notify_on_small_group_membership_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
  v_inviter text;
  v_role_label text;
begin
  select name into v_group_name from public.small_groups where id = new.group_id;
  v_group_name := coalesce(v_group_name, 'a small group');

  if new.status = 'invited' and (tg_op = 'INSERT' or old.status is distinct from 'invited') then
    select coalesce(nullif(btrim(display_name), ''), nullif(btrim(full_name), ''))
      into v_inviter from public.user_profiles where user_id = new.invited_by;
    insert into public.notifications (user_id, type, title, message, link, is_read, sender_name)
    values (new.user_id, 'small_group_invite', 'Group invitation',
            coalesce(v_inviter, 'Someone') || ' invited you to join "' || v_group_name || '".',
            '/messages/' || new.group_id, false, v_inviter);
    perform public.small_group_chat_push(new.user_id, 'Group invitation',
            coalesce(v_inviter, 'Someone') || ' invited you to join "' || v_group_name || '"',
            '/messages/' || new.group_id, 'small_group_invite');
    return null;
  end if;

  if tg_op = 'UPDATE' and new.status = 'removed' and old.status = 'active' then
    insert into public.notifications (user_id, type, title, message, link, is_read)
    values (new.user_id, 'small_group_removed', 'Removed from group',
            'You were removed from "' || v_group_name || '" by a group leader.', '/messages', false);
    return null;
  end if;

  if tg_op = 'UPDATE' and new.status = 'active' and old.status = 'active' and new.role is distinct from old.role then
    v_role_label := case new.role when 'leader' then 'a leader' when 'assistant_leader' then 'an assistant leader' else 'a member' end;
    insert into public.notifications (user_id, type, title, message, link, is_read)
    values (new.user_id, 'small_group_role_changed', 'Your group role changed',
            'You are now ' || v_role_label || ' of "' || v_group_name || '".',
            '/messages/' || new.group_id, false);
  end if;

  return null;
exception when others then
  raise warning 'notify_on_small_group_membership_change failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists trg_notify_on_small_group_membership_change on public.small_group_members;
create trigger trg_notify_on_small_group_membership_change
  after insert or update of status, role on public.small_group_members
  for each row execute function public.notify_on_small_group_membership_change();

-- Existing small-group notifications: working links ------------------------

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
    '/small-group/' || new.group_id,
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
    '/small-group/' || new.group_id,
    false
  from public.small_groups sg
  join public.small_group_coordinators coord on coord.ministry_id = sg.ministry_id
  where sg.id = new.group_id;

  return new;
exception when others then
  raise warning 'notify_on_small_group_join_request failed: %', sqlerrm;
  return new;
end;
$$;

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
      '/messages/' || new.group_id,
      false
    );
    perform public.small_group_chat_push(new.user_id, 'You''re in!',
      'Your request to join "' || coalesce(v_group_name, 'the small group') || '" was approved.',
      '/messages/' || new.group_id, 'small_group_join_approved');
  end if;
  return new;
exception when others then
  raise warning 'notify_on_small_group_approval failed: %', sqlerrm;
  return new;
end;
$$;

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
    '/small-group/' || new.group_id,
    false
  from public.small_group_members m
  where m.group_id = new.group_id and m.status = 'active' and m.user_id <> new.created_by;

  return new;
exception when others then
  raise warning 'notify_on_small_group_meeting_created failed: %', sqlerrm;
  return new;
end;
$$;

-- add_small_group_members (0392), unchanged except its notification link.
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
          '/messages/' || p_group_id, false
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

update public.notifications
   set link = replace(link, '/ministry-small-group/', '/small-group/')
 where link like '/ministry-small-group/%';

commit;
