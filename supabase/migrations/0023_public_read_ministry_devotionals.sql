-- supabase/migrations/0023_public_read_ministry_devotionals.sql
-- Let logged-out (anon) visitors read PUBLISHED ministry devotionals so a shared
-- ministry-devotional link can show a free-taste preview before sign-up.
--
-- Same safety model as 0021/0022: scoped `to anon`, published rows only, RLS not
-- enabled/disabled, write/authenticated behaviour untouched.
--
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.

begin;

drop policy if exists "anon_read_published_ministry_devotionals" on public.ministry_devotionals;
create policy "anon_read_published_ministry_devotionals"
  on public.ministry_devotionals
  for select
  to anon
  using (is_published = true);

commit;
