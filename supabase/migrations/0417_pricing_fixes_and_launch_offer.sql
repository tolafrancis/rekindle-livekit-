-- 0417_pricing_fixes_and_launch_offer.sql
-- =====================================================================
-- Pricing review (2026-10-21), agreed with the user:
--
-- 1. Plan fixes. The plan cards promised things the plans don't apply:
--    Growth Partner said "150 hours" (set to 20/20 by 0359), Ministry
--    Partner said "Unlimited" (set to 30/30 by 0359). The hours stay as
--    0359 set them (that was a cost decision); the card text now matches.
--    Member ranges no longer overlap, Growth Partner gets 10 GB storage
--    instead of the same 5 GB as Starter, and every add-on gets a Naira
--    price. The Live Translation packs from 0345 are missing from the live
--    catalog, so nobody can buy translation; they're re-added here at
--    0345's prices.
--
--    Existing subscriptions are deliberately NOT touched: the one paid
--    Growth subscription keeps its 150/150 hours, and the ministries that
--    were activated by hand stay as they are until the user decides.
--
-- 2. Launch offer ("Founding Ministry"): first 3 months at an intro price
--    on monthly billing, for the first 100 ministries, then the normal
--    price. Switching to annual during the intro period locks the price
--    for 12 months. The offer row ships switched OFF (is_active = false);
--    turn it on once the Stripe coupons and Paystack intro plans below are
--    created and their IDs saved on each plan.
--
--    - Stripe: one coupon per plan (amount off, duration repeating, 3
--      months), saved in ministry_partner_plans.stripe_intro_coupon_id.
--    - Paystack: subscriptions can't take coupons or change plan, so each
--      plan gets a separate intro Paystack plan (paystack_intro_plan_code);
--      the ministry-intro-rollover function moves the subscription onto the
--      normal plan once intro_ends_at passes.
--    - PayPal stays manual.
--
-- 3. A daily reminder to the ministry's admins 7 days before the intro
--    price ends, and a daily cron for the Paystack rollover.
-- =====================================================================

begin;

-- ── 1. Plan fixes ─────────────────────────────────────────────────────

update public.ministry_partner_plans set min_members = 0, max_members = 50 where slug = 'starter';

update public.ministry_partner_plans
  set min_members = 51, max_members = 100, storage_gb = 10,
      features = '["Up to 100 members","Live Broadcast channel & Video Conferencing","20 meeting hours & 20 live-broadcast hours / mo","10 GB storage","AI note taker","YouTube & Facebook streaming","Full Ministry CRM suite","Pastoral Video Message"]'::jsonb
  where slug = 'growth_partner';

update public.ministry_partner_plans
  set min_members = 101, max_members = 300,
      features = '["Up to 300 members","Everything in Growth Partner","30 meeting hours & 30 live-broadcast hours / mo","300-participant meetings","25 GB storage","WhatsApp broadcasts","GraceCounsel AI","YouTube streaming, multi-platform live broadcasting","Pastoral Video Message","+$20/mo add-on: Gift Aid claims & HMRC submission"]'::jsonb
  where slug = 'ministry_partner';

update public.ministry_partner_plans
  set min_members = 301, max_members = 600,
      features = '["Up to 600 members (+$20 per additional 500)","Everything in Ministry Partner","60 meeting hours & 60 live-broadcast hours / mo","100 GB storage","White-label & priority support","Up to 4 live channels for campuses or languages"]'::jsonb
  where slug = 'ministry_plus';

-- Naira prices for the add-ons that only had USD (≈ the ₦800/$ ratio the
-- participant blocks already use).
update public.ministry_addon_catalog set price_ngn = 4000  where addon_type = 'storage_pack' and unit_gb = 50   and price_ngn is null;
update public.ministry_addon_catalog set price_ngn = 12000 where addon_type = 'storage_pack' and unit_gb = 250  and price_ngn is null;
update public.ministry_addon_catalog set price_ngn = 40000 where addon_type = 'storage_pack' and unit_gb = 1024 and price_ngn is null;
update public.ministry_addon_catalog set price_ngn = 16000 where addon_type = 'member_block' and price_ngn is null;
update public.ministry_addon_catalog set price_ngn = 16000 where addon_type = 'gift_aid'     and price_ngn is null;

-- Live Translation packs (0345's prices), only if they aren't there.
insert into public.ministry_addon_catalog (addon_type, label, unit_hours, price_usd, price_ngn, is_active, display_order)
select v.addon_type, v.label, v.unit_hours, v.price_usd, v.price_ngn, true, v.display_order
from (values
  ('live_translation', 'Live Translation — 5 hours/month',  5,  35::numeric,  28000::numeric,  100),
  ('live_translation', 'Live Translation — 15 hours/month', 15, 100::numeric, 80000::numeric,  101),
  ('live_translation', 'Live Translation — 40 hours/month', 40, 260::numeric, 208000::numeric, 102)
) as v(addon_type, label, unit_hours, price_usd, price_ngn, display_order)
where not exists (
  select 1 from public.ministry_addon_catalog c
   where c.addon_type = 'live_translation' and c.unit_hours = v.unit_hours
);
update public.ministry_addon_catalog set is_active = true where addon_type = 'live_translation';

-- ── 2. Launch offer ───────────────────────────────────────────────────

create table if not exists public.ministry_launch_offer (
  id boolean primary key default true check (id), -- single row
  is_active boolean not null default false,
  max_redemptions integer not null default 100,
  intro_months integer not null default 3,
  ends_at timestamptz, -- optional hard end date; null = runs until the cap is reached
  updated_at timestamptz not null default now()
);
insert into public.ministry_launch_offer (id) values (true) on conflict (id) do nothing;

alter table public.ministry_launch_offer enable row level security;
-- No policies: read through get_launch_offer_status(), edited by platform admins in SQL.

create table if not exists public.ministry_launch_offer_redemptions (
  ministry_id uuid primary key references public.ministry_groups(id) on delete cascade,
  redeemed_by uuid references auth.users(id) on delete set null,
  plan text not null,
  provider text not null check (provider in ('stripe', 'paystack', 'paypal')),
  created_at timestamptz not null default now()
);
create index if not exists idx_launch_offer_redemptions_user on public.ministry_launch_offer_redemptions (redeemed_by);
alter table public.ministry_launch_offer_redemptions enable row level security;
-- No policies: written by the billing webhook (service role) only.

alter table public.ministry_partner_plans
  add column if not exists intro_usd_price_monthly numeric,
  add column if not exists intro_ngn_price_monthly numeric,
  add column if not exists stripe_intro_coupon_id text,
  add column if not exists paystack_intro_plan_code text;

update public.ministry_partner_plans set intro_usd_price_monthly = 5,  intro_ngn_price_monthly = 4000  where slug = 'starter';
update public.ministry_partner_plans set intro_usd_price_monthly = 10, intro_ngn_price_monthly = 8500  where slug = 'growth_partner';
update public.ministry_partner_plans set intro_usd_price_monthly = 20, intro_ngn_price_monthly = 17000 where slug = 'ministry_partner';
update public.ministry_partner_plans set intro_usd_price_monthly = 50, intro_ngn_price_monthly = 42000 where slug = 'ministry_plus';

alter table public.ministry_subscriptions
  add column if not exists intro_offer_applied boolean not null default false,
  add column if not exists intro_ends_at timestamptz,
  add column if not exists intro_reminder_sent_at timestamptz,
  add column if not exists intro_rolled_over_at timestamptz,
  add column if not exists price_locked_until timestamptz,
  add column if not exists paystack_authorization_code text;

-- Public offer status for the billing and landing pages.
create or replace function public.get_launch_offer_status()
returns table (is_open boolean, places_left integer, intro_months integer, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.is_active
      and (o.ends_at is null or o.ends_at > now())
      and (select count(*) from public.ministry_launch_offer_redemptions) < o.max_redemptions,
    greatest(o.max_redemptions - (select count(*) from public.ministry_launch_offer_redemptions)::integer, 0),
    o.intro_months,
    o.ends_at
  from public.ministry_launch_offer o;
$$;
grant execute on function public.get_launch_offer_status() to anon, authenticated;

-- Whether a ministry joined on the launch offer (its WhatsApp setup fee is
-- waived). The redemptions table itself has no client policies.
create or replace function public.ministry_has_launch_offer(p_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ministry_launch_offer_redemptions where ministry_id = p_ministry_id);
$$;
grant execute on function public.ministry_has_launch_offer(uuid) to authenticated;

-- ── 3. Reminder 7 days before the intro price ends ───────────────────

create or replace function public.send_intro_price_reminders()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  for r in
    select s.id, s.ministry_id, s.intro_ends_at, s.currency,
           p.name, p.usd_price_monthly, p.ngn_price_monthly
      from public.ministry_subscriptions s
      join public.ministry_partner_plans p on p.slug = s.plan_type
     where s.intro_offer_applied
       and s.status = 'active'
       and s.intro_reminder_sent_at is null
       and s.intro_ends_at between now() and now() + interval '7 days'
  loop
    perform public._notify_ministry_admins(
      r.ministry_id,
      'ministry_intro_price_ending',
      'Your launch price ends on ' || to_char(r.intro_ends_at, 'FMDD Mon YYYY'),
      'From then your ' || r.name || ' plan is '
        || case when lower(r.currency) = 'ngn' then '₦' || to_char(r.ngn_price_monthly, 'FM999,999,999')
                else '$' || to_char(r.usd_price_monthly, 'FM999,999') end
        || ' a month.'
        -- Switching to annual in the app is card (Stripe) only for now.
        || case when lower(r.currency) = 'ngn' then ''
                else ' Switch to annual billing to get 2 months free and lock your price for 12 months.' end,
      '/settings/billing'
    );
    update public.ministry_subscriptions set intro_reminder_sent_at = now() where id = r.id;
  end loop;
end;
$$;

revoke all on function public.send_intro_price_reminders() from public, anon, authenticated;

select cron.unschedule('intro-price-reminders') where exists (select 1 from cron.job where jobname = 'intro-price-reminders');
-- Daily 08:10 UTC.
select cron.schedule('intro-price-reminders', '10 8 * * *', $$ select public.send_intro_price_reminders(); $$);

-- ── 4. Paystack rollover (intro plan → normal plan) ───────────────────

select cron.unschedule('ministry-intro-rollover') where exists (select 1 from cron.job where jobname = 'ministry-intro-rollover');
-- Daily 06:20 UTC.
select cron.schedule(
  'ministry-intro-rollover',
  '20 6 * * *',
  $$
  select net.http_post(
    url     := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/ministry-intro-rollover',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

commit;
