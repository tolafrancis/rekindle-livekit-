-- 0275_translation_streams_bucket_public.sql
-- =====================================================================
-- Flips translation-streams (0274) from private to public. Real bug hit
-- during Phase 2 live testing (2026-08-14), not a design change of mind:
--
-- HLSWriter.ts builds `hls_stream_url` via the JS client's
-- `.storage.from(bucket).getPublicUrl(path)`, which always returns the
-- `/object/public/...` REST path — that path is served directly by
-- Supabase's CDN edge and does NOT evaluate storage.objects RLS at all,
-- regardless of the bucket's public/private flag. On a private bucket it
-- 404s unconditionally ("Bucket not found"), so 0274's `/object/public/`
-- URLs never worked, RLS policy or not.
--
-- The fix isn't "use the authenticated path instead" — HlsPlayer.tsx (the
-- shared component reused here, see [packages/live/src/components/
-- HlsPlayer.tsx]) hands hls.js and native <video> a bare src with no way
-- to attach an Authorization header, and native iOS Safari HLS playback
-- (explicitly required — see rlt-build-checklist.md's risk register) can
-- NEVER attach custom headers to a video element's src; that's a browser
-- limitation, not something fixable in this codebase. Signed URLs don't
-- fit a continuously-growing live playlist either (every segment would
-- need re-signing on every playlist rewrite).
--
-- So: public bucket, matching how HLSWriter already builds the URL.
-- Session IDs are unguessable UUIDs, so this is "unlisted" not "open" —
-- but note the tradeoff: anyone with the exact HLS URL bypasses
-- language_configs.is_public / the /display PIN gate at the storage
-- layer. Those gates still fully protect the /display TEXT feed
-- (translation_logs, via translation_sessions/translation_logs RLS,
-- untouched by this migration) and the room-name itself; only the raw
-- HLS audio segments/playlist are affected, and only for someone who
-- already has the direct storage URL rather than the /display link.
-- =====================================================================

begin;

update storage.buckets set public = true where id = 'translation-streams';

commit;
