-- 0346_caption_interim_text.sql
-- =====================================================================
-- "Why aren't captions near-real-time like Zoom/Meet?" (2026-09-13) —
-- root cause: Deepgram already streams interim (partial, still-growing)
-- transcripts, but AudioPipeline.ts throws them away (console.log only)
-- and only ever persists/displays a FINAL transcript, which Deepgram only
-- emits after 300ms-1s of silence (endpointing/utterance_end_ms). Zoom/
-- Meet show words appearing live, mid-sentence; this system showed nothing
-- until a whole sentence finished, in bursts.
--
-- Fix, scoped to "Show Captions" (same-language, session_kind='captions')
-- specifically -- not cross-language translation, where showing the
-- source language's interim text ahead of the translated final line would
-- look like a language glitch, not a latency win. A streaming-interim-
-- TRANSLATION fix is a materially bigger lift (partial-translate-as-you-go)
-- and not attempted here.
--
-- interim_text is a single mutable field per session (not a new table/log
-- row per interim event -- that would be a heavy, ever-growing table for
-- something intentionally transient) that the bot overwrites on every
-- Deepgram interim result and the client reads via a Realtime UPDATE
-- subscription -- same Realtime mechanism FloatingTranslationButton.tsx
-- already uses for finalized captions (translation_logs INSERT), just a
-- second subscription on this table's UPDATE events.
-- =====================================================================

begin;

alter table public.translation_sessions
  add column if not exists interim_text text,
  add column if not exists interim_updated_at timestamptz;

commit;
