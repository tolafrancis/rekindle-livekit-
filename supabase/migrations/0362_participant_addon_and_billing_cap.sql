-- 0362_participant_addon_and_billing_cap.sql
-- Billing page changes (2026-09-21):
--   1. A new purchasable add-on type, participant_block (+50/+100/+200
--      participants on top of a plan's advertised billing-page cap).
--   2. A billing-page-only participant cap per tier (100/150/300+/500+),
--      shown as "applies to Meetings and Webinars" — NOT the technical
--      enforcement cap (that's the flat 100-real-participant ceiling in
--      livekit-token/index.ts's MEETING_PARTICIPANT_CAP, untouched by this).
--      Repurposes webinar_audience_cap (migration 0359), which had never been
--      wired into any UI yet, instead of adding a redundant third cap column.
--
-- Also fixes a pre-existing gap found while widening these tables: the
-- 'live_translation' addon type (and its unit_hours column) is assumed
-- throughout packages/features/src/ministryBilling.ts's TypeScript, but was
-- never actually added to either table's real schema in production — every
-- purchase-addon call for it would have failed the CHECK constraint. Fixed
-- alongside since it requires the exact same ALTER this migration is already
-- doing (not a separate, riskier change).

begin;

-- ── ministry_addon_catalog ──────────────────────────────────────────────
alter table public.ministry_addon_catalog
  drop constraint if exists ministry_addon_catalog_addon_type_check;
alter table public.ministry_addon_catalog
  add constraint ministry_addon_catalog_addon_type_check
  check (addon_type in ('storage_pack', 'member_block', 'gift_aid', 'live_translation', 'participant_block'));

alter table public.ministry_addon_catalog add column if not exists unit_hours integer;
alter table public.ministry_addon_catalog add column if not exists unit_participants integer;
alter table public.ministry_addon_catalog add column if not exists price_ngn numeric;

-- ── ministry_addons (purchased instances) ───────────────────────────────
alter table public.ministry_addons
  drop constraint if exists ministry_addons_addon_type_check;
alter table public.ministry_addons
  add constraint ministry_addons_addon_type_check
  check (addon_type in ('storage_pack', 'member_block', 'gift_aid', 'live_translation', 'participant_block'));

alter table public.ministry_addons add column if not exists unit_hours integer;
alter table public.ministry_addons add column if not exists unit_participants integer;
alter table public.ministry_addons add column if not exists price_ngn numeric;

-- ── Participant add-on catalog rows ─────────────────────────────────────
-- stripe_price_id / paystack_plan_code are left NULL — an admin still needs
-- to create the corresponding products/prices in Stripe/Paystack and fill
-- these in before the "Buy" button can actually charge anyone (same
-- prerequisite every other catalog row already has).
insert into public.ministry_addon_catalog (addon_type, label, unit_participants, price_usd, price_ngn, display_order, is_active)
values
  ('participant_block', '+50 participants',  50,  4.99,  4000.00,  50, true),
  ('participant_block', '+100 participants', 100, 8.99,  7500.00,  51, true),
  ('participant_block', '+200 participants', 200, 14.99, 12500.00, 52, true)
on conflict do nothing;

-- ── Billing-page participant cap per tier (Meetings + Webinars) ─────────
update public.ministry_partner_plans set webinar_audience_cap = 100 where slug = 'starter';
update public.ministry_partner_plans set webinar_audience_cap = 150 where slug = 'growth_partner';
update public.ministry_partner_plans set webinar_audience_cap = 300 where slug = 'ministry_partner';
update public.ministry_partner_plans set webinar_audience_cap = 500 where slug = 'ministry_plus';

commit;
