-- 0258_ministry_tier_rebrand.sql
-- =====================================================================
-- Renames the 3 launch Ministry Partner tiers (tier_1/tier_2/tier_3) to
-- their real product names and adds a 4th tier, plus the columns needed
-- to express storage/hours/member-overage caps per tier instead of just
-- a marketing-copy `features` array.
--
-- UPDATE (not delete+insert) on the existing 3 rows so `id`, and any
-- provider IDs an admin has already set (stripe_price_id_*, paystack_plan_code,
-- paypal_billing_link_*), survive the rename.
--
-- New numeric columns are the source of truth ministry-checkout/
-- ministry-billing-webhook read to populate ministry_subscriptions at
-- subscribe time (see 0258 also altering that table below). `features`
-- stays a display-only marketing string array — unchanged contract from
-- 0250, still read verbatim by BillingSettings.tsx.
--
-- null on meeting_hours_included / broadcast_hours_included means
-- unlimited (mirrors the -1-is-unlimited convention used elsewhere in
-- ministry_subscriptions, but null reads clearer on a "hours included"
-- column than a magic -1).
-- =====================================================================

begin;

alter table public.ministry_partner_plans
  add column if not exists storage_gb integer not null default 0,
  add column if not exists meeting_hours_included integer,
  add column if not exists broadcast_hours_included integer,
  add column if not exists member_overage_block_size integer,
  add column if not exists member_overage_price_usd numeric(10,2),
  add column if not exists gift_aid_addon_price_usd numeric(10,2);

-- ── Rename the 3 launch tiers in place ────────────────────────────────
update public.ministry_partner_plans set
  slug = 'starter', name = 'Starter',
  min_members = 0, max_members = null,
  ngn_price_monthly = 8000, ngn_price_annual = 80000,
  usd_price_monthly = 10, usd_price_annual = 100,
  storage_gb = 5, meeting_hours_included = 20, broadcast_hours_included = 10,
  features = '["Church plants & cell groups","Live Broadcast channel & Video Conferencing","20 meeting hours / mo","10 live-broadcast hours / mo","5 GB storage","No Ministry CRM"]'::jsonb,
  display_order = 1, updated_at = now()
where slug = 'tier_1';

update public.ministry_partner_plans set
  slug = 'growth_partner', name = 'Growth Partner',
  min_members = 1, max_members = 50,
  ngn_price_monthly = 25000, ngn_price_annual = 250000,
  usd_price_monthly = 30, usd_price_annual = 300,
  storage_gb = 5, meeting_hours_included = 150, broadcast_hours_included = 150,
  features = '["Up to 50 members","Live Broadcast channel & Video Conferencing","150 hours meeting & broadcast / mo","5 GB storage","AI note taker","YouTube & Facebook streaming","Full Ministry CRM suite","Pastoral Video Message"]'::jsonb,
  display_order = 2, updated_at = now()
where slug = 'tier_2';

update public.ministry_partner_plans set
  slug = 'ministry_partner', name = 'Ministry Partner',
  min_members = 51, max_members = 200,
  ngn_price_monthly = 50000, ngn_price_annual = 500000,
  usd_price_monthly = 60, usd_price_annual = 600,
  storage_gb = 25, meeting_hours_included = null, broadcast_hours_included = null,
  gift_aid_addon_price_usd = 20,
  features = '["51–200 members","Everything in Growth Partner","Unlimited meeting & broadcast hours","300-participant meetings","25 GB storage","WhatsApp broadcasts","GraceCounsel AI","YouTube streaming, multi-platform live broadcasting","Pastoral Video Message","+$20/mo add-on: Gift Aid claims & HMRC submission"]'::jsonb,
  display_order = 3, updated_at = now()
where slug = 'tier_3';

-- ── New top tier ───────────────────────────────────────────────────────
insert into public.ministry_partner_plans
  (slug, name, min_members, max_members,
   ngn_price_monthly, ngn_price_annual, usd_price_monthly, usd_price_annual,
   storage_gb, meeting_hours_included, broadcast_hours_included,
   member_overage_block_size, member_overage_price_usd, gift_aid_addon_price_usd,
   features, display_order)
values
  ('ministry_plus', 'Ministry Plus', 201, 500,
   100000, 1000000, 120, 1200,
   100, null, null,
   500, 20, 20,
   '["Up to 500 members (+$20 per additional 500)","Everything in Ministry Partner","100 GB storage","White-label & priority support"]'::jsonb,
   4)
on conflict (slug) do nothing;

-- ── ministry_subscriptions: new columns the webhook/checkout now populate ──
-- storage_limit_mb likely already exists (ministryEntitlements.ts has read it
-- since before this migration); add defensively since this table predates any
-- tracked migration (see 0251's note) and its exact prior shape is unknown.
alter table public.ministry_subscriptions
  add column if not exists storage_limit_mb integer,
  add column if not exists meeting_hours_limit integer,
  add column if not exists broadcast_hours_limit integer;

commit;
