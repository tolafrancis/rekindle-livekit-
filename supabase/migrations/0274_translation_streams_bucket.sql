-- 0274_translation_streams_bucket.sql
-- =====================================================================
-- Storage bucket for the RLT HLS remote-listener stream (Phase 2,
-- rekindle-translation-bot's HLSWriter — see docs/rlt-build-checklist.md).
-- Object path convention: translation-streams/{session_id}/index.m3u8 and
-- .../seg_00001.ts etc.
--
-- Private bucket, not a public-read one like 0246_chat_attachments — HLS
-- segments need the same public/private gating as translation_sessions
-- and translation_logs (0273), which is per-ministry via
-- language_configs.is_public, not a single bucket-wide flag. A public
-- bucket would leak every private ministry's audio.
--
-- Upload: no INSERT policy at all — only the bot service (service_role,
-- which bypasses RLS entirely) ever writes here. Same "enable RLS, zero
-- policies for non-bypassing roles" pattern 0273 used for
-- translation_device_tokens.
-- =====================================================================

begin;

insert into storage.buckets (id, name, public)
values ('translation-streams', 'translation-streams', false)
on conflict (id) do nothing;

-- Same NOT EXISTS(...is_public = false) shape as 0273's
-- p_translation_sessions_public_sel / p_translation_logs_public_sel —
-- default open, closed only once a ministry explicitly sets
-- language_configs.is_public = false. split_part(name, '/', 1) is the
-- session_id segment of the object path.
drop policy if exists "translation streams public read" on storage.objects;
create policy "translation streams public read"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'translation-streams'
    and not exists (
      select 1
      from public.translation_sessions ts
      join public.language_configs lc on lc.ministry_id = ts.ministry_id
      where ts.id::text = split_part(storage.objects.name, '/', 1)
        and lc.is_public = false
    )
  );

commit;
