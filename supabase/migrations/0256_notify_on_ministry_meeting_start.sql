-- 0256_notify_on_ministry_meeting_start.sql
-- When a ministry meeting goes active (is_active false -> true),
-- notify ministry members via send-push-notification edge function.

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
        'Authorization', 'Bearer SERVICE_ROLE_KEY_HERE'
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_ministry_meeting_start on public.ministry_video_meetings;
create trigger trg_notify_on_ministry_meeting_start
  after update of is_active on public.ministry_video_meetings
  for each row
  execute function public.notify_on_ministry_meeting_start();
