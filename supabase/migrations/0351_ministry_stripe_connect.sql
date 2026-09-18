-- 0351_ministry_stripe_connect.sql
-- =====================================================================
-- Real Stripe Connect (Express) for ministry donations. Ministries onboard
-- via ministry-connect-onboarding (Account + Account Link), donations flow
-- through ministry-donation-checkout as destination charges (platform
-- collects, application_fee_amount is the platform's 3% cut, the remainder
-- auto-transfers to the ministry's connected account), and
-- ministry-donation-webhook keeps this table + ministry_donations in sync.
--
-- Also retrofits RLS onto the existing (previously unprotected)
-- ministry_donations table, since it now carries real financial/PII data
-- under this flow. Idempotent: safe to re-run.
-- =====================================================================

begin;

create table if not exists public.ministry_stripe_connect (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null unique references public.ministry_groups(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  disabled_reason text,
  currently_due jsonb,
  onboarding_started_at timestamptz,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ministry_stripe_connect enable row level security;

drop policy if exists p_ministry_stripe_connect_admin_all on public.ministry_stripe_connect;
create policy p_ministry_stripe_connect_admin_all on public.ministry_stripe_connect
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));
-- No select policy for plain members, none for anon: the donor-facing form
-- never reads this table directly — it attempts a donation via
-- ministry-donation-checkout and shows whatever error comes back if the
-- ministry isn't onboarded yet. Service-role writes from edge functions
-- bypass RLS entirely.

-- ---------------------------------------------------------------------
-- ministry_donations: RLS retrofit (financial/PII data, none existed before)
-- ---------------------------------------------------------------------
alter table public.ministry_donations enable row level security;

drop policy if exists p_ministry_donations_admin_all on public.ministry_donations;
create policy p_ministry_donations_admin_all on public.ministry_donations
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

drop policy if exists p_ministry_donations_donor_sel on public.ministry_donations;
create policy p_ministry_donations_donor_sel on public.ministry_donations
  for select to authenticated
  using (donor_id = auth.uid());
-- No anon/public and no general-member policy: donor_name/donor_email/amount
-- is stricter than the campaigns-style member-read pattern used elsewhere.

commit;
