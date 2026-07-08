-- =============================================================================
-- ensure-translation-queue-unique.sql
-- =============================================================================
-- Belt-and-suspenders guard against DUPLICATE in-flight translation rows.
-- The app already skips (content,language) pairs that are completed or in
-- flight (process-translation-queue → queueContentForTranslation / queueAllContent),
-- but a race (two clicks / a click during the hourly cron) could still insert two
-- 'pending' rows for the same (content_type, content_id, target_language).
--
-- This adds a PARTIAL unique index that only constrains rows still in flight
-- (status pending/processing). Completed & failed rows are NOT constrained, so
-- re-translating the same pair later (e.g. after a content edit) is still allowed
-- and historical rows are preserved.
--
-- Safe to re-run. Paste into the Supabase SQL editor → Run.
-- =============================================================================

-- 1) Remove any EXISTING duplicate in-flight rows first, else the index can't be
--    created. Keep the oldest row per (content_type, content_id, target_language)
--    that is pending/processing; delete the rest.
with ranked as (
  select
    id,
    row_number() over (
      partition by content_type, content_id, target_language
      order by created_at asc, id asc
    ) as rn
  from public.translation_queue
  where status in ('pending', 'processing')
)
delete from public.translation_queue q
using ranked r
where q.id = r.id
  and r.rn > 1;

-- 2) Partial unique index — one in-flight row per (content, language).
create unique index if not exists translation_queue_inflight_uniq
  on public.translation_queue (content_type, content_id, target_language)
  where status in ('pending', 'processing');

-- 3) Verify: index exists, and no duplicate in-flight pairs remain (0 rows = good).
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'translation_queue'
  and indexname = 'translation_queue_inflight_uniq';

select content_type, content_id, target_language, count(*) as inflight_rows
from public.translation_queue
where status in ('pending', 'processing')
group by content_type, content_id, target_language
having count(*) > 1;
