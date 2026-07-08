-- supabase/migrations/0019_curate_devotional_categories.sql
-- Targeted devotional-category curation requested after the 0017 standardization:
--   * Remove the fire/flame icon from "Spiritual Disciplines".
--   * Rename "Foundation Stage (New Believers)" -> "New Believers".
--   * Rename "Grace and Redemption" -> "Redemption".
--   * Remove duplicate categories (Prayer Life, Prayer and Worship, Bible Study,
--     Scripture Study, Faith Foundations, Mind and Spiritual Growth,
--     Users Discipleship, Biblical Study). Any series filed under them are left
--     uncategorized (category_id = null) so no devotional content is lost.
--
-- All matching is case-insensitive so it works whether or not 0017 has run.
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.

-- 1) Drop the fire icon on Spiritual Disciplines (keep the row, clear its icon).
update public.devotional_categories
set icon = ''
where lower(btrim(name)) = 'spiritual disciplines';

-- 2) Rename "Foundation Stage (New Believers)" -> "New Believers"
--    (merge into an existing "New Believers" if one is already present).
do $$
declare
  src uuid;
  tgt uuid;
begin
  select id into src
  from public.devotional_categories
  where lower(btrim(name)) like 'foundation stage%new believ%'
  limit 1;
  if src is null then return; end if;

  select id into tgt
  from public.devotional_categories
  where lower(btrim(name)) = 'new believers' and id <> src
  limit 1;

  if tgt is not null then
    update public.devotional_series set category_id = tgt where category_id = src;
    delete from public.devotional_categories where id = src;
  else
    update public.devotional_categories set name = 'New Believers' where id = src;
  end if;
end $$;

-- 3) Rename "Grace and Redemption" -> "Redemption"
--    (merge into an existing "Redemption" if one is already present).
do $$
declare
  src uuid;
  tgt uuid;
begin
  select id into src
  from public.devotional_categories
  where lower(btrim(name)) = 'grace and redemption'
  limit 1;
  if src is null then return; end if;

  select id into tgt
  from public.devotional_categories
  where lower(btrim(name)) = 'redemption' and id <> src
  limit 1;

  if tgt is not null then
    update public.devotional_series set category_id = tgt where category_id = src;
    delete from public.devotional_categories where id = src;
  else
    update public.devotional_categories set name = 'Redemption' where id = src;
  end if;
end $$;

-- 4) Remove duplicate categories. Allow uncategorized series, repoint them off
--    the doomed categories, then delete the categories.
alter table public.devotional_series alter column category_id drop not null;

update public.devotional_series
set category_id = null
where category_id in (
  select id from public.devotional_categories
  where lower(btrim(name)) in (
    'prayer life',
    'prayer and worship',
    'bible study',
    'scripture study',
    'faith foundations',
    'mind and spiritual growth',
    'users discipleship',
    'biblical study'
  )
);

delete from public.devotional_categories
where lower(btrim(name)) in (
  'prayer life',
  'prayer and worship',
  'bible study',
  'scripture study',
  'faith foundations',
  'mind and spiritual growth',
  'users discipleship',
  'biblical study'
);
