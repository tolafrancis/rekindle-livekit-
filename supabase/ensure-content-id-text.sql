-- =============================================================================
-- ensure-content-id-text.sql
-- =============================================================================
-- The translation system keys content by (content_type, content_id). content_id
-- was `uuid`, which silently EXCLUDES every content table that uses integer
-- primary keys (affirmations, platform devotionals, …) — queueing one throws
-- "operator does not exist: uuid = bigint", so those types never get translated.
--
-- This converts content_id to `text` in the two tables the translation flow uses
-- so ANY id (uuid or integer) can be stored. Existing uuid values convert cleanly
-- (uuid::text). The worker compares it back via .eq('id', content_id), which
-- Postgres coerces to each content table's own id type, so both keep working.
--
-- Safe to re-run (guards on current column type). Paste into the Supabase SQL
-- editor → Run. Deploy the updated process-translation-queue function too — it
-- now stores content_id as text (String(id)).
-- =============================================================================

-- 1) Drop the partial unique index that depends on content_id (recreated below).
drop index if exists translation_queue_inflight_uniq;

-- 2) Convert content_id -> text where it isn't already.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema='public' and table_name='translation_queue' and column_name='content_id') <> 'text' then
    alter table public.translation_queue
      alter column content_id type text using content_id::text;
    raise notice 'translation_queue.content_id -> text';
  else
    raise notice 'translation_queue.content_id already text';
  end if;

  if (select data_type from information_schema.columns
      where table_schema='public' and table_name='content_translation_status' and column_name='content_id') <> 'text' then
    alter table public.content_translation_status
      alter column content_id type text using content_id::text;
    raise notice 'content_translation_status.content_id -> text';
  else
    raise notice 'content_translation_status.content_id already text';
  end if;
end $$;

-- 3) Recreate the in-flight partial unique index.
create unique index if not exists translation_queue_inflight_uniq
  on public.translation_queue (content_type, content_id, target_language)
  where status in ('pending', 'processing');

-- 4) Verify both are text now.
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and column_name='content_id'
  and table_name in ('translation_queue','content_translation_status')
order by table_name;
