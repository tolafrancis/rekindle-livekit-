-- 0252_individual_partner_tiers.sql
-- =====================================================================
-- Reshapes the existing premium/premium_plus subscription_tiers rows into
-- the two "Individual Partner" tiers: both scoped to a single live channel,
-- live broadcast + video conferencing (interactive meetings) on both,
-- differentiated only by recording access on the second tier.
--
-- These are LIVE, real-money tiers (paystack-initialize/paystack-webhook,
-- stripe-subscription/stripe-webhook, and packages/features/src/components/
-- SubscriptionManager.tsx all read/write them) — this migration only
-- updates existing rows' values, no structural changes, no new columns.
-- price_monthly/price_yearly are USD display values; actual charge amounts
-- live in paystack-initialize's PLAN_PRICES and Stripe Price IDs (updated
-- separately, since those need real provider-side price objects).
-- =====================================================================

begin;

update public.subscription_tiers set
  price_monthly = 10,
  price_yearly = 100,
  max_live_channels = 1,
  can_create_live_channels = true,
  can_host_interactive_meetings = true,
  can_record_meetings = false,
  updated_at = now()
where slug = 'premium';

update public.subscription_tiers set
  price_monthly = 18,
  price_yearly = 180,
  max_live_channels = 1,
  can_create_live_channels = true,
  can_host_interactive_meetings = true,
  can_record_meetings = true,
  updated_at = now()
where slug = 'premium_plus';

commit;
