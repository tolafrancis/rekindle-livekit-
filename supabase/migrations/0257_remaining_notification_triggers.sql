-- 0257_remaining_notification_triggers.sql
-- Database triggers to send push notifications via pg_net and send-push-notification
-- edge function for remaining notification events in ReKindle.

begin;

-- =============================================================================
-- 1. CHANNEL BROADCASTS (AFTER INSERT)
-- =============================================================================
-- Note: channel_broadcasts has 'title' but no 'message' or 'content' column.
-- Uses new.title for body.

create or replace function public.notify_on_channel_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'notificationType', 'group_broadcast',
    'title', '📢 New Broadcast',
    'body', new.title,
    'link', '/live-channels',
    'targetAudience', 'channel_followers',
    'channelId', new.channel_id::text,
    'push', true,
    'inApp', true
  );

  perform net.http_post(
    url := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/send-push-notification',
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_KEY_HERE'
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_on_channel_broadcast on public.channel_broadcasts;
create trigger trg_notify_on_channel_broadcast
  after insert on public.channel_broadcasts
  for each row
  execute function public.notify_on_channel_broadcast();


-- =============================================================================
-- 2. MINISTRY ANNOUNCEMENTS (AFTER INSERT)
-- =============================================================================
-- Note: ministry_announcements has 'title' and 'content' columns.

create or replace function public.notify_on_ministry_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'notificationType', 'group_broadcast',
    'title', '📣 New Announcement',
    'body', coalesce(new.content, new.title),
    'link', '/ministry/' || new.ministry_id,
    'targetAudience', 'ministry_members',
    'ministryId', new.ministry_id::text,
    'push', true,
    'inApp', true
  );

  perform net.http_post(
    url := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/send-push-notification',
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_KEY_HERE'
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_on_ministry_announcement on public.ministry_announcements;
create trigger trg_notify_on_ministry_announcement
  after insert on public.ministry_announcements
  for each row
  execute function public.notify_on_ministry_announcement();


-- =============================================================================
-- 3. COMMUNITY QUESTIONS (AFTER INSERT)
-- =============================================================================
-- Note: community_questions has 'title', 'content', and nullable 'ministry_id' columns.

create or replace function public.notify_on_community_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'notificationType', 'community_question',
    'title', '❓ New Question',
    'body', coalesce(new.title, new.content),
    'link', '/community',
    'targetAudience', case 
      when new.ministry_id is not null then 'ministry_members'
      else 'channel_followers'
    end,
    'ministryId', new.ministry_id::text,
    'push', true,
    'inApp', true
  );

  perform net.http_post(
    url := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/send-push-notification',
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_KEY_HERE'
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_on_community_question on public.community_questions;
create trigger trg_notify_on_community_question
  after insert on public.community_questions
  for each row
  execute function public.notify_on_community_question();


-- =============================================================================
-- 4. COMMUNITY REVELATIONS (AFTER INSERT)
-- =============================================================================
-- Note: community_revelations has 'title', 'content', and nullable 'ministry_id' columns.

create or replace function public.notify_on_community_revelation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'notificationType', 'community_revelation',
    'title', '✨ New Revelation',
    'body', coalesce(new.title, new.content),
    'link', '/community',
    'targetAudience', case 
      when new.ministry_id is not null then 'ministry_members'
      else 'channel_followers'
    end,
    'ministryId', new.ministry_id::text,
    'push', true,
    'inApp', true
  );

  perform net.http_post(
    url := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/send-push-notification',
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_KEY_HERE'
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_on_community_revelation on public.community_revelations;
create trigger trg_notify_on_community_revelation
  after insert on public.community_revelations
  for each row
  execute function public.notify_on_community_revelation();


-- =============================================================================
-- 5. GROUP MESSAGES (AFTER INSERT)
-- =============================================================================
-- Note: group_messages has 'content' and 'group_id' (which maps to ministryId/groupId).

create or replace function public.notify_on_group_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'notificationType', 'group_broadcast',
    'title', '💬 New Group Message',
    'body', substring(new.content from 1 for 100),
    'link', '/ministry',
    'targetAudience', 'all',
    'ministryId', new.group_id::text,
    'push', true,
    'inApp', true
  );

  perform net.http_post(
    url := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/send-push-notification',
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_KEY_HERE'
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_on_group_message on public.group_messages;
create trigger trg_notify_on_group_message
  after insert on public.group_messages
  for each row
  execute function public.notify_on_group_message();


-- =============================================================================
-- 6. MINISTRY PRAYER REQUESTS (AFTER INSERT)
-- =============================================================================
-- Note: ministry_prayer_requests has 'title', 'content', and 'ministry_id' columns.

create or replace function public.notify_on_ministry_prayer_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'notificationType', 'group_broadcast',
    'title', '🙏 New Prayer Request',
    'body', new.title,
    'link', '/prayer',
    'targetAudience', 'ministry_members',
    'ministryId', new.ministry_id::text,
    'push', true,
    'inApp', true
  );

  perform net.http_post(
    url := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/send-push-notification',
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_KEY_HERE'
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_on_ministry_prayer_request on public.ministry_prayer_requests;
create trigger trg_notify_on_ministry_prayer_request
  after insert on public.ministry_prayer_requests
  for each row
  execute function public.notify_on_ministry_prayer_request();


-- =============================================================================
-- 7. COUNSELLING SESSIONS (AFTER INSERT OR UPDATE)
-- =============================================================================
-- Note: counselling_sessions has 'status' and 'user_id' (client/booker).
-- Excludes notifying the user who initiated the transaction (self-booking on INSERT).

create or replace function public.notify_on_counselling_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  -- Exclude notifying the user who initiated the transaction (self-booking on INSERT)
  if new.user_id = coalesce(auth.uid()::text, '') then
    return new;
  end if;

  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    v_payload := jsonb_build_object(
      'notificationType', 'prayer_challenge_reminder',
      'title', '💙 Counselling Session',
      'body', 'Your session has been ' || new.status,
      'link', '/bookings',
      'targetAudience', 'specific_user',
      'userId', new.user_id::text,
      'push', true,
      'inApp', true
    );

    perform net.http_post(
      url := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/send-push-notification',
      body := v_payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer SERVICE_ROLE_KEY_HERE'
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_counselling_session on public.counselling_sessions;
create trigger trg_notify_on_counselling_session
  after insert or update on public.counselling_sessions
  for each row
  execute function public.notify_on_counselling_session();

commit;
