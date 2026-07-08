-- supabase/migrations/0051_content_translations_columns.sql
-- Phase 3 (content translation) — add the `translations` JSONB column to the
-- durable content tables that lack it, so per-language content can be stored the
-- same way it already is on devotionals / ministry_devotionals / prayer_points /
-- prayer_library / prayer_topics / ministry_announcements (shape:
--   translations = { "<langCode>": { "<field>": "<translated value>", ... } }
--
-- Idempotent (IF NOT EXISTS / IF EXISTS). Paste into the Supabase SQL Editor.

-- Tables identified in the Phase 0 audit as missing `translations`:
alter table if exists public.affirmations    add column if not exists translations jsonb;
alter table if exists public.declarations     add column if not exists translations jsonb;
alter table if exists public.book_summaries   add column if not exists translations jsonb;
alter table if exists public.prayer_series    add column if not exists translations jsonb;

-- GIN indexes so the presence of a given language key can be filtered cheaply
-- (mirrors how DevotionalSeriesViewer queries translations->>'{lang}').
create index if not exists idx_affirmations_translations   on public.affirmations   using gin (translations);
create index if not exists idx_declarations_translations    on public.declarations    using gin (translations);
create index if not exists idx_book_summaries_translations  on public.book_summaries  using gin (translations);

-- prayer_series may not exist in every environment; guard the index too.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'prayer_series'
               and column_name = 'translations') then
    execute 'create index if not exists idx_prayer_series_translations on public.prayer_series using gin (translations)';
  end if;
end $$;
