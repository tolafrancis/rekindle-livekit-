-- 0245_chat_messages_guest_sender.sql
-- Interactive-meeting chat blocked GUESTS: sender_id was uuid NOT NULL, but a
-- guest (anonymous) has no auth.users id, so the insert failed the NOT NULL
-- constraint (not RLS — read_all_chat and insert_own_chat are both permissive).
--
-- Make sender_id nullable so guests can post with sender_id = null (their display
-- name lives in sender_name). Registered users still store their uid.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

alter table public.chat_messages
  alter column sender_id drop not null;

comment on column public.chat_messages.sender_id is
  'auth.users id of the sender, or NULL for a guest (name in sender_name).';

commit;
