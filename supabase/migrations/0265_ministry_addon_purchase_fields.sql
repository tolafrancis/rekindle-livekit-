-- 0265_ministry_addon_purchase_fields.sql
-- =====================================================================
-- Fields the Phase 5 addon-purchase flow needs on top of the 0259 catalog:
--   - ministry_addon_catalog.stripe_price_id: optional pre-created Stripe
--     recurring Price for this SKU. If unset, ministry-checkout falls back
--     to inline price_data (same fallback pattern 0250/ministry-checkout
--     already uses for the base plan) — works out of the box, no Stripe
--     dashboard setup required before this ships.
--   - ministry_addon_catalog.paystack_plan_code: REQUIRED before a Nigerian
--     ministry can buy a given SKU — unlike Stripe, Paystack subscriptions
--     can't be created with an inline price, only a pre-created Plan. Left
--     null until an admin fills it in via Partner Plans-style admin UI
--     (not built in this phase); purchase-addon returns a clear error for
--     that SKU/region until then, same as the base plan already does.
-- =====================================================================

begin;

alter table public.ministry_addon_catalog
  add column if not exists stripe_price_id text,
  add column if not exists paystack_plan_code text;

commit;
