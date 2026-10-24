-- 0418_prayer_series_global_admin_write.sql
-- =====================================================================
-- Fix: admins get 406 (zero rows) when editing a GLOBAL prayer series.
--
-- 0151 left global-row writes to "Admins can manage prayer series" = is_admin(),
-- but is_admin() reads auth.users.raw_user_meta_data->>'role', which is unset for
-- our admins. The app's admin convention is user_profiles.role (is_content_admin).
-- So UPDATE ... WHERE ministry_id IS NULL matched no policy and returned no rows.
--
-- Add a global-row write policy keyed on is_content_admin, and a matching read so
-- admins can see unpublished global series (the update's RETURNING needs SELECT too).
-- Idempotent.
-- =====================================================================

begin;

drop policy if exists p_prayerseries_global_admin_write on public.prayer_series;
create policy p_prayerseries_global_admin_write on public.prayer_series for all to authenticated
  using (ministry_id is null and public.is_content_admin(auth.uid()))
  with check (ministry_id is null and public.is_content_admin(auth.uid()));

commit;
