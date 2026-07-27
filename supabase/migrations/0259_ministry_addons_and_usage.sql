-- 0259_ministry_addons_and_usage.sql
-- =====================================================================
-- Data model for selling storage/members as add-ons on top of a Ministry
-- Partner tier, and for metering real usage against the caps introduced
-- in 0258. Schema only in this migration — nothing writes to these
-- tables yet:
--   - ministry_addon_catalog is read by a future checkout flow (not
--     built yet) to sell storage packs / member blocks / Gift Aid.
--   - ministry_addons rows are inserted by that future checkout flow.
--   - ministry_usage_metrics is written by future upload-path/session
--     metering (byte counts, LiveKit session minutes) — see the storage
--     add-on architecture memo. A ministry with no row here simply reads
--     as zero-used, which is correct for a ministry that hasn't used
--     anything yet.
--
-- has_storage_addon (any ACTIVE 'storage_pack' row in ministry_addons)
-- is the flag that later switches a ministry from time-boxed recording
-- retention to capacity-boxed storage-full enforcement — not implemented
-- here, just the table shape it will read.
-- =====================================================================

begin;

-- ── Catalog: what can be bought ─────────────────────────────────────────
create table if not exists public.ministry_addon_catalog (
  id           uuid primary key default gen_random_uuid(),
  addon_type   text not null check (addon_type in ('storage_pack', 'member_block', 'gift_aid')),
  label        text not null,
  unit_gb      integer,        -- storage_pack only
  unit_members integer,        -- member_block only
  price_usd    numeric(10,2) not null,
  is_active    boolean not null default true,
  display_order integer not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.ministry_addon_catalog enable row level security;

drop policy if exists p_ministry_addon_catalog_public_select on public.ministry_addon_catalog;
create policy p_ministry_addon_catalog_public_select on public.ministry_addon_catalog
  for select to public
  using (is_active = true);

drop policy if exists p_ministry_addon_catalog_admin_all on public.ministry_addon_catalog;
create policy p_ministry_addon_catalog_admin_all on public.ministry_addon_catalog
  for all to authenticated
  using ((select up.role from public.user_profiles up where up.user_id = auth.uid()) in ('super_admin','platform_admin'))
  with check ((select up.role from public.user_profiles up where up.user_id = auth.uid()) in ('super_admin','platform_admin'));

insert into public.ministry_addon_catalog (addon_type, label, unit_gb, price_usd, display_order) values
  ('storage_pack', '+50 GB storage',   50,   5,  1),
  ('storage_pack', '+250 GB storage',  250, 15,  2),
  ('storage_pack', '+1 TB storage',    1024, 49, 3)
on conflict do nothing;

insert into public.ministry_addon_catalog (addon_type, label, unit_members, price_usd, display_order) values
  ('member_block', '+500 members', 500, 20, 4)
on conflict do nothing;

insert into public.ministry_addon_catalog (addon_type, label, price_usd, display_order) values
  ('gift_aid', 'Gift Aid claims & HMRC submission', 20, 5)
on conflict do nothing;

-- ── Purchased instances ──────────────────────────────────────────────────
create table if not exists public.ministry_addons (
  id                    uuid primary key default gen_random_uuid(),
  ministry_id           uuid not null references public.ministry_groups(id) on delete cascade,
  addon_type            text not null check (addon_type in ('storage_pack', 'member_block', 'gift_aid')),
  quantity              integer not null default 1,
  unit_gb               integer,
  unit_members          integer,
  price_usd             numeric(10,2) not null,
  status                text not null default 'active' check (status in ('active', 'cancelled')),
  stripe_subscription_item_id text,
  paystack_subscription_code  text,
  purchased_at          timestamptz not null default now(),
  cancelled_at          timestamptz
);

create index if not exists idx_ministry_addons_ministry_id
  on public.ministry_addons (ministry_id, status);

alter table public.ministry_addons enable row level security;

drop policy if exists p_ministry_addons_admin_select on public.ministry_addons;
create policy p_ministry_addons_admin_select on public.ministry_addons
  for select to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()));

-- Writes go through the (future) checkout edge function under the service
-- role, same pattern as ministry_subscriptions — no direct client insert.

-- ── Usage metering ────────────────────────────────────────────────────────
create table if not exists public.ministry_usage_metrics (
  ministry_id           uuid primary key references public.ministry_groups(id) on delete cascade,
  bytes_used            bigint not null default 0,
  meeting_minutes_used  integer not null default 0,
  broadcast_minutes_used integer not null default 0,
  period_start          date not null default date_trunc('month', now())::date,
  updated_at            timestamptz not null default now()
);

alter table public.ministry_usage_metrics enable row level security;

drop policy if exists p_ministry_usage_metrics_admin_select on public.ministry_usage_metrics;
create policy p_ministry_usage_metrics_admin_select on public.ministry_usage_metrics
  for select to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()));

-- Writes are service-role only (upload-path / session-metering code), no
-- policy needed beyond RLS being enabled (service role bypasses RLS).

commit;
