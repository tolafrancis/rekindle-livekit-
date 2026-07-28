-- 0260_increment_ministry_usage_fn.sql
-- =====================================================================
-- Atomic increment for ministry_usage_metrics (0259). Callers (the LiveKit
-- webhook, the video-transcode worker, future upload paths) run outside a
-- single transaction with each other, so a read-then-write from application
-- code would race; this does the increment as one upsert statement instead.
--
-- bytes_used is a running total (storage doesn't expire on a monthly clock —
-- only an explicit delete, e.g. a future retention sweep, should reduce it).
-- meeting_minutes_used / broadcast_minutes_used ARE monthly quotas: the first
-- call in a new calendar month rolls them back to zero (plus that call's own
-- delta) instead of accumulating forever.
--
-- service_role only — this bypasses any plan-limit checking by design (it's
-- an accounting primitive, not an enforcement gate), so it must not be
-- callable by a regular authenticated user against their own ministry.
-- =====================================================================

begin;

create or replace function public.increment_ministry_usage(
  p_ministry_id uuid,
  p_bytes_delta bigint default 0,
  p_meeting_minutes_delta integer default 0,
  p_broadcast_minutes_delta integer default 0
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_period date := date_trunc('month', now())::date;
begin
  insert into public.ministry_usage_metrics
    (ministry_id, bytes_used, meeting_minutes_used, broadcast_minutes_used, period_start, updated_at)
  values
    (p_ministry_id, greatest(p_bytes_delta, 0), greatest(p_meeting_minutes_delta, 0), greatest(p_broadcast_minutes_delta, 0), v_current_period, now())
  on conflict (ministry_id) do update set
    bytes_used = public.ministry_usage_metrics.bytes_used + p_bytes_delta,
    meeting_minutes_used = case
      when public.ministry_usage_metrics.period_start < v_current_period
        then greatest(p_meeting_minutes_delta, 0)
      else public.ministry_usage_metrics.meeting_minutes_used + p_meeting_minutes_delta
    end,
    broadcast_minutes_used = case
      when public.ministry_usage_metrics.period_start < v_current_period
        then greatest(p_broadcast_minutes_delta, 0)
      else public.ministry_usage_metrics.broadcast_minutes_used + p_broadcast_minutes_delta
    end,
    period_start = v_current_period,
    updated_at = now();
end;
$$;

revoke all on function public.increment_ministry_usage(uuid, bigint, integer, integer) from public;
grant execute on function public.increment_ministry_usage(uuid, bigint, integer, integer) to service_role;

commit;
