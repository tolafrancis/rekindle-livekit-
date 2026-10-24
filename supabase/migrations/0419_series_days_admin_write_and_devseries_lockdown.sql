-- 0419_series_days_admin_write_and_devseries_lockdown.sql
-- =====================================================================
-- Follow-up to 0418, same root cause plus one leftover write leak.
--
-- 1. devotional_series (global rows), devotional_days, prayer_days: the only admin
--    write path is is_admin(), which reads auth user metadata that our admins don't
--    have. Add FOR ALL policies keyed on is_content_admin (user_profiles.role), like
--    0418 did for prayer_series. FOR ALL also lets admins read unpublished rows.
-- 2. devotional_series still carries "Enable insert/update/delete for authenticated
--    users" (USING/WITH CHECK true), so any signed-in user can create, edit or delete
--    any series, global or another ministry's. Only the admin screens write this
--    table, so drop them. Ministry-owned rows keep p_devseries_ministry_write (0151).
--
-- The old is_admin() policies are left in place (harmless). Idempotent.
-- =====================================================================

begin;

-- devotional_series
drop policy if exists "Enable insert for authenticated users" on public.devotional_series;
drop policy if exists "Enable update for authenticated users" on public.devotional_series;
drop policy if exists "Enable delete for authenticated users" on public.devotional_series;

drop policy if exists p_devseries_global_admin_write on public.devotional_series;
create policy p_devseries_global_admin_write on public.devotional_series for all to authenticated
  using (ministry_id is null and public.is_content_admin(auth.uid()))
  with check (ministry_id is null and public.is_content_admin(auth.uid()));

-- devotional_days
drop policy if exists p_devotional_days_admin_write on public.devotional_days;
create policy p_devotional_days_admin_write on public.devotional_days for all to authenticated
  using (public.is_content_admin(auth.uid())) with check (public.is_content_admin(auth.uid()));

-- prayer_days
drop policy if exists p_prayer_days_admin_write on public.prayer_days;
create policy p_prayer_days_admin_write on public.prayer_days for all to authenticated
  using (public.is_content_admin(auth.uid())) with check (public.is_content_admin(auth.uid()));

commit;
