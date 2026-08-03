-- 0271_deactivate_dead_ministry_subscription_tiers.sql
-- =====================================================================
-- subscription_tiers (individual-user tiers) still had 'ministry' ($49.99/mo)
-- and 'ministry_plus' ($99.99/mo) rows from before ministry billing moved to
-- the Ministry Partner model (ministry_partner_plans / ministry_subscriptions
-- — see 0258/0259/0270). Deactivating rather than deleting: one user_subscriptions
-- row (an admin test assignment, assignment_reason='testing') still references
-- ministry_plus's tier_id via FK. is_active=false removes it from
-- getAllSubscriptionTiers() (used by the "Assign Tier" dropdown and tier
-- distribution stats) without breaking that existing row.
-- =====================================================================

begin;

update public.subscription_tiers
  set is_active = false
  where slug in ('ministry', 'ministry_plus');

commit;
