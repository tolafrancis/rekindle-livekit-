-- 0339_developer_accounts.sql
-- =====================================================================
-- Decouples the Interactive Meetings API from the ministry/consumer
-- subscription system. An outside company signing up at the standalone
-- developer portal has no user_profiles/subscription_tiers row and never
-- will — gating meetings-api's `create` action on those (as originally
-- wired in 0338) would lock every such signup out permanently.
--
-- developer_accounts is the new source of truth for API-side plan/quota,
-- one row per signed-up account (owner_user_id), independent of whatever
-- ministry/consumer plan that same auth.users row might separately have.
-- v1 ships a single free plan; quota usage itself is computed on the fly
-- from api_meetings (no counters to keep in sync) — this table just carries
-- the plan and signup metadata.
-- =====================================================================

begin;

create table if not exists public.developer_accounts (
  owner_user_id  uuid primary key references auth.users(id) on delete cascade,
  company_name   text,
  plan           text not null default 'free' check (plan in ('free')),
  created_at     timestamptz not null default now()
);

alter table public.developer_accounts enable row level security;

create policy "Owner can view own developer account"
  on public.developer_accounts for select
  using (auth.uid() = owner_user_id or auth.role() = 'service_role');

create policy "Service role manages developer accounts"
  on public.developer_accounts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

commit;
