-- supabase/migrations/0025_public_read_ministry_prayers.sql
-- Let logged-out (anon) visitors read ACTIVE ministry prayers so a shared
-- ministry-prayer link can show a free-taste preview before sign-up.
--
-- Same safety model as 0021-0023: scoped `to anon`, active rows only, RLS not
-- enabled/disabled, write/authenticated behaviour untouched.
--
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.

begin;

drop policy if exists "anon_read_active_ministry_prayers" on public.ministry_prayer_library;
create policy "anon_read_active_ministry_prayers"
  on public.ministry_prayer_library
  for select
  to anon
  using (is_active = true);

commit;
