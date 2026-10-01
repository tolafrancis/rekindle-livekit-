-- 0350_deactivate_family_tier.sql
-- =====================================================================
-- subscription_tiers still had a 'family' row ($29.99/mo, the old
-- SubscriptionManager.tsx 'ministry' card, planType 'family') from before
-- ministry billing moved to the Ministry Partner tenant model — same
-- situation 0271 already handled for 'ministry'/'ministry_plus'. Deactivating
-- rather than deleting, same reasoning: avoid breaking any existing
-- user_subscriptions row that references this tier_id via FK.
-- =====================================================================

begin;

update public.subscription_tiers
  set is_active = false
  where slug = 'family';

commit;
