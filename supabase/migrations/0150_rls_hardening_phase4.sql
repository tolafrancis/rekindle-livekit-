-- 0150_rls_hardening_phase4.sql
-- =====================================================================
-- Phase 4 — RLS hardening: close the active TENANT leaks found in the audit
-- (docs/investigations/phase4-rls-audit.md).
--
-- ⚠ REVIEW BEFORE APPLYING. This changes access control on a live DB with real
--   ministries. Apply in a low-traffic window and watch for 42501 (RLS denial).
-- NOTE ON MEMBERSHIP: the existing helpers is_ministry_member/admin(...) check the
--   ministry_members table, but the app's canonical membership is ministry_group_members
--   (+ ministry_groups.owner_id/leader_id) — confirmed different populations (§3a).
--   Using those helpers would DENY real app members, so this migration defines and uses
--   ministry_group_members-based predicates (is_group_member/is_group_admin) instead.
--   service_role bypasses RLS (edge functions keep working).
--
-- Idempotent: drop-if-exists then create. Run in the Supabase SQL editor.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Canonical tenant predicates keyed on ministry_group_members (+ owner/leader).
--    SECURITY DEFINER so policies can consult membership without recursive RLS.
-- ---------------------------------------------------------------------
create or replace function public.is_group_member(p_ministry_id uuid, p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from ministry_group_members
    where ministry_id = p_ministry_id and user_id = p_user_id
  ) or exists (
    select 1 from ministry_groups
    where id = p_ministry_id and (owner_id = p_user_id or leader_id = p_user_id)
  );
$$;

create or replace function public.is_group_admin(p_ministry_id uuid, p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from ministry_group_members
    where ministry_id = p_ministry_id and user_id = p_user_id
      and (role in ('admin','moderator') or is_leader = true)
  ) or exists (
    select 1 from ministry_groups
    where id = p_ministry_id and (owner_id = p_user_id or leader_id = p_user_id)
  );
$$;

grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.is_group_admin(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- A. ministry_groups over-exposure (§3a red flag #1)
--    ministry_groups_select_all = USING (true) for public ORs with the stricter
--    policies -> everyone reads every ministry's billing/PII. Drop it; SELECT then
--    falls to ministry_groups_select_v2 (public+active OR owner/leader).
--    NOTE: RLS is row-level — public+active ministries still expose all columns.
--    A public-safe discovery VIEW (name/logo/handle only) is a follow-up.
-- ---------------------------------------------------------------------
drop policy if exists ministry_groups_select_all on public.ministry_groups;

-- ---------------------------------------------------------------------
-- B. ministries view must not bypass RLS (§3a red flag #2)
--    security_invoker off -> the billing view runs as owner, bypassing
--    ministry_groups RLS. Make it run as the caller.
-- ---------------------------------------------------------------------
alter view public.ministries set (security_invoker = on);

-- ---------------------------------------------------------------------
-- C. Enable RLS + tenant policies on the 13 tables that had RLS OFF
-- ---------------------------------------------------------------------

-- C1. Member-facing tenant tables: members read, admins write.
do $$
declare t text;
begin
  foreach t in array array[
    'ministry_invitations',
    'ministry_donation_campaigns',
    'ministry_flagged_content',
    'member_import_history',
    'prayer_campaigns'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_%s_member_sel on public.%I', t, t);
    execute format($f$create policy p_%s_member_sel on public.%I
      for select to authenticated
      using (public.is_group_member(ministry_id, auth.uid()))$f$, t, t);
    execute format('drop policy if exists p_%s_admin_all on public.%I', t, t);
    execute format($f$create policy p_%s_admin_all on public.%I
      for all to authenticated
      using (public.is_group_admin(ministry_id, auth.uid()))
      with check (public.is_group_admin(ministry_id, auth.uid()))$f$, t, t);
  end loop;
end $$;

-- C2. Admin-only: ministry_admin_access (who-can-admin grants — sensitive).
alter table public.ministry_admin_access enable row level security;
drop policy if exists p_min_admin_access_all on public.ministry_admin_access;
create policy p_min_admin_access_all on public.ministry_admin_access
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

-- C3. Personal: ministry_devotional_progress (per-member reading progress).
alter table public.ministry_devotional_progress enable row level security;
drop policy if exists p_min_dev_progress_own on public.ministry_devotional_progress;
create policy p_min_dev_progress_own on public.ministry_devotional_progress
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- C4. Platform/internal: RLS on; platform admins may read; no member access.
--     service_role bypasses RLS so edge-function writes keep working.
do $$
declare t text;
begin
  foreach t in array array[
    'ministry_analytics',
    'ministry_api_usage',
    'ministry_storage_usage',
    'platform_fees'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_%s_platform_sel on public.%I', t, t);
    execute format($f$create policy p_%s_platform_sel on public.%I
      for select to authenticated
      using ((select up.role from public.user_profiles up
              where up.user_id = auth.uid()) in ('super_admin','platform_admin'))$f$, t, t);
  end loop;
end $$;

-- C5. Backups: RLS on, NO policy -> deny all client access (service_role only).
alter table public.ministry_devotionals_backup enable row level security;
alter table public.ministry_prayer_library_backup enable row level security;

commit;

-- ---------------------------------------------------------------------
-- NOT changed here (need review — see audit doc):
--   * ministry_roles / translation_queue: RLS on but 0 policies (deny-all) — confirm
--     how the app reads them (likely service_role) before adding policies.
--   * Content-source boundary on content tables, LiveKit tenant-scoping (§3b),
--     ministry-messaging audience scoping (§3c), product marker.
-- ---------------------------------------------------------------------
