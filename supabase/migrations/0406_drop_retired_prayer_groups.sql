-- supabase/migrations/0406_drop_retired_prayer_groups.sql
-- =====================================================================
-- Removes the retired prayer-group system. Its screens were replaced by
-- Live Channels (apps/rekindle/src/components/SocialPrayerGroups.tsx) and
-- no app code reads these tables any more; Small Group chat (0404)
-- replaces the group conversation.
--
-- The tables were also unsafe: prayer_group_messages could be read by
-- anyone (its read rule only checked NOT is_deleted, and anon had full
-- grants), and any signed-in user could add themselves to any group.
--
-- Dropped (live row counts on 2026-10-12): prayer_groups (1),
-- prayer_group_members (3), prayer_group_messages (13), group_messages (0),
-- group_prayer_requests (0), prayer_request_prayers (0),
-- group_live_sessions (6, live sessions of prayer groups),
-- group_live_room_participants (0); plus their helper and trigger
-- functions, and their entries in the moderation report types.
--
-- Not reversible: the rows are deleted with the tables.
-- Paste into the Supabase SQL Editor.
-- =====================================================================

begin;

drop table if exists public.group_live_room_participants;
drop table if exists public.group_live_sessions;
drop table if exists public.prayer_request_prayers;
drop table if exists public.group_prayer_requests;
drop table if exists public.group_messages;
drop table if exists public.prayer_group_messages;
drop table if exists public.prayer_group_members;
drop table if exists public.prayer_groups;

drop function if exists public.check_group_admin(uuid, uuid);
drop function if exists public.check_group_membership(uuid, uuid);
drop function if exists public.update_group_member_count();
drop function if exists public.update_prayer_count();
drop function if exists public.notify_on_group_message();

-- No reports exist for these types (flagged_content had 0 rows); refuse
-- new ones now that the tables are gone.
alter table public.flagged_content drop constraint if exists flagged_content_content_type_check;
alter table public.flagged_content
  add constraint flagged_content_content_type_check check (content_type in (
    'post', 'comment', 'live_stream', 'profile', 'message',
    'chat_messages', 'room_chat_messages', 'channel_chat_messages',
    'meeting_chat_messages',
    'prayer_wall_posts', 'prayer_wall_responses', 'community_activities',
    'community_questions', 'community_answers', 'ministry_testimonies',
    'voice_notes', 'meeting_chat', 'small_group_posts', 'small_group_messages',
    'community_revelations', 'app_testimonies', 'ministry_prayer_requests',
    'counselling_session_messages', 'user',
    'community_revelation_comments', 'app_testimony_comments'
  ));

commit;
