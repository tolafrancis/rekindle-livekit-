-- =====================================================================
-- Platform Admin RLS repair — idempotent
--
-- Root cause: ministry_groups_update_v2 has no admin clause, so every
-- write from the platform admin panel's Ministries tab (approve, reject,
-- suspend, activate, verify, risk level, platform notes) silently
-- affects 0 rows for a platform admin (they're never owner_id/leader_id)
-- with no error returned — the UI reports success while nothing changes.
--
-- Same investigation also found: platform_announcements/
-- ministry_white_label_settings RLS calls is_platform_admin(uuid), which
-- checks the dead/empty `platform_admins` table (redefined below to
-- check user_profiles.role instead — the same source the client already
-- uses); platform_fees has a SELECT policy only (no write policy at
-- all); ministry_flagged_content's admin policy only recognizes
-- per-ministry group admins, not platform admins; ministry_subscriptions
-- and ministry_support_tickets UPDATE policies are wide open
-- (qual = true) to any authenticated user instead of being admin-gated;
-- ministry_audit_logs INSERT is wide open to any actor_id.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Canonical admin-check helper. Redefines the EXISTING
--    is_platform_admin(uuid) — currently checks the dead, empty
--    `platform_admins` table — to check user_profiles.role instead,
--    matching what the client already uses (profile?.role === 'admin'
--    || 'super_admin') and what is_content_admin/is_admin(uuid)
--    separately, redundantly implement. This redefinition alone also
--    repairs every existing policy that already calls
--    is_platform_admin(auth.uid()) — platform_announcements and
--    ministry_white_label_settings — with no further changes needed
--    on those two.
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin(user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_profiles
    where user_id = user_uuid
      and role in ('admin', 'super_admin')
  );
$$;

-- ---------------------------------------------------------------------
-- 2. ministry_groups — add the missing admin UPDATE path.
--    (Root cause of the Approve/Reject/Suspend/Activate/Verify/Risk/
--    Notes bug.)
-- ---------------------------------------------------------------------
drop policy if exists ministry_groups_update_v2 on ministry_groups;
create policy ministry_groups_update_v2 on ministry_groups
  for update
  using (owner_id = auth.uid() or leader_id = auth.uid() or is_platform_admin(auth.uid()))
  with check (owner_id = auth.uid() or leader_id = auth.uid() or is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 3. platform_fees — had SELECT only. Add admin write policy so
--    "Mark as Collected" can actually persist.
-- ---------------------------------------------------------------------
drop policy if exists p_platform_fees_platform_upd on platform_fees;
create policy p_platform_fees_platform_upd on platform_fees
  for update
  using (is_platform_admin(auth.uid()))
  with check (is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 4. ministry_flagged_content — the existing "admin_all" policy only
--    recognizes per-ministry group admins/leaders (is_group_admin). Add
--    a platform-admin fallback so a platform admin can moderate flagged
--    content on ANY ministry, not just ones they personally belong to.
-- ---------------------------------------------------------------------
drop policy if exists p_ministry_flagged_content_admin_all on ministry_flagged_content;
create policy p_ministry_flagged_content_admin_all on ministry_flagged_content
  for all
  using (is_group_admin(ministry_id, auth.uid()) or is_platform_admin(auth.uid()))
  with check (is_group_admin(ministry_id, auth.uid()) or is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 5. ministry_subscriptions — was wide open (qual/with_check = true)
--    to ANY authenticated user for insert/update. Scope to platform
--    admins only.
-- ---------------------------------------------------------------------
drop policy if exists "Ministry admins can insert subscriptions" on ministry_subscriptions;
drop policy if exists "Ministry admins can update subscriptions" on ministry_subscriptions;
create policy p_ministry_subscriptions_admin_write on ministry_subscriptions
  for all
  using (is_platform_admin(auth.uid()))
  with check (is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 6. ministry_support_tickets — UPDATE was wide open (qual = true) to
--    ANY authenticated user. Scope to platform admins only. (Ticket
--    creation by ordinary members is untouched — separate INSERT policy
--    already scoped correctly to the ticket creator.)
-- ---------------------------------------------------------------------
drop policy if exists "Admins can update support tickets" on ministry_support_tickets;
create policy p_ministry_support_tickets_admin_upd on ministry_support_tickets
  for update
  using (is_platform_admin(auth.uid()))
  with check (is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 7. ministry_audit_logs — INSERT was wide open (with_check = true) to
--    anyone, allowing a forged audit trail (wrong actor_id). Require
--    the actor to be the authenticated caller.
-- ---------------------------------------------------------------------
drop policy if exists "System can insert audit logs" on ministry_audit_logs;
create policy p_ministry_audit_logs_insert on ministry_audit_logs
  for insert
  with check (actor_id = auth.uid());

commit;
