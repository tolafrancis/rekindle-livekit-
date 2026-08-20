-- 0280_cleanup_legacy_notes_tables.sql
-- Defensive cleanup of legacy recall.ai note-taker tables superseded by translation_logs (0273)

drop table if exists public.meeting_transcript_segments cascade;
drop table if exists public.meeting_notes cascade;
