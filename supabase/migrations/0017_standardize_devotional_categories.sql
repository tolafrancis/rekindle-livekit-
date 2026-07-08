-- supabase/migrations/0017_standardize_devotional_categories.sql
-- Standardize devotional category names directly in the database so the cleaned
-- values are the single source of truth (admin editors, filters, badges all read
-- the same canonical text).
--
-- devotional_categories.name has a UNIQUE constraint, so we must MERGE duplicates
-- BEFORE renaming — otherwise re-casing e.g. "DISCIPLESHIP" to "Discipleship"
-- collides with an existing "Discipleship". A single normalization function is
-- used both to group duplicates and to write the final name, so the two stages
-- always agree.
--
-- Normalization rules:
--   * Trim and collapse whitespace.
--   * Canonical renames: Youth/Youths/Youth Ministry -> "Youth Affairs";
--     Spiritual Discipline(s) -> "Spiritual Disciplines".
--   * Title-case names that are entirely UPPER- or entirely lower-case
--     ("SPIRITUAL DISCIPLINES" -> "Spiritual Disciplines"); deliberately
--     mixed-case names (e.g. "God's Love") are left as-is.
--   * Repair the initcap possessive artifact ("God'S" -> "God's").
--
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.

-- Shared, idempotent normalizer (session-local temp function).
create or replace function pg_temp.norm_cat(p text)
returns text
language plpgsql
immutable
as $$
declare
  v   text := regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g');
  low text := lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'));
begin
  if v = '' then
    return v;
  end if;

  -- Canonical renames (case-insensitive).
  if low in ('youth', 'youths', 'youth affair', 'youth ministry') then
    return 'Youth Affairs';
  end if;
  if low in ('spiritual discipline', 'spiritual disciplines') then
    return 'Spiritual Disciplines';
  end if;

  -- Title-case only shouty / sloppy entries; keep intentional mixed case.
  if v = upper(v) or v = lower(v) then
    v := initcap(low);
    v := regexp_replace(v, '([A-Za-z])''S\M', '\1''s', 'g');  -- God'S -> God's
  end if;

  return v;
end;
$$;

-- 1) Repoint series off duplicate categories onto the surviving "keeper" row
--    (the one with the lowest display_order, then lowest id, per normalized name).
update public.devotional_series s
set category_id = k.keeper_id
from (
  select
    id,
    first_value(id) over (
      partition by pg_temp.norm_cat(name)
      order by coalesce(display_order, 2147483647), id
    ) as keeper_id
  from public.devotional_categories
) k
where s.category_id = k.id
  and k.id <> k.keeper_id;

-- 2) Delete the duplicate (non-keeper) category rows. A row is a duplicate when
--    another row in the same normalized group sorts ahead of it.
delete from public.devotional_categories c
where exists (
  select 1
  from public.devotional_categories o
  where o.id <> c.id
    and pg_temp.norm_cat(o.name) = pg_temp.norm_cat(c.name)
    and (coalesce(o.display_order, 2147483647), o.id)
        < (coalesce(c.display_order, 2147483647), c.id)
);

-- 3) Write the normalized name onto the surviving rows. They are now unique per
--    normalized name, so the UNIQUE constraint on name holds.
update public.devotional_categories
set name = pg_temp.norm_cat(name)
where name is not null
  and name <> pg_temp.norm_cat(name);
