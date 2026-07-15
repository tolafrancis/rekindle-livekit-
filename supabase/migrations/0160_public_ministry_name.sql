-- 0160_public_ministry_name.sql
-- =====================================================================
-- The public meeting-join page (guest access) must show the hosting Ministry's
-- name, but ministry_groups (the canonical name) is not readable by the anon
-- role (RLS is member-scoped). The join page previously read the stale
-- `ministries` mirror table and fell back to "Unknown Host" whenever that row
-- was missing.
--
-- This security-definer function exposes ONLY the ministry name to anon (no
-- other ministry_groups columns / settings leak), sourced from the canonical
-- ministry_groups table with a fallback to the legacy `ministries` mirror.
-- =====================================================================

begin;

create or replace function public.public_ministry_name(p_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select name from public.ministry_groups where id = p_id),
    (select name from public.ministries      where id = p_id)
  );
$$;

grant execute on function public.public_ministry_name(uuid) to anon, authenticated;

commit;
