-- 0155_rls_member_profiles_group_admin.sql
-- =====================================================================
-- Phase 5 — admin CSV bulk import. importCSVMembers() writes contact records to
-- ministry_member_profiles, but that table's write policy (mmp_leader) uses
-- is_ministry_leader(ministry_id), which only recognizes the SINGLE
-- ministry_groups.owner_id/leader_id — a ministry's other admins/leaders (recorded
-- in ministry_group_members, the app's canonical membership) are denied, so they
-- cannot import. Add a group-admin write policy (permissive, ORs with the existing
-- ones) keyed on is_group_admin — consistent with ministry_invitations (0150).
-- Idempotent. mmp_self (user_id = auth.uid()) and mmp_leader stay.
-- =====================================================================

begin;

drop policy if exists p_mmp_group_admin on public.ministry_member_profiles;
create policy p_mmp_group_admin on public.ministry_member_profiles
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

commit;

-- Follow-up (broader member management, not this migration): ministry_group_members
-- admin write policies key off GLOBAL user_profiles.role, so a ministry admin who is
-- not a platform admin can't change other members' roles via RLS. Re-scope those to
-- is_group_admin(ministry_id, uid) when hardening member management.
