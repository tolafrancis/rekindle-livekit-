-- =============================================================================
-- ensure-translations-column.sql
-- =============================================================================
-- Guarantees a `translations` jsonb column on every content table the
-- translation worker writes to (process-translation-queue → CONTENT_TABLE_MAP).
-- The worker does `update({ translations })` on the content row; if the column
-- is missing the update errors and the item fails silently, so run this once.
--
-- Safe to re-run: only alters tables that EXIST, and only adds the column when
-- ABSENT (add column if not exists). Paste into the Supabase SQL editor → Run.
-- =============================================================================

-- 1) Add the column wherever it's missing (skips tables that don't exist).
do $$
declare
  t text;
  content_tables text[] := array[
    'devotionals',
    'ministry_devotionals',
    'prayer_points',
    'prayer_library',
    'ministry_announcements',
    'book_summaries',
    'prayer_series',
    'devotional_series',
    'devotional_entries',
    'affirmations',
    'declarations',
    'prayer_topics'
  ];
begin
  foreach t in array content_tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format(
        'alter table public.%I add column if not exists translations jsonb default ''{}''::jsonb',
        t
      );
      raise notice 'OK: ensured translations column on public.%', t;
    else
      raise notice 'SKIP: table public.% does not exist (no content type maps here)', t;
    end if;
  end loop;
end $$;

-- 2) Verify — one row per content table: does it exist, and does it have the column?
select
  x.table_name,
  (tbl.table_name is not null)              as table_exists,
  (col.column_name is not null)             as has_translations_column,
  col.data_type
from (values
  ('devotionals'),('ministry_devotionals'),('prayer_points'),('prayer_library'),
  ('ministry_announcements'),('book_summaries'),('prayer_series'),('devotional_series'),
  ('devotional_entries'),('affirmations'),('declarations'),('prayer_topics')
) as x(table_name)
left join information_schema.tables tbl
  on tbl.table_schema = 'public' and tbl.table_name = x.table_name
left join information_schema.columns col
  on col.table_schema = 'public'
 and col.table_name  = x.table_name
 and col.column_name = 'translations'
order by has_translations_column nulls first, table_exists, x.table_name;

-- 3) Sanity check the queue INFRASTRUCTURE tables exist (created by the
--    multilingual migrations). If any is false, the queue system can't run.
select y.table_name,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = y.table_name
  ) as exists
from (values
  ('translation_queue'),
  ('content_translation_status'),
  ('content_popularity')
) as y(table_name)
order by y.table_name;
