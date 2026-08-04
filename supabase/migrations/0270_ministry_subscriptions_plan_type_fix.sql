-- 0270_ministry_subscriptions_plan_type_fix.sql
-- =====================================================================
-- ministry_subscriptions.plan_type has been constrained to
-- ('basic','standard','premium','enterprise') since the table was created —
-- a taxonomy from before the 0258 Ministry Partner rebrand. Every real slug
-- ministry-billing-webhook actually writes (from ministry_partner_plans:
-- starter/growth_partner/ministry_partner/ministry_plus) violates this
-- constraint, so every checkout webhook's upsert has been silently failing
-- (its error was never checked) since the rebrand. The table has zero rows
-- as a result — every Ministry Partner customer has been resolving to Free
-- entitlements (see packages/auth/src/ministryEntitlements.ts) regardless
-- of what they paid for.
--
-- Purely widens the allowed set to match what's actually written — no data
-- migration needed since there are no existing rows to reconcile.
-- =====================================================================

begin;

alter table public.ministry_subscriptions
  drop constraint if exists ministry_subscriptions_plan_type_check;

alter table public.ministry_subscriptions
  add constraint ministry_subscriptions_plan_type_check
  check (plan_type = any (array['starter', 'growth_partner', 'ministry_partner', 'ministry_plus']));

-- The column default was also 'basic' (now invalid) — would hit the same
-- silent-failure class of bug if a row is ever inserted without an explicit
-- plan_type. 'starter' is the lowest real Ministry Partner tier.
alter table public.ministry_subscriptions
  alter column plan_type set default 'starter';

commit;
