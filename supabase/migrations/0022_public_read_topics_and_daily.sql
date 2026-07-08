-- supabase/migrations/0022_public_read_topics_and_daily.sql
-- Extend the shared-content preview to prayer topics and daily devotionals:
-- let logged-out (anon) visitors read PUBLISHED rows so a shared link can show a
-- free-taste preview before sign-up.
--
-- Same safety model as 0021: policies are scoped `to anon` and only ADD read
-- access for published rows. RLS is not enabled/disabled here and write/
-- authenticated behaviour is untouched.
--
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.

begin;

-- Prayer topics (title, scripture, prayer points preview)
drop policy if exists "anon_read_published_prayer_topics" on public.prayer_topics;
create policy "anon_read_published_prayer_topics"
  on public.prayer_topics
  for select
  to anon
  using (is_published = true);

-- Daily devotionals (single-day shares from the Daily Devotional widget)
drop policy if exists "anon_read_published_devotionals" on public.devotionals;
create policy "anon_read_published_devotionals"
  on public.devotionals
  for select
  to anon
  using (is_published = true);

commit;
