-- 0394_feature_toggles.sql
-- =====================================================================
-- Admin feature toggles, by nav group (The Word, Prayer, Community, Live,
-- Small Groups, Ministry tools…).
--
--   * GLOBAL switches keep living in platform_settings (0266), one key per
--     group: feature_<key>_enabled. The consumer Ministries tab keeps its
--     original key, consumer_ministries_tab_enabled.
--   * PER-MINISTRY switches live here, in their own table, so a ministry's
--     leaders (who can update their own ministry_groups row, settings
--     included) cannot undo a platform admin's decision.
--
-- A group is shown only when the global switch AND the ministry's switch
-- allow it; a missing row means "on". Catalog: packages/features/src/
-- featureToggles.ts.
--
-- Also fixes the platform_settings write policy: it allowed super_admin and
-- platform_admin, but the live admin roles are admin and super_admin
-- (is_platform_admin()). The older admin_all_platform_settings policy
-- compared user_profiles.id to auth.uid(), which never matches (the auth id
-- is user_profiles.user_id), so an `admin` could open the Settings tab but
-- not save.
-- =====================================================================

begin;

-- ── platform_settings: one working admin write policy ─────────────────
drop policy if exists admin_all_platform_settings on public.platform_settings;
drop policy if exists p_platform_settings_admin_write on public.platform_settings;
create policy p_platform_settings_admin_write on public.platform_settings
  for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- ── Per-ministry overrides ─────────────────────────────────────────────
create table if not exists public.ministry_feature_overrides (
  ministry_id  uuid not null references public.ministry_groups(id) on delete cascade,
  feature_key  text not null,
  enabled      boolean not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id),
  primary key (ministry_id, feature_key)
);

alter table public.ministry_feature_overrides enable row level security;

-- Readable by everyone, like platform_settings: these only decide which nav
-- groups render, and the public join/space pages need them before sign-in.
drop policy if exists p_ministry_feature_overrides_select on public.ministry_feature_overrides;
create policy p_ministry_feature_overrides_select on public.ministry_feature_overrides
  for select to public
  using (true);

drop policy if exists p_ministry_feature_overrides_admin_write on public.ministry_feature_overrides;
create policy p_ministry_feature_overrides_admin_write on public.ministry_feature_overrides
  for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

commit;
