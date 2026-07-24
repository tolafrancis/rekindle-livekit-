-- 0246_chat_attachments.sql
-- File/image attachments for interactive-meeting chat.
--   • attachment columns on chat_messages
--   • a public-read storage bucket; UPLOAD is authenticated-only, so guests
--     (members-only decision) cannot attach, but everyone in the meeting can
--     view via the public URL (chat itself is already world-readable).
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

-- ── attachment columns ─────────────────────────────────────────────────────
alter table public.chat_messages
  add column if not exists attachment_url  text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,   -- MIME, e.g. image/png, application/pdf
  add column if not exists attachment_size bigint; -- bytes

-- A message may now be attachment-only (no text body).
alter table public.chat_messages alter column content drop not null;

-- ── storage bucket ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('meeting-chat-attachments', 'meeting-chat-attachments', true)
on conflict (id) do nothing;

-- Public read (matches chat_messages.read_all_chat).
drop policy if exists "chat attachments public read" on storage.objects;
create policy "chat attachments public read"
  on storage.objects for select
  using (bucket_id = 'meeting-chat-attachments');

-- Upload: authenticated only → members can attach, guests cannot.
drop policy if exists "chat attachments auth upload" on storage.objects;
create policy "chat attachments auth upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'meeting-chat-attachments');

commit;
