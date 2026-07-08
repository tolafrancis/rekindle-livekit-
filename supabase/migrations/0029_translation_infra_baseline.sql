-- supabase/migrations/0029_translation_infra_baseline.sql
-- BASELINE — documents the translation/TTS infrastructure schema as it exists
-- LIVE on project vpnpembyqbbaaiynfvli, captured 2026-07-03 via the Supabase
-- Management API (these tables were originally created by pasting into the
-- dashboard and had no migration in the repo). Every statement is idempotent
-- (IF NOT EXISTS), so running this against the live DB is a safe no-op and
-- against a fresh DB reproduces the current schema.
--
-- This migration is DESCRIPTIVE (ground truth for Phase 0). Fixes to the broken
-- cache-write path and column drift are scheduled for later phases — see
-- docs/phase0-findings-and-decisions.md.

-- =====================================================================
-- translation_cache  — shared translation cache (System A + legacy)
--   NOTE: the ONLY unique key is 3-column (content_hash, source_language,
--   target_language). content_type is NOT part of it. The deployed
--   translate-content function's 4-column onConflict does not match this and
--   therefore fails to write. See Phase 0 findings.
-- =====================================================================
create table if not exists public.translation_cache (
  id                uuid primary key default gen_random_uuid(),
  content_hash      text not null,
  source_text       text not null,
  source_language   varchar not null default 'en',
  target_language   varchar not null,
  translated_text   text not null,
  content_type      varchar default 'general',
  provider          varchar default 'openai',
  model             varchar default 'gpt-4o-mini',
  access_count      integer default 1,
  last_accessed_at  timestamptz default now(),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  constraint translation_cache_content_hash_source_language_target_langu_key
    unique (content_hash, source_language, target_language)
);
create index if not exists idx_translation_cache_lookup
  on public.translation_cache (content_hash, source_language, target_language);
create index if not exists idx_translation_cache_hash        on public.translation_cache (content_hash);
create index if not exists idx_translation_cache_target      on public.translation_cache (target_language);
create index if not exists idx_translation_cache_source      on public.translation_cache (source_language);
create index if not exists idx_translation_cache_languages   on public.translation_cache (source_language, target_language);
create index if not exists idx_translation_cache_content_type on public.translation_cache (content_type);
create index if not exists idx_translation_cache_access_count on public.translation_cache (access_count desc);
create index if not exists idx_translation_cache_created_at   on public.translation_cache (created_at desc);

-- =====================================================================
-- translation_queue  — System B queue (Gemini). Currently EMPTY in prod
--   (the queue has never run). Kept as orchestration for later phases.
-- =====================================================================
create table if not exists public.translation_queue (
  id                  uuid primary key default gen_random_uuid(),
  content_type        varchar not null,
  content_id          uuid not null,
  content_table       varchar not null,
  source_language     varchar default 'en',
  target_language     varchar not null,
  fields_to_translate text[] not null,
  status              varchar default 'pending',
  priority            integer default 5,
  error_message       text,
  retry_count         integer default 0,
  max_retries         integer default 3,
  is_auto_triggered   boolean default false,
  demand_score        integer default 0,
  created_by          uuid,
  ministry_id         uuid,
  created_at          timestamptz default now(),
  started_at          timestamptz,
  completed_at        timestamptz
);

-- =====================================================================
-- content_translation_status  — per-content translation progress
-- =====================================================================
create table if not exists public.content_translation_status (
  id                       uuid primary key default gen_random_uuid(),
  content_type             varchar not null,
  content_id               uuid not null,
  content_table            varchar not null,
  total_languages          integer default 0,
  completed_languages      integer default 0,
  pending_languages        text[] default '{}',
  completed_language_codes text[] default '{}',
  failed_languages         text[] default '{}',
  last_translation_at      timestamptz,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),
  constraint content_translation_status_content_type_content_id_key
    unique (content_type, content_id)
);

-- =====================================================================
-- content_popularity  — demand-based translation signal
-- =====================================================================
create table if not exists public.content_popularity (
  id             uuid primary key default gen_random_uuid(),
  content_type   varchar not null,
  content_id     uuid not null,
  language_code  varchar not null,
  view_count     integer default 0,
  unique_users   integer default 0,
  last_viewed_at timestamptz default now(),
  created_at     timestamptz default now(),
  constraint content_popularity_content_type_content_id_language_code_key
    unique (content_type, content_id, language_code)
);

-- =====================================================================
-- tts_audio_cache  — per-language generated audio. 206 rows live, ALL 'en'.
--   NOTE: only a `voice` column exists (default 'alloy'). The frontend
--   openaiTTSService.ts writes voice_used/duration_seconds/file_size_bytes,
--   which DO NOT EXIST here → those client cache-saves fail. See Phase 0.
-- =====================================================================
create table if not exists public.tts_audio_cache (
  id               uuid primary key default gen_random_uuid(),
  content_id       text not null,
  content_type     text not null,
  language         text not null,
  audio_url        text not null,
  voice            text default 'alloy',
  access_count     integer default 0,
  last_accessed_at timestamptz default now(),
  created_at       timestamptz default now(),
  constraint tts_audio_cache_content_id_content_type_language_key
    unique (content_id, content_type, language)
);

-- =====================================================================
-- Content tables that ALREADY carry a `translations jsonb` column live
-- (documented for completeness; no-op if present). Tables WITHOUT it yet —
-- affirmations, declarations, book_summaries, prayer_series — are added in a
-- later phase, not here.
-- =====================================================================
alter table if exists public.devotionals          add column if not exists translations jsonb;
alter table if exists public.devotional_series     add column if not exists translations jsonb;
alter table if exists public.devotional_entries    add column if not exists translations jsonb;
alter table if exists public.devotional_categories add column if not exists translations jsonb;
alter table if exists public.ministry_devotionals  add column if not exists translations jsonb;
alter table if exists public.ministry_announcements add column if not exists translations jsonb;
alter table if exists public.prayer_points         add column if not exists translations jsonb;
alter table if exists public.prayer_library        add column if not exists translations jsonb;
alter table if exists public.prayer_topics         add column if not exists translations jsonb;
