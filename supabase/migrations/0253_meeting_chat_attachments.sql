-- 0253_meeting_chat_attachments.sql
-- =====================================================================
-- Adds file/image attachment support to `meeting_chat` — the webinar
-- AUDIENCE-side chat (packages/live/src/useMeetingChat.ts /
-- MeetingChatPanel.tsx). The in-call chat (RoomChatSidebar, backed by a
-- different table) already supports attachments; this brings the
-- webinar audience chat to the same capability so both sides of a
-- webinar (presenters in the call, and attendees watching the HLS
-- stream) can share files/images, not just text.
--
-- No RLS change needed: attachment is just a new nullable jsonb column
-- on rows insertable/selectable under the table's existing policies.
-- Shape matches packages/types/src/liveChannelTypes.ts ChatAttachment
-- ({ url, name, type, size }) and reuses the same 'meeting-chat-attachments'
-- storage bucket RoomChatSidebar already uploads to.
-- =====================================================================

alter table public.meeting_chat
  add column if not exists attachment jsonb;
