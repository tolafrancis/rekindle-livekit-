-- 0298_reconcile_ministry_subscriptions.sql
-- =====================================================================
-- Fix 8 (ministry-billing-tier-enforcement-audit.md): "a missed webhook
-- shouldn't leave a lapsed ministry indefinitely active." Stripe/Paystack
-- push renewal state via webhooks (ministry-billing-webhook), which
-- pushes ministry_subscriptions.current_period_end forward on every
-- successful renewal — but if a webhook delivery is ever missed (receiver
-- outage, provider retry exhaustion, etc.), status stays 'active' forever
-- with a current_period_end stuck in the past, and nothing has ever
-- re-checked it.
--
-- Deliberately NOT calling out to Stripe/Paystack's API to ask "is this
-- really still active" — that would need per-provider credentials/rate
-- limiting wired into a scheduled job, real added complexity for a
-- narrower problem than it solves. Instead: this is a conservative,
-- self-healing fallback. A subscription 'active' with current_period_end
-- more than GRACE_DAYS in the past almost certainly means a missed
-- webhook, not a real active subscription with legitimately stale
-- metadata — GRACE_DAYS=3 is comfortably beyond any realistic webhook
-- delivery delay while still catching a truly-missed renewal quickly.
-- Demotes to 'past_due' — the SAME state a real invoice.payment_failed
-- webhook already sets (ministry-billing-webhook/index.ts), not
-- 'cancelled' — so it's not in ministryEntitlements.ts's ACTIVE_STATES
-- (correctly drops the ministry to Free entitlements) but is fully
-- self-healing: if the real webhook eventually does arrive, its own
-- upsert() sets status='active' with a fresh current_period_end and
-- simply overwrites whatever this job set. An admin can also always
-- override manually via the Platform Admin -> Subscription Plans screen
-- (SubscriptionPlansManager.tsx), which already does the equivalent write
-- + audit log by hand.
--
-- Only ever touches status = 'active' rows — 'trialing' has its own
-- separate (already-flagged, unrelated) gap where it isn't in
-- ACTIVE_STATES at all; not this migration's scope to fix that too.
-- =====================================================================

begin;

create or replace function public.reconcile_ministry_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grace_days constant integer := 3;
  v_count integer := 0;
  v_row record;
begin
  for v_row in
    select id, ministry_id, current_period_end
    from public.ministry_subscriptions
    where status = 'active'
      and current_period_end is not null
      and current_period_end < now() - make_interval(days => v_grace_days)
  loop
    update public.ministry_subscriptions
      set status = 'past_due', updated_at = now()
      where id = v_row.id and status = 'active';

    update public.ministry_groups
      set subscription_status = 'past_due'
      where id = v_row.ministry_id;

    insert into public.ministry_audit_logs (ministry_id, actor_id, actor_type, action, resource_type, resource_id, new_values)
      values (
        v_row.ministry_id, null, 'system', 'subscription_auto_demoted', 'subscription', v_row.id,
        jsonb_build_object(
          'status', 'past_due',
          'reason', 'current_period_end passed with no renewal webhook',
          'current_period_end', v_row.current_period_end,
          'grace_days', v_grace_days
        )
      );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.reconcile_ministry_subscriptions() to service_role;

commit;

-- ---------------------------------------------------------------------
-- Scheduling — run this block separately, AFTER confirming the function
-- above works (e.g. `select public.reconcile_ministry_subscriptions();`
-- by hand once). Requires the pg_cron extension enabled (Dashboard ->
-- Database -> Extensions) — NOT confirmed already on for this project,
-- see docs/edge-functions-and-cron.md's own caveat for process-daily-
-- reminders. Idempotent — safe to re-run.
-- ---------------------------------------------------------------------

-- create extension if not exists pg_cron;

select cron.schedule(
  'reconcile-ministry-subscriptions',
  '0 4 * * *', -- daily at 04:00 UTC
  $$ select public.reconcile_ministry_subscriptions(); $$
);

-- To inspect / remove:
--   select * from cron.job;
--   select * from cron.job_run_details where jobname = 'reconcile-ministry-subscriptions' order by start_time desc limit 5;
--   select cron.unschedule('reconcile-ministry-subscriptions');
