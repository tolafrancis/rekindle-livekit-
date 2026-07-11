-- 0151_rls_content_source_boundary.sql
-- =====================================================================
-- Phase 4 — content-source RLS boundary. Enforces "a church sees GLOBAL content
-- + its OWN content, never another church's owned content" (docs content-source-model).
--
-- Fixes cross-tenant leaks found in the content audit:
--   * ministry_devotionals: a temp USING(auth.uid() IS NOT NULL) policy exposed ALL
--     ministries' devotionals to any logged-in user.
--   * ministry_prayer_library: "members can view" was USING(true).
--   * declarations / devotional_series / prayer_series (ministry_id column): USING(true)
--     reads/writes exposed ministry-owned rows cross-tenant.
--
-- Model per table:
--   ministry_id-column: global rows (ministry_id IS NULL) readable per their published
--     flag; ministry-owned rows readable only by is_group_member, writable by
--     is_group_admin; global rows writable by platform admins.
--   paired ministry_* table: readable/writable only within the owning ministry.
--
-- Depends on is_group_member/is_group_admin from 0150. Idempotent. REVIEW before apply.
-- =====================================================================

begin;

-- Global content authoring uses the existing user_profiles.role convention
-- (matches the book_summaries/devotionals admin policies). Inlined below as
-- is_content_admin() to avoid colliding with the existing platform_admins-based
-- is_platform_admin(uuid).
create or replace function public.is_content_admin(p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from user_profiles
    where user_id = p_user_id and role in ('admin','super_admin'));
$$;
grant execute on function public.is_content_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- A. paired ministry_* tables — tenant-scoped only
-- ---------------------------------------------------------------------
-- ministry_devotionals: remove the temp cross-tenant all-access leak.
-- (Proper policies remain: members view, leaders manage, creator views, anon published.)
drop policy if exists temp_authenticated_users_all_access on public.ministry_devotionals;

-- ministry_prayer_library: "members can view" was USING(true) -> scope to members.
drop policy if exists "Ministry members can view prayer library" on public.ministry_prayer_library;
create policy p_min_prayerlib_member_read on public.ministry_prayer_library
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

-- ---------------------------------------------------------------------
-- B. ministry_id-column tables — global (NULL) vs ministry-owned
-- ---------------------------------------------------------------------

-- B1. declarations
drop policy if exists declarations_read on public.declarations;            -- USING(true) leak
drop policy if exists declarations_write on public.declarations;           -- USING(true) leak
drop policy if exists "Declarations are viewable by everyone" on public.declarations;
create policy p_declarations_global_read on public.declarations for select to public
  using (ministry_id is null and coalesce(is_published, true) = true);
create policy p_declarations_ministry_read on public.declarations for select to authenticated
  using (ministry_id is not null and public.is_group_member(ministry_id, auth.uid()));
create policy p_declarations_ministry_write on public.declarations for all to authenticated
  using (ministry_id is not null and public.is_group_admin(ministry_id, auth.uid()))
  with check (ministry_id is not null and public.is_group_admin(ministry_id, auth.uid()));
create policy p_declarations_global_write on public.declarations for all to authenticated
  using (ministry_id is null and public.is_content_admin(auth.uid()))
  with check (ministry_id is null and public.is_content_admin(auth.uid()));

-- B2. devotional_series
drop policy if exists "Enable read access for all users" on public.devotional_series;  -- authenticated read-all leak
drop policy if exists "Anyone can view published devotional series" on public.devotional_series;
create policy p_devseries_global_read on public.devotional_series for select to public
  using (ministry_id is null and is_published = true);
create policy p_devseries_ministry_read on public.devotional_series for select to authenticated
  using (ministry_id is not null and public.is_group_member(ministry_id, auth.uid()));
create policy p_devseries_ministry_write on public.devotional_series for all to authenticated
  using (ministry_id is not null and public.is_group_admin(ministry_id, auth.uid()))
  with check (ministry_id is not null and public.is_group_admin(ministry_id, auth.uid()));
-- ("Admins can manage devotional series" = is_admin() remains for global rows.)

-- B3. prayer_series
drop policy if exists "Anyone can read prayer series" on public.prayer_series;
drop policy if exists "Anyone can view published prayer series" on public.prayer_series;
drop policy if exists "Admins can manage series" on public.prayer_series;   -- USING(true) write leak
create policy p_prayerseries_global_read on public.prayer_series for select to public
  using (ministry_id is null and is_published = true);
create policy p_prayerseries_ministry_read on public.prayer_series for select to authenticated
  using (ministry_id is not null and public.is_group_member(ministry_id, auth.uid()));
create policy p_prayerseries_ministry_write on public.prayer_series for all to authenticated
  using (ministry_id is not null and public.is_group_admin(ministry_id, auth.uid()))
  with check (ministry_id is not null and public.is_group_admin(ministry_id, auth.uid()));
-- ("Admins can manage prayer series" = is_admin() remains for global rows.)

commit;

-- ---------------------------------------------------------------------
-- Follow-ups (not here): global-content WRITE vandalism (affirmations_write,
-- prayer_topics public_write_* = USING(true) let any authed user edit global content)
-- -> restrict to is_platform_admin. Low read-risk but verify no app path writes them
-- as a normal user first. Streams: ministry_devotional_settings read is USING(true)
-- (low-risk: just which stream a church shows) — scope later.
-- ---------------------------------------------------------------------
