-- 0255_notify_on_meeting_start.sql
-- When a live channel meeting goes active (is_active false -> true),
-- notify ministry members or channel followers via send-push-notification
-- edge function using pg_net (same pattern as other notification triggers).

begin;

create or replace function public.notify_on_meeting_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_role_key text;
  v_project_url text;
  v_payload jsonb;
  v_ministry_id text;
begin
  -- Only fire when is_active flips from false to true
  if new.is_active = true and coalesce(old.is_active, false) = false then
    
    -- Get the channel's ministry_id if it exists
    select lc.ministry_id::text into v_ministry_id
    from live_channels lc
    where lc.id = new.channel_id;

    v_project_url := current_setting('app.supabase_url', true);
    v_service_role_key := current_setting('app.service_role_key', true);

    -- Fallbacks based on project configuration checks
    if v_project_url is null or v_project_url = '' then
      v_project_url := 'https://vpnpembyqbbaaiynfvli.supabase.co';
    end if;

    if v_service_role_key is null or v_service_role_key = '' then
      begin
        select decrypted_secret into v_service_role_key
        from vault.decrypted_secrets
        where name = 'service_role_key'
        limit 1;
      exception when others then
        v_service_role_key := null;
      end;
    end if;

    -- If we still don't have a service role key, we cannot authenticate the request.
    if v_service_role_key is not null and v_service_role_key <> '' then
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

      -- Fire and forget via pg_net
      perform net.http_post(
        url := v_project_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := v_payload::text
      );
    end if;

  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_meeting_start on public.live_channel_video_meetings;
create trigger trg_notify_on_meeting_start
  after update of is_active on public.live_channel_video_meetings
  for each row
  execute function public.notify_on_meeting_start();

commit;
