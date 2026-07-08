-- =====================================================================
-- PHASE 0 — GROUND TRUTH EXTRACTION
-- Run each block in the Supabase Dashboard → SQL Editor and paste the
-- results back. These are READ-ONLY (SELECT only) — they change nothing.
-- Goal: capture the REAL live schema, since tables/functions were created
-- by pasting into the dashboard and are NOT in the repo migrations.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Translation & TTS infrastructure tables — full column definitions
-- ---------------------------------------------------------------------
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'translation_cache',
    'translation_queue',
    'content_translation_status',
    'content_popularity',
    'tts_audio_cache'
  )
order by table_name, ordinal_position;

-- ---------------------------------------------------------------------
-- 2. Unique constraints / indexes on the cache tables
--    (confirms the real onConflict keys the edge functions rely on)
-- ---------------------------------------------------------------------
select
  tc.table_name,
  tc.constraint_type,
  tc.constraint_name,
  string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
where tc.table_schema = 'public'
  and tc.table_name in ('translation_cache', 'tts_audio_cache')
  and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE')
group by tc.table_name, tc.constraint_type, tc.constraint_name
order by tc.table_name;

-- ---------------------------------------------------------------------
-- 3. Which content tables ALREADY have a `translations` and/or
--    `language` column (proves which content types can be localized today)
-- ---------------------------------------------------------------------
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and column_name in ('translations', 'language', 'language_code', 'preferred_language')
order by column_name, table_name;

-- ---------------------------------------------------------------------
-- 4. Confirm the durable content tables exist and list their columns
--    (compare against CONTENT_FIELDS_MAP in translationQueueService.ts)
-- ---------------------------------------------------------------------
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'devotionals', 'devotional_series', 'devotional_entries',
    'ministry_devotionals', 'ministry_announcements',
    'prayer_points', 'prayer_library', 'prayer_series', 'prayer_topics',
    'book_summaries', 'affirmations', 'declarations',
    'user_profiles'
  )
order by table_name, ordinal_position;

-- ---------------------------------------------------------------------
-- 5. Does user_profiles.preferred_language exist? (LanguageContext.tsx
--    swallows error 42703 assuming it might not)
-- ---------------------------------------------------------------------
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_profiles'
  and column_name in ('preferred_language', 'language_updated_at');

-- ---------------------------------------------------------------------
-- 6. Sanity: how much is in the translation cache today, and split by
--    provider/model (shows whether both OpenAI + Gemini paths are live)
-- ---------------------------------------------------------------------
select provider, model, count(*) as rows, count(distinct target_language) as langs
from public.translation_cache
group by provider, model
order by rows desc;

-- ---------------------------------------------------------------------
-- 7. book_summaries field-name check: does it use key_takeaways or
--    key_points? (queue expects key_points; seed used key_takeaways)
-- ---------------------------------------------------------------------
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'book_summaries'
  and column_name in ('key_takeaways', 'key_points', 'summary', 'translations');
