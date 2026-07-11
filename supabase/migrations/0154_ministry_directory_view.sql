-- 0154_ministry_directory_view.sql
-- =====================================================================
-- Phase 4 — close the last §3a residual: column-level PII on public ministries.
-- RLS is row-level, so the public-discovery policies on ministry_groups exposed
-- ALL columns (tax_id, legal_name, contact_email, subscription_status, risk_level,
-- owner/leader ids, settings, …) of every public+active ministry to everyone.
--
-- Fix = the one thing RLS can't do: a public-safe VIEW with only discovery columns,
-- + restrict the base table to owner/leader/member/platform-admin. Discovery reads
-- go through ministry_directory (repointed in MinistriesHub).
-- =====================================================================

begin;

-- Public directory: only non-PII columns, only public+active ministries. Runs as the
-- view owner (security_invoker OFF, default) so it serves the directory regardless of
-- the caller's base-table RLS — but it can NEVER expose PII (columns excluded) or a
-- private ministry (WHERE filter). Do NOT set security_invoker=on here.
create or replace view public.ministry_directory as
  select id, name, description, category, location, country, welcome_message,
         logo_url, banner_url, is_public, is_active, join_method, theme_color,
         member_count, approval_status, created_at, slug
  from public.ministry_groups
  where is_public = true and is_active = true;

grant select on public.ministry_directory to anon, authenticated;

-- Restrict the base table: drop the public-exposing SELECT policies. Authenticated
-- users read the FULL columns only of ministries they own/lead/belong to; platform
-- admins read all. (ministry_groups_select_all was already dropped in 0150.)
drop policy if exists public_ministries on public.ministry_groups;
drop policy if exists ministry_groups_select_v2 on public.ministry_groups;
drop policy if exists ministry_groups_member_read on public.ministry_groups;
create policy ministry_groups_member_read on public.ministry_groups
  for select to authenticated
  using (
    owner_id = auth.uid()
    or leader_id = auth.uid()
    or exists (
      select 1 from public.ministry_group_members m
      where m.group_id = ministry_groups.id and m.user_id = auth.uid()
    )
    or public.is_content_admin(auth.uid())
  );

commit;

-- Anon name lookups keep working via get_ministry_name() (SECURITY DEFINER, 0024).
-- App: MinistriesHub.loadMinistries now reads ministry_directory (repointed).
