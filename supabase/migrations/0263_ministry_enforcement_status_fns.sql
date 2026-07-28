-- 0263_ministry_enforcement_status_fns.sql
-- =====================================================================
-- Read-only status functions backing Phase 4 upload-time enforcement:
--   get_ministry_storage_status  — bytes used vs. effective limit (base
--     plan storage_gb + any active storage_pack ministry_addons). is_full
--     is only ever true for a ministry WITH an active storage_pack — a
--     ministry on the bundled/free allotment is never capacity-blocked,
--     it's time-boxed instead (ministry-retention-sweep, Phase 3).
--   get_ministry_hours_status    — meeting/broadcast minutes used this
--     month vs. the tier's included hours (null limit = unlimited).
--     Reads period_start the same way increment_ministry_usage (0260)
--     writes it — a stale prior-month row reads as 0 used, not exhausted,
--     so a ministry that maxed last month isn't blocked before their
--     first session of a new month.
--
-- service_role only, same reasoning as increment_ministry_usage: these
-- back enforcement decisions in edge functions, not a client-facing gauge
-- (that's a later admin-visibility phase).
-- =====================================================================

begin;

create or replace function public.get_ministry_storage_status(p_ministry_id uuid)
returns table (
  bytes_used bigint,
  effective_limit_bytes bigint,
  has_storage_addon boolean,
  is_full boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bytes_used bigint;
  v_base_mb integer;
  v_addon_gb bigint;
  v_has_addon boolean;
begin
  select coalesce(u.bytes_used, 0) into v_bytes_used
  from public.ministry_usage_metrics u where u.ministry_id = p_ministry_id;
  v_bytes_used := coalesce(v_bytes_used, 0);

  select sub.storage_limit_mb into v_base_mb
  from public.ministry_subscriptions sub
  where sub.ministry_id = p_ministry_id and sub.status = 'active'
  order by sub.created_at desc limit 1;
  v_base_mb := coalesce(v_base_mb, 0);

  select coalesce(sum(a.unit_gb * a.quantity), 0), count(*) > 0
  into v_addon_gb, v_has_addon
  from public.ministry_addons a
  where a.ministry_id = p_ministry_id and a.addon_type = 'storage_pack' and a.status = 'active';
  v_addon_gb := coalesce(v_addon_gb, 0);
  v_has_addon := coalesce(v_has_addon, false);

  bytes_used := v_bytes_used;
  effective_limit_bytes := (v_base_mb::bigint * 1024 * 1024) + (v_addon_gb * 1024 * 1024 * 1024);
  has_storage_addon := v_has_addon;
  -- Only an add-on ministry is ever capacity-blocked.
  is_full := v_has_addon and v_bytes_used >= effective_limit_bytes;
  return next;
end;
$$;

create or replace function public.get_ministry_hours_status(p_ministry_id uuid)
returns table (
  meeting_minutes_used integer,
  meeting_minutes_limit integer, -- null = unlimited
  meeting_hours_exhausted boolean,
  broadcast_minutes_used integer,
  broadcast_minutes_limit integer, -- null = unlimited
  broadcast_hours_exhausted boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period_start date;
  v_meeting_used integer;
  v_broadcast_used integer;
  v_meeting_hours_limit integer;
  v_broadcast_hours_limit integer;
  v_current_period date := date_trunc('month', now())::date;
begin
  select u.period_start, coalesce(u.meeting_minutes_used, 0), coalesce(u.broadcast_minutes_used, 0)
  into v_period_start, v_meeting_used, v_broadcast_used
  from public.ministry_usage_metrics u where u.ministry_id = p_ministry_id;

  -- A row from a prior month that increment_ministry_usage hasn't touched
  -- yet this month still reads as last month's counts — treat as unused.
  if v_period_start is null or v_period_start < v_current_period then
    v_meeting_used := 0;
    v_broadcast_used := 0;
  end if;

  select sub.meeting_hours_limit, sub.broadcast_hours_limit
  into v_meeting_hours_limit, v_broadcast_hours_limit
  from public.ministry_subscriptions sub
  where sub.ministry_id = p_ministry_id and sub.status = 'active'
  order by sub.created_at desc limit 1;

  meeting_minutes_used := v_meeting_used;
  meeting_minutes_limit := case when v_meeting_hours_limit is null then null else v_meeting_hours_limit * 60 end;
  meeting_hours_exhausted := meeting_minutes_limit is not null and v_meeting_used >= meeting_minutes_limit;

  broadcast_minutes_used := v_broadcast_used;
  broadcast_minutes_limit := case when v_broadcast_hours_limit is null then null else v_broadcast_hours_limit * 60 end;
  broadcast_hours_exhausted := broadcast_minutes_limit is not null and v_broadcast_used >= broadcast_minutes_limit;

  return next;
end;
$$;

revoke all on function public.get_ministry_storage_status(uuid) from public;
grant execute on function public.get_ministry_storage_status(uuid) to service_role;
revoke all on function public.get_ministry_hours_status(uuid) from public;
grant execute on function public.get_ministry_hours_status(uuid) to service_role;

commit;
