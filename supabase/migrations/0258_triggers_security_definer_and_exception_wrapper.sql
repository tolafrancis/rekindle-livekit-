-- 0258_triggers_security_definer_and_exception_wrapper.sql
-- =============================================================================
-- Migration URGENT FIX: Restore original triggers exactly with Bearer JWT and
-- body := v_payload (jsonb) parameters, resolving the uuid comparison in counselling trigger.
-- =============================================================================

begin;

-- Drop the helper function if it was created previously
drop function if exists public.get_cron_secret();

-- =============================================================================
-- 1. notify_on_meeting_start
-- =============================================================================
create or replace function public.notify_on_meeting_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_ministry_id text;
begin
  -- Only fire when is_active flips from false to true
  if new.is_active = true and coalesce(old.is_active, false) = false then

    -- Get the channel's ministry_id if it exists
    select lc.ministry_id::text into v_ministry_id
    from live_channels lc
    where lc.id = new.channel_id;

    v_payload := jsonb_build_object(
      'notificationType', 'meeting_started',
      'title', '👥 Meeting Started',
      'body', '"' || new.title || '" has started. Tap to join now!',
      'link', '/channel/' || new.channel_id || '/meeting/' || new.id,
      'senderName', 'ReKindle',
      'push', true,
      'inApp', true,
      'targetAudience', case
        when v_ministry_id is not null then 'ministry_members'
        else 'channel_followers'
      end,
      'ministryId', v_ministry_id,
      'channelId', new.channel_id::text
    );

    perform net.http_post(
      url := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/send-push-notification',
      body := v_payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkwNDU1NiwiZXhwIjoyMDgwNDgwNTU2fQ.IqBF2BDQIF22QAP2Q-aABL3qC4fDj0wGPF2ido3b2HI'
      )
    );
  end if;
  return new;
end;
$$;


-- =============================================================================
-- 2. notify_on_ministry_meeting_start
-- =============================================================================
create or replace function public.notify_on_ministry_meeting_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  if new.is_active = true and coalesce(old.is_active, false) = false then
    v_payload := jsonb_build_object(
      'notificationType', 'meeting_started',
      'title', '👥 Meeting Started',
      'body', '"' || new.title || '" has started. Tap to join now!',
      'link', '/ministry/' || new.ministry_id || '/meeting/' || new.id,
      'senderName', 'ReKindle',
      'push', true,
      'inApp', true,
      'targetAudience', 'ministry_members',
      'ministryId', new.ministry_id::text
    );
    perform net.http_post(
      url := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/send-push-notification',
      body := v_payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkwNDU1NiwiZXhwIjoyMDgwNDgwNTU2fQ.IqBF2BDQIF22QAP2Q-aABL3qC4fDj0wGPF2ido3b2HI'
      )
    );
  end if;
  return new;
end;
$$;


-- =============================================================================
-- 3. notify_on_channel_broadcast
-- =============================================================================
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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkwNDU1NiwiZXhwIjoyMDgwNDgwNTU2fQ.IqBF2BDQIF22QAP2Q-aABL3qC4fDj0wGPF2ido3b2HI'
    )
  );

  return new;
end;
$$;


-- =============================================================================
-- 4. notify_on_ministry_announcement
-- =============================================================================
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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkwNDU1NiwiZXhwIjoyMDgwNDgwNTU2fQ.IqBF2BDQIF22QAP2Q-aABL3qC4fDj0wGPF2ido3b2HI'
    )
  );

  return new;
end;
$$;


-- =============================================================================
-- 5. notify_on_community_question
-- =============================================================================
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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkwNDU1NiwiZXhwIjoyMDgwNDgwNTU2fQ.IqBF2BDQIF22QAP2Q-aABL3qC4fDj0wGPF2ido3b2HI'
    )
  );

  return new;
end;
$$;


-- =============================================================================
-- 6. notify_on_community_revelation
-- =============================================================================
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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkwNDU1NiwiZXhwIjoyMDgwNDgwNTU2fQ.IqBF2BDQIF22QAP2Q-aABL3qC4fDj0wGPF2ido3b2HI'
    )
  );

  return new;
end;
$$;


-- =============================================================================
-- 7. notify_on_group_message
-- =============================================================================
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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkwNDU1NiwiZXhwIjoyMDgwNDgwNTU2fQ.IqBF2BDQIF22QAP2Q-aABL3qC4fDj0wGPF2ido3b2HI'
    )
  );

  return new;
end;
$$;


-- =============================================================================
-- 8. notify_on_ministry_prayer_request
-- =============================================================================
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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkwNDU1NiwiZXhwIjoyMDgwNDgwNTU2fQ.IqBF2BDQIF22QAP2Q-aABL3qC4fDj0wGPF2ido3b2HI'
    )
  );

  return new;
end;
$$;


-- =============================================================================
-- 9. notify_on_counselling_session
-- =============================================================================
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
  if new.user_id::text = coalesce(auth.uid()::text, '') then
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
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkwNDU1NiwiZXhwIjoyMDgwNDgwNTU2fQ.IqBF2BDQIF22QAP2Q-aABL3qC4fDj0wGPF2ido3b2HI'
      )
    );
  end if;

  return new;
end;
$$;

commit;
