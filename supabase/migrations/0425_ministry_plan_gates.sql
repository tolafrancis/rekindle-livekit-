-- 0425_ministry_plan_gates.sql
-- =====================================================================
-- Server-side plan checks for features the app only hid in the UI.
--
-- ministry_has_cap(ministry, cap) mirrors capsFromSub() in
-- packages/auth/src/ministryEntitlements.ts for the caps checked here:
-- only the latest ministry_subscriptions row counts, only when 'active';
-- a boolean in its `features` jsonb overrides the plan default.
--   webinars           – video_minutes_limit <> 0 (every paid plan)
--   broadcastMessaging – broadcast_limit <> 0
--   recordMeetings     – Growth Partner and up (AI note taker)
-- Keep the two in step if a default changes.
--
-- Used by:
--   * trg_ministry_webinars_plan_gate – refuses creating a webinar;
--   * trg_ministry_meetings_recording_gate – turns enable_recording off;
--   * send-push-notification – refuses group/leader broadcasts.
-- Platform admins, and server-side writes (no auth.uid()), are not gated.
-- =====================================================================

create or replace function public.ministry_has_cap(p_ministry_id uuid, p_cap text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  sub public.ministry_subscriptions%rowtype;
  v_rank int;
begin
  if p_ministry_id is null then
    return false;
  end if;

  select * into sub
    from public.ministry_subscriptions
   where ministry_id = p_ministry_id
   order by created_at desc
   limit 1;

  if not found or sub.status is distinct from 'active' then
    return false;
  end if;

  if jsonb_typeof(sub.features -> p_cap) = 'boolean' then
    return (sub.features ->> p_cap)::boolean;
  end if;

  v_rank := case sub.plan_type
    when 'starter' then 1
    when 'growth_partner' then 2
    when 'ministry_partner' then 3
    when 'ministry_plus' then 4
    else 0
  end;

  return case p_cap
    when 'webinars' then coalesce(sub.video_minutes_limit, 0) <> 0
    when 'liveChannels' then coalesce(sub.video_minutes_limit, 0) <> 0
    when 'broadcastMessaging' then coalesce(sub.broadcast_limit, 0) <> 0
    when 'recordMeetings' then v_rank >= 2
    else false
  end;
end;
$$;

revoke all on function public.ministry_has_cap(uuid, text) from public, anon;
grant execute on function public.ministry_has_cap(uuid, text) to authenticated, service_role;

-- Webinars: paid plans only.
create or replace function public.ministry_webinars_plan_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.is_platform_admin(auth.uid()) then
    return new;
  end if;
  if not public.ministry_has_cap(new.ministry_id, 'webinars') then
    raise exception using
      errcode = 'P0001',
      message = 'PLAN_REQUIRED: webinars are included on paid plans — upgrade this ministry to create one';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ministry_webinars_plan_gate on public.ministry_webinars;
create trigger trg_ministry_webinars_plan_gate
  before insert on public.ministry_webinars
  for each row execute function public.ministry_webinars_plan_gate();

-- Meeting recording: Growth Partner and up. Turned off rather than
-- refused, so saving a meeting on a lower plan still works.
create or replace function public.ministry_meetings_recording_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.enable_recording is true
     and auth.uid() is not null
     and not public.is_platform_admin(auth.uid())
     and not public.ministry_has_cap(new.ministry_id, 'recordMeetings') then
    new.enable_recording := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ministry_meetings_recording_gate on public.ministry_video_meetings;
create trigger trg_ministry_meetings_recording_gate
  before insert or update of enable_recording on public.ministry_video_meetings
  for each row execute function public.ministry_meetings_recording_gate();
