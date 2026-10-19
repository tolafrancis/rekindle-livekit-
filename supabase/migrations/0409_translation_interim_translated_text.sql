-- 0409_translation_interim_translated_text.sql
-- =====================================================================
-- Live translated text on /display (2026-10-19). 0346 added interim_text
-- for the speaker's still-growing words in the SOURCE language. This adds
-- the matching field for the TARGET language: the bot overwrites it as the
-- translation model streams each sentence, and TranslationDisplayPage.tsx
-- shows it as a live line (via its existing translation_sessions UPDATE
-- subscription) instead of waiting for the finished translation_logs row.
-- Same single-mutable-field shape as 0346, for the same reasons.
-- =====================================================================

begin;

alter table public.translation_sessions
  add column if not exists interim_translated_text text,
  add column if not exists interim_translated_updated_at timestamptz;

commit;
