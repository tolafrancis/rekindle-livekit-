-- supabase/migrations/0024_get_ministry_name.sql
-- Expose ONLY a ministry's display name to logged-out visitors, so the shared
-- ministry-devotional preview can show which ministry it's from — without
-- opening up the rest of the ministries table to anon.
--
-- A SECURITY DEFINER function returns just the name (no owner_id, settings, etc.).
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.

create or replace function public.get_ministry_name(mid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select name from public.ministries where id = mid;
$$;

grant execute on function public.get_ministry_name(uuid) to anon, authenticated;
