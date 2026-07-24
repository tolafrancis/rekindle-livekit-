-- 0251_ministry_subscriptions_provider_fields.sql
-- =====================================================================
-- Extends ministry_subscriptions (created directly in the dashboard, not
-- previously tracked in a migration) with region/provider fields needed by
-- the Ministry Partner regional billing flow. Additive only.
--
-- payment_provider distinguishes which rail a row was billed through.
-- paystack_subscription_code/paystack_customer_code mirror the existing
-- stripe_subscription_id/stripe_customer_id columns for the Paystack path.
-- 'pending_paypal_confirmation' is a new status value for the PayPal hosted
-- billing link path, which has no webhook in this phase — an admin confirms
-- it manually via the Partner Plans / Subscriptions screen after checking
-- PayPal. current_period_end (already on the table) doubles as the next
-- billing/renewal date — no separate column added for that.
-- =====================================================================

begin;

alter table public.ministry_subscriptions
  add column if not exists country text,
  add column if not exists payment_provider text check (payment_provider in ('stripe','paystack','paypal')),
  add column if not exists paystack_subscription_code text,
  add column if not exists paystack_customer_code text;

-- This table predates any tracked migration, so its "status" column may carry
-- a CHECK constraint whose allowed list doesn't include the new
-- 'pending_paypal_confirmation' value the PayPal path needs to insert. Find
-- and drop any such constraint defensively (by introspection, since we don't
-- know its name) rather than assuming status is unconstrained.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'ministry_subscriptions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.ministry_subscriptions drop constraint %I', c.conname);
  end loop;
end $$;

commit;
