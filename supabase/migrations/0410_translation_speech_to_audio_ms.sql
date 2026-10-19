-- =============================================================================
-- 0410 — translation_logs.speech_to_audio_ms
-- -----------------------------------------------------------------------------
-- The latency a listener actually feels: from the moment the speaker's last
-- word ended (Deepgram's own word timing) to the moment the first translated
-- audio was handed to the room. Unlike pipeline_latency_ms, which starts once
-- the bot has decided the sentence is over, this also counts the silence the
-- bot waited for before translating (endpointing / UtteranceEnd), which is
-- what the 2026-10-19 sentence-end flush shortened.
--
-- Written by rekindle-translation-bot right after device_insert_log inserts
-- the row (service role), so device_insert_log itself is unchanged: it already
-- has several overloads, and adding a parameter risks ambiguous RPC calls.
-- Null for older rows, captions-only (same-language) sessions, and engines
-- that don't measure it (GeminiLiveEngine).
-- =============================================================================

alter table public.translation_logs
  add column if not exists speech_to_audio_ms integer;

comment on column public.translation_logs.speech_to_audio_ms is
  'ms from the end of the speaker''s last word (Deepgram word timing) to the first translated audio chunk; see migration 0410.';
