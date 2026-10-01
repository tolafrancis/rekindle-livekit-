-- =====================================================================
-- content_submissions: track what an approved submission got published
-- as, so the admin queue can link straight to the live entry instead of
-- just showing "approved". Nullable — older/unpublished rows are unaffected.
-- =====================================================================

begin;

alter table public.content_submissions
  add column if not exists published_table text
    check (published_table in ('book_summaries', 'devotional_series', 'prayer_series')),
  add column if not exists published_id uuid;

commit;
