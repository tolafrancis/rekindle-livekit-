-- =====================================================================
-- content_submissions: add 'daily_devotional' as its own content type,
-- separate from 'devotional_series' (a single entry, not a multi-day
-- series — same real fields as one Entry row in devotional series
-- creator, just not wrapped in a series). The `days` jsonb column already
-- holds a flexible per-entry shape (0378) — a daily devotional is simply
-- stored as a single-element `days` array, no column changes needed.
-- =====================================================================

begin;

alter table public.content_submissions drop constraint if exists content_submissions_content_type_check;
alter table public.content_submissions add constraint content_submissions_content_type_check
  check (content_type in ('book', 'daily_devotional', 'devotional_series', 'prayer_series'));

commit;
