-- 0161_devotional_stream_sources.sql
-- =====================================================================
-- Per-stream POPULATION MODE for daily-devotional streams (see
-- docs/devotional-stream-automation-plan.md).
--
--   NO ROW here            → the stream is MANUAL: an admin authors each day's
--                            devotional exactly as today. This is the default and
--                            nothing about existing streams changes.
--   kind = 'ai'            → a daily cron generates an original devotional.
--   kind = 'scrape'        → a daily cron ingests one from a licensed feed.
--
-- Automated jobs insert DRAFTS (is_published = false) for an admin to approve, so
-- a bad generation/parse can never reach users unreviewed.
--
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.
-- =====================================================================

begin;

-- ── Idempotency guard ─────────────────────────────────────────────────────
-- A cron can fire twice (retry/overlap). The jobs check before inserting, but
-- enforce it in the DB too so a double-fire can NEVER create two devotionals for
-- the same stream+day. Partial: only stream-scoped rows are constrained.
-- (schedule_date is a DATE column, so no cast is needed. Rows with a NULL
-- schedule_date don't collide — Postgres treats NULLs as distinct.)
create unique index if not exists uq_devotionals_stream_day
  on public.devotionals (stream_id, schedule_date)
  where stream_id is not null;

-- ── The source registry ───────────────────────────────────────────────────
-- One row per AUTOMATED stream. Pointing a stream at a new source is an insert,
-- not a code change.
create table if not exists public.devotional_stream_sources (
  stream_id         uuid primary key references public.devotional_streams (id) on delete cascade,
  kind              text not null check (kind in ('scrape', 'ai')),

  -- scrape config
  source_url        text,                              -- RSS/Atom feed URL (prefer feeds; HTML is fragile)
  parser_key        text,                              -- which parser profile to use ('rss')
  -- WHY we are allowed to republish this source (public domain / explicit
  -- "reproduce freely" licence / permitted RSS). Republishing copyrighted
  -- devotionals is infringement even with attribution — record the basis before
  -- a scraped stream goes public.
  license_basis     text,

  -- ai config
  prompt            text,                              -- themed rotation prompt; editable without redeploy

  scripture_version text not null default 'kjv',       -- verse TEXT always comes from the Bible API
  is_active         boolean not null default true,

  -- observability (written back on every run)
  last_run_at       timestamptz,
  last_status       text,                              -- 'ok' | 'skipped' | 'error: …'
  updated_at        timestamptz not null default now(),

  constraint scrape_needs_source
    check (kind <> 'scrape' or (source_url is not null and parser_key is not null)),
  constraint ai_needs_prompt
    check (kind <> 'ai' or prompt is not null)
);

create index if not exists idx_dss_active_kind
  on public.devotional_stream_sources (kind, is_active);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Admin/moderator only. The cron edge functions use the service role, which
-- bypasses RLS, so they are unaffected by these policies.
alter table public.devotional_stream_sources enable row level security;

drop policy if exists "admin reads devotional stream sources" on public.devotional_stream_sources;
create policy "admin reads devotional stream sources"
  on public.devotional_stream_sources
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid() and up.role in ('admin', 'super_admin', 'moderator')
    )
  );

drop policy if exists "admin writes devotional stream sources" on public.devotional_stream_sources;
create policy "admin writes devotional stream sources"
  on public.devotional_stream_sources
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid() and up.role in ('admin', 'super_admin', 'moderator')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid() and up.role in ('admin', 'super_admin', 'moderator')
    )
  );

commit;
