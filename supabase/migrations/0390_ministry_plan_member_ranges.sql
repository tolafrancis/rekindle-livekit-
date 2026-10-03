-- 0390_ministry_plan_member_ranges.sql
-- =====================================================================
-- New member ranges for the Ministry Partner tiers (as Tola specified; the
-- lower bounds overlap and are display-only, the caps are max_members):
--   Starter          0–50   (was uncapped, gated only by feature set)
--   Growth Partner   1–100  (was 1–50)
--   Ministry Partner 51–300 (was 51–200)
--   Ministry Plus   301–600 (was 201–500; +$20/mo per additional 500 unchanged)
--
-- max_members is what ministry-checkout / ministry-billing-webhook copy into
-- ministry_subscriptions.member_limit at subscribe time, so existing active
-- subscriptions on these tiers are bumped to the new caps here too.
-- `features` is the display copy BillingSettings.tsx renders verbatim.
-- =====================================================================

begin;

update public.ministry_partner_plans set
  min_members = 0, max_members = 50,
  features = '["Up to 50 members","Church plants & cell groups","Live Broadcast channel & Video Conferencing","20 meeting hours / mo","10 live-broadcast hours / mo","5 GB storage","No Ministry CRM"]'::jsonb,
  updated_at = now()
where slug = 'starter';

update public.ministry_partner_plans set
  min_members = 1, max_members = 100,
  features = '["Up to 100 members","Live Broadcast channel & Video Conferencing","150 hours meeting & broadcast / mo","5 GB storage","AI note taker","YouTube & Facebook streaming","Full Ministry CRM suite","Pastoral Video Message"]'::jsonb,
  updated_at = now()
where slug = 'growth_partner';

update public.ministry_partner_plans set
  min_members = 51, max_members = 300,
  features = (
    select jsonb_agg(case when f = '51–200 members' then to_jsonb('51–300 members'::text) else to_jsonb(f) end order by ord)
    from jsonb_array_elements_text(features) with ordinality as t(f, ord)
  ),
  updated_at = now()
where slug = 'ministry_partner';

update public.ministry_partner_plans set
  min_members = 301, max_members = 600,
  features = (
    select jsonb_agg(case when f like 'Up to 500 members%' then to_jsonb('Up to 600 members (+$20 per additional 500)'::text) else to_jsonb(f) end order by ord)
    from jsonb_array_elements_text(features) with ordinality as t(f, ord)
  ),
  updated_at = now()
where slug = 'ministry_plus';

-- Existing subscribers pick up the new caps (only raise, never lower a
-- limit an admin set by hand above the old tier cap).
update public.ministry_subscriptions set member_limit = 50
  where plan_type = 'starter' and (member_limit is null or member_limit = -1);
update public.ministry_subscriptions set member_limit = 100
  where plan_type = 'growth_partner' and member_limit = 50;
update public.ministry_subscriptions set member_limit = 300
  where plan_type = 'ministry_partner' and member_limit = 200;
update public.ministry_subscriptions set member_limit = 600
  where plan_type = 'ministry_plus' and member_limit = 500;

commit;
