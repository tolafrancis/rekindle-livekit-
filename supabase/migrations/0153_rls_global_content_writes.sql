-- 0153_rls_global_content_writes.sql
-- =====================================================================
-- Phase 4 — close global-content WRITE vandalism. Several global content tables
-- carry redundant USING(true) / auth.role()='authenticated' write policies next to
-- proper admin policies, so ANY authenticated user can insert/update/delete global
-- content (affirmations, devotionals, books, prayer points/topics/library, series days).
-- Global content authoring is admin-only in the app, so dropping the open writes is
-- safe; READS are unaffected (separate SELECT policies remain). Uses is_content_admin
-- (0151) where a table's only write path was the open policy. Idempotent. REVIEW.
-- =====================================================================

begin;

-- affirmations — proper *_admin write policies remain.
drop policy if exists affirmations_write  on public.affirmations;
drop policy if exists affirmations_delete on public.affirmations;
drop policy if exists affirmations_insert on public.affirmations;
drop policy if exists affirmations_update on public.affirmations;

-- book_summaries — "Admins can manage book summaries" (user_profiles.role) remains.
drop policy if exists "Admins can manage all books" on public.book_summaries;
drop policy if exists book_summaries_delete on public.book_summaries;
drop policy if exists book_summaries_insert on public.book_summaries;
drop policy if exists book_summaries_update on public.book_summaries;

-- devotionals (GLOBAL) — devotionals_*_admin remain.
drop policy if exists devotionals_delete       on public.devotionals;
drop policy if exists devotionals_insert       on public.devotionals;
drop policy if exists public_insert_devotionals on public.devotionals;
drop policy if exists devotionals_update       on public.devotionals;
drop policy if exists public_update_devotionals on public.devotionals;

-- prayer_points — prayer_points_*_admin remain.
drop policy if exists prayer_points_delete on public.prayer_points;
drop policy if exists prayer_points_insert on public.prayer_points;
drop policy if exists prayer_points_update on public.prayer_points;

-- prayer_topics — drop open ALL, ensure an admin write (covers admin + super_admin).
drop policy if exists public_write_prayer_topics on public.prayer_topics;
drop policy if exists p_prayer_topics_admin_write on public.prayer_topics;
create policy p_prayer_topics_admin_write on public.prayer_topics for all to authenticated
  using (public.is_content_admin(auth.uid())) with check (public.is_content_admin(auth.uid()));

-- prayer_library — "Admins can manage library" was USING(true) (its only write path).
drop policy if exists "Admins can manage library" on public.prayer_library;
drop policy if exists p_prayer_library_admin_write on public.prayer_library;
create policy p_prayer_library_admin_write on public.prayer_library for all to authenticated
  using (public.is_content_admin(auth.uid())) with check (public.is_content_admin(auth.uid()));

-- prayer_series_days — the ONLY policy was an authenticated-any ALL (read+write).
-- Split it: keep read for authenticated, restrict writes to admins.
drop policy if exists "Authenticated users can manage prayer days" on public.prayer_series_days;
drop policy if exists p_prayer_series_days_read on public.prayer_series_days;
create policy p_prayer_series_days_read on public.prayer_series_days for select to authenticated
  using (true);
drop policy if exists p_prayer_series_days_admin_write on public.prayer_series_days;
create policy p_prayer_series_days_admin_write on public.prayer_series_days for all to authenticated
  using (public.is_content_admin(auth.uid())) with check (public.is_content_admin(auth.uid()));

commit;

-- Follow-up: prayer_series_days has no ministry_id — if ministries author prayer
-- series, their days would be admin-only (not ministry-admin) and authenticated-readable.
-- Scope to the parent series' ministry when ministry-owned series exist.
