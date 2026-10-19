-- supabase/migrations/0400_shared_ministry_devotional_access.sql
--
-- A shared ministry devotional link lets the reader choose: join the ministry,
-- or just read the devotional with a free Rekindle account.
--
-- 1. Signed-in readers can read published ministry devotionals. Logged-out
--    visitors already could (anon_read_published_ministry_devotionals), but a
--    signed-in non-member could not, so "just read it" broke the moment they
--    signed up. Unpublished drafts stay limited to members and their authors.
-- 2. get_ministry_join_slug(mid) gives the preview the ministry's slug for its
--    public /join/<slug> page (the slug is already in every join link), without
--    opening the rest of ministry_groups.

drop policy if exists authenticated_read_published_ministry_devotionals on public.ministry_devotionals;
create policy authenticated_read_published_ministry_devotionals
  on public.ministry_devotionals
  for select
  to authenticated
  using (is_published = true);

create or replace function public.get_ministry_join_slug(mid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select slug from public.ministry_groups where id = mid;
$$;

grant execute on function public.get_ministry_join_slug(uuid) to anon, authenticated;
