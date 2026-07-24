-- 0250_ministry_partner_plans.sql
-- =====================================================================
-- Admin-configurable pricing catalog for the "Ministry Partner" subscription
-- (region-routed: Nigeria -> Paystack/NGN, elsewhere -> Stripe or PayPal/USD).
-- Replaces hardcoded PLAN_AMOUNTS in ministry-checkout with a DB-driven table
-- so prices and payment-provider IDs can change without a code deploy.
--
-- RLS follows the safe inline-role pattern from 0150_rls_hardening_phase4.sql
-- (block C4) — reads user_profiles.role directly, never auth.users.
-- =====================================================================

begin;

create table if not exists public.ministry_partner_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  min_members integer not null default 0,
  max_members integer, -- null = unbounded (e.g. "500+")
  ngn_price_monthly numeric(12,2) not null,
  ngn_price_annual numeric(12,2) not null,
  usd_price_monthly numeric(12,2) not null,
  usd_price_annual numeric(12,2) not null,
  paystack_plan_code text,
  stripe_price_id_monthly text,
  stripe_price_id_annual text,
  paypal_billing_link_monthly text,
  paypal_billing_link_annual text,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ministry_partner_plans enable row level security;

drop policy if exists p_ministry_partner_plans_public_select on public.ministry_partner_plans;
create policy p_ministry_partner_plans_public_select on public.ministry_partner_plans
  for select
  to public
  using (is_active = true);

drop policy if exists p_ministry_partner_plans_admin_all on public.ministry_partner_plans;
create policy p_ministry_partner_plans_admin_all on public.ministry_partner_plans
  for all
  to authenticated
  using ((select up.role from public.user_profiles up where up.user_id = auth.uid()) in ('super_admin','platform_admin'))
  with check ((select up.role from public.user_profiles up where up.user_id = auth.uid()) in ('super_admin','platform_admin'));

-- Seed the 3 launch tiers. Annual = 10x monthly ("2 months free"), matching
-- this repo's existing convention in packages/features/src/ministryBilling.ts.
-- Adjust freely later via the admin Partner Plans screen — no code change needed.
insert into public.ministry_partner_plans
  (slug, name, min_members, max_members, ngn_price_monthly, ngn_price_annual, usd_price_monthly, usd_price_annual, features, display_order)
values
  ('tier_1', 'Tier 1', 0, 99, 10000, 100000, 20, 200,
   '["Under 100 members","Ministry CRM basics","Live channel & interactive meetings","Email & WhatsApp broadcast"]'::jsonb, 1),
  ('tier_2', 'Tier 2', 100, 300, 25000, 250000, 50, 500,
   '["100–300 members","Full Ministry CRM suite","Gift Aid claims & HMRC submission","Multi-platform live broadcasting"]'::jsonb, 2),
  ('tier_3', 'Tier 3', 500, null, 50000, 500000, 75, 750,
   '["500+ members","Everything in Tier 2","Priority support","White-label & advanced analytics"]'::jsonb, 3)
on conflict (slug) do nothing;

commit;
