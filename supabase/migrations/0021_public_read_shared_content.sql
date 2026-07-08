-- supabase/migrations/0021_public_read_shared_content.sql
-- Let logged-out (anon) visitors read PUBLISHED shared content so a shared link
-- can show a free-taste preview before sign-up (SharedContentPreview).
--
-- Safe by design: these policies are scoped `to anon` and only ADD read access
-- for published rows. They do NOT enable/disable RLS and do NOT touch the
-- authenticated role or any write policies — so admin/app behaviour is unchanged.
-- (If a table has RLS disabled, the policy is simply inert and anon already reads.)
--
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.

begin;

-- Devotional series (metadata + hero)
drop policy if exists "anon_read_published_devotional_series" on public.devotional_series;
create policy "anon_read_published_devotional_series"
  on public.devotional_series
  for select
  to anon
  using (is_published = true);

-- Devotional entries — only days that belong to a published series (Day 1 taste)
drop policy if exists "anon_read_published_devotional_entries" on public.devotional_entries;
create policy "anon_read_published_devotional_entries"
  on public.devotional_entries
  for select
  to anon
  using (
    exists (
      select 1 from public.devotional_series s
      where s.id = devotional_entries.series_id and s.is_published = true
    )
  );

-- Prayer series (metadata preview)
drop policy if exists "anon_read_published_prayer_series" on public.prayer_series;
create policy "anon_read_published_prayer_series"
  on public.prayer_series
  for select
  to anon
  using (is_published = true);

-- Book summaries (intro taste). is_published may be absent on older rows.
drop policy if exists "anon_read_published_books" on public.book_summaries;
create policy "anon_read_published_books"
  on public.book_summaries
  for select
  to anon
  using (coalesce(is_published, true) = true);

commit;
