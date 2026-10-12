-- scripts/test-group-chat-rls.sql
-- =====================================================================
-- Security and behaviour tests for Small Group chat (migrations 0404,
-- 0405). Runs as different users through RLS, independently of the app.
--
-- Everything happens inside one transaction that is rolled back, so it
-- leaves no data behind. Any failed check raises "FAIL: ..." and stops.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test-group-chat-rls.sql
--
-- Needs: auth.users, user_profiles, ministry_groups, ministry_group_members
-- and the small-group migrations (0331, 0332, 0392, 0404, 0405).
-- =====================================================================

begin;

-- ── Fixtures (as the database owner) ────────────────────────────────
-- A leader, B assistant leader, C member, D ministry member not in the
-- group, E not in the ministry, M ministry admin, X banned member.
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000000a', 'gc-a@test.local'),
  ('00000000-0000-4000-a000-00000000000b', 'gc-b@test.local'),
  ('00000000-0000-4000-a000-00000000000c', 'gc-c@test.local'),
  ('00000000-0000-4000-a000-00000000000d', 'gc-d@test.local'),
  ('00000000-0000-4000-a000-00000000000e', 'gc-e@test.local'),
  ('00000000-0000-4000-a000-0000000000a1', 'gc-m@test.local'),
  ('00000000-0000-4000-a000-0000000000a2', 'gc-x@test.local');

insert into public.user_profiles (user_id, full_name, email, is_banned) values
  ('00000000-0000-4000-a000-00000000000a', 'Grace Leader', 'gc-a@test.local', false),
  ('00000000-0000-4000-a000-00000000000b', 'Ben Assistant', 'gc-b@test.local', false),
  ('00000000-0000-4000-a000-00000000000c', 'Chi Member', 'gc-c@test.local', false),
  ('00000000-0000-4000-a000-00000000000d', 'Dami Outsider', 'gc-d@test.local', false),
  ('00000000-0000-4000-a000-00000000000e', 'Eve Stranger', 'gc-e@test.local', false),
  ('00000000-0000-4000-a000-0000000000a1', 'Mo Admin', 'gc-m@test.local', false),
  ('00000000-0000-4000-a000-0000000000a2', 'Xan Banned', 'gc-x@test.local', true);

insert into public.ministry_groups (id, name, owner_id)
  values ('00000000-0000-4000-b000-000000000001', 'GC Test Ministry', '00000000-0000-4000-a000-0000000000a1');

insert into public.ministry_group_members (group_id, ministry_id, user_id, role)
select '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b000-000000000001', u, 'member'
  from unnest(array[
    '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b',
    '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000d',
    '00000000-0000-4000-a000-0000000000a2']::uuid[]) u;

insert into public.small_groups (id, ministry_id, name, privacy) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', 'GC Private', 'private'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', 'GC Invite Only', 'invite_only'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000001', 'GC Public', 'public');

insert into public.small_group_members (group_id, user_id, role, status, joined_at) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000a', 'leader', 'active', now() - interval '3 days'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000b', 'assistant_leader', 'active', now() - interval '2 days'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000c', 'member', 'active', now() - interval '1 day'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-0000000000a2', 'member', 'active', now() - interval '1 day'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-00000000000a', 'leader', 'active', now());

create temp table t_ids (k text primary key, v uuid);
grant select, insert, update on t_ids to authenticated;

-- ── Helpers ─────────────────────────────────────────────────────────
-- Act as a user: \set then select pg_temp.as_user(...); set local role.
create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.assert(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL: %', p_msg; end if;
end $$;
-- Runs p_sql and requires it to raise.
create function pg_temp.must_fail(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception 'FAIL: % (statement succeeded: %)', p_msg, p_sql;
end $$;

-- ── C (member) can send and read ────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-a000-00000000000c');
set local role authenticated;

insert into public.small_group_messages (group_id, body)
  values ('00000000-0000-4000-c000-000000000001', '  Hello group  ');
insert into t_ids select 'c_msg', id from public.small_group_messages where body = 'Hello group';
select pg_temp.assert((select count(*) = 1 from t_ids where k = 'c_msg'), 'member message saved and trimmed');
select pg_temp.assert((select sender_id = '00000000-0000-4000-a000-00000000000c' from public.small_group_messages
                        where id = (select v from t_ids where k = 'c_msg')), 'sender defaults to the caller');

-- Impersonation
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, sender_id, body)
  values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000a', 'I am Grace')$$,
  'member cannot send as another user');
-- System messages
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, message_type, body)
  values ('00000000-0000-4000-c000-000000000001', 'system', 'fake system')$$, 'member cannot send system messages');
-- Prayer request without the function
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, message_type, body)
  values ('00000000-0000-4000-c000-000000000001', 'prayer_request', 'pray')$$, 'prayer cards only via group_chat_share_prayer');
-- Image path must be the sender's own folder in this group
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, message_type, attachment_path)
  values ('00000000-0000-4000-c000-000000000001', 'image', '00000000-0000-4000-c000-000000000001/00000000-0000-4000-a000-00000000000a/x')$$,
  'image path must belong to the sender');
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, body)
  values ('00000000-0000-4000-c000-000000000001', repeat('a', 2001))$$, 'messages over 2,000 characters are rejected');
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, body)
  values ('00000000-0000-4000-c000-000000000001', '   ')$$, 'empty messages are rejected');
-- No direct edits or deletes
select pg_temp.must_fail($$update public.small_group_messages set body = 'edited' where id = (select v from t_ids where k = 'c_msg')$$,
  'members cannot update messages directly');
select pg_temp.must_fail($$delete from public.small_group_messages where id = (select v from t_ids where k = 'c_msg')$$,
  'members cannot delete messages directly');
-- Moderator actions
select pg_temp.must_fail($$select public.group_chat_pin_message((select v from t_ids where k = 'c_msg'), true)$$, 'member cannot pin');
select pg_temp.must_fail($$select public.group_chat_remove_member('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-0000000000a2')$$, 'member cannot remove');
select pg_temp.must_fail($$select public.group_chat_mute_member('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-0000000000a2', now() + interval '1 hour')$$, 'member cannot mute');
select pg_temp.must_fail($$select public.group_chat_set_member_role('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000c', 'leader')$$, 'member cannot change roles');
select pg_temp.must_fail($$select * from public.group_chat_moderation_log('00000000-0000-4000-c000-000000000001')$$, 'member cannot read the moderation log');
-- Own role via the table: RLS gives members no update rights at all
update public.small_group_members set role = 'leader'
 where group_id = '00000000-0000-4000-c000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000c';
select pg_temp.assert((select role = 'member' from public.small_group_members
  where group_id = '00000000-0000-4000-c000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000c'),
  'member cannot raise their own role');
-- Own settings via the function
select public.small_group_update_my_settings('00000000-0000-4000-c000-000000000001', 'replies', true);
select pg_temp.assert((select notify_level = 'replies' and whatsapp_notify from public.small_group_members
  where group_id = '00000000-0000-4000-c000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000c'),
  'member can change their own notification settings');
select public.small_group_update_my_settings('00000000-0000-4000-c000-000000000001', 'all', null);
-- Invitations are off for members by default
select pg_temp.must_fail($$select public.group_chat_invite('00000000-0000-4000-c000-000000000001', array['00000000-0000-4000-a000-00000000000d']::uuid[])$$,
  'member cannot invite when the group does not allow it');
-- Read position cannot go into the future
select public.group_chat_mark_read('00000000-0000-4000-c000-000000000001', now() + interval '10 days');
select pg_temp.assert((select last_read_at <= now() from public.small_group_members
  where group_id = '00000000-0000-4000-c000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000c'),
  'read position is clamped to now');
-- Members list has names
select pg_temp.assert((select count(*) = 4 from public.group_chat_members('00000000-0000-4000-c000-000000000001')),
  'members list returns the active members');
select pg_temp.assert((select bool_and(chat_muted_until is null) from public.group_chat_members('00000000-0000-4000-c000-000000000001')),
  'members do not see mute details');
-- Prayer sharing creates the post and the card, and is idempotent
insert into t_ids select 'c_prayer', (public.group_chat_share_prayer('00000000-0000-4000-c000-000000000001',
  'Please pray for my exams', '00000000-0000-4000-d000-000000000001')).id;
select pg_temp.assert((select (public.group_chat_share_prayer('00000000-0000-4000-c000-000000000001',
  'Please pray for my exams', '00000000-0000-4000-d000-000000000001')).id = (select v from t_ids where k = 'c_prayer')),
  'retrying a prayer share returns the same message');
select pg_temp.assert((select count(*) = 1 from public.small_group_posts
  where group_id = '00000000-0000-4000-c000-000000000001' and post_type = 'prayer_request'),
  'prayer share adds exactly one prayer-list post');
-- Duplicate client id on a plain message is rejected by the unique index
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, body, client_id)
  values ('00000000-0000-4000-c000-000000000001', 'dup', '00000000-0000-4000-d000-000000000001')$$,
  'a retried send cannot create a duplicate');
-- Storage: own folder in own group only
insert into storage.objects (bucket_id, name)
  values ('group-chat-media', '00000000-0000-4000-c000-000000000001/00000000-0000-4000-a000-00000000000c/p-full.jpg');
select pg_temp.must_fail($$insert into storage.objects (bucket_id, name)
  values ('group-chat-media', '00000000-0000-4000-c000-000000000001/00000000-0000-4000-a000-00000000000a/p-full.jpg')$$,
  'member cannot upload into another user''s folder');
select pg_temp.must_fail($$insert into storage.objects (bucket_id, name)
  values ('group-chat-media', '00000000-0000-4000-c000-000000000002/00000000-0000-4000-a000-00000000000c/p-full.jpg')$$,
  'member cannot upload into a group they are not in');
insert into public.small_group_messages (group_id, message_type, attachment_path, attachment_width, attachment_height)
  values ('00000000-0000-4000-c000-000000000001', 'image',
          '00000000-0000-4000-c000-000000000001/00000000-0000-4000-a000-00000000000c/p', 800, 600);
-- Replies must stay in the same group
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, body, reply_to_id)
  values ('00000000-0000-4000-c000-000000000003', 'cross-group', (select v from t_ids where k = 'c_msg'))$$,
  'cannot reply across groups');
reset role;

-- ── Banned member ───────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-a000-0000000000a2');
set local role authenticated;
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, body)
  values ('00000000-0000-4000-c000-000000000001', 'spam')$$, 'banned users cannot send');
reset role;

-- ── D: in the ministry, not in the group ────────────────────────────
select pg_temp.as_user('00000000-0000-4000-a000-00000000000d');
set local role authenticated;
select pg_temp.assert((select count(*) = 0 from public.small_group_messages
  where group_id = '00000000-0000-4000-c000-000000000001'), 'non-member cannot read private group messages');
select pg_temp.assert((select count(*) = 0 from storage.objects where bucket_id = 'group-chat-media'),
  'non-member cannot read group images');
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, body)
  values ('00000000-0000-4000-c000-000000000001', 'let me in')$$, 'non-member cannot send');
select pg_temp.must_fail($$select * from public.group_chat_members('00000000-0000-4000-c000-000000000001')$$,
  'non-member cannot list members');
-- Self-join rules
select pg_temp.must_fail($$insert into public.small_group_members (group_id, user_id, role, status)
  values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000d', 'member', 'active')$$,
  'cannot join a private group as active');
select pg_temp.must_fail($$insert into public.small_group_members (group_id, user_id, role, status)
  values ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-00000000000d', 'leader', 'active')$$,
  'cannot join as a leader');
select pg_temp.must_fail($$insert into public.small_group_members (group_id, user_id, role, status)
  values ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-00000000000d', 'member', 'pending')$$,
  'cannot request to join an invite-only group');
insert into public.small_group_members (group_id, user_id, role, status)
  values ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-00000000000d', 'member', 'active');
select pg_temp.assert((select count(*) = 1 from public.my_group_chats() where group_id = '00000000-0000-4000-c000-000000000003'),
  'joining a public group works and shows in the inbox');
reset role;

-- ── E: not in the ministry; anon ────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-a000-00000000000e');
set local role authenticated;
select pg_temp.assert((select count(*) = 0 from public.small_group_messages), 'outsider reads nothing');
select pg_temp.must_fail($$insert into public.small_group_members (group_id, user_id, role, status)
  values ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-00000000000e', 'member', 'active')$$,
  'outsider cannot join a ministry group');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select pg_temp.must_fail($$select count(*) from public.small_group_messages$$, 'anon has no access to messages');
select pg_temp.must_fail($$select public.my_group_chats()$$, 'anon cannot call chat functions');
reset role;

-- ── B: assistant leader (moderator, not owner) ──────────────────────
select pg_temp.as_user('00000000-0000-4000-a000-00000000000b');
set local role authenticated;
select pg_temp.must_fail($$update public.small_group_members set role = 'leader'
  where group_id = '00000000-0000-4000-c000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000b'$$,
  'assistant leader cannot promote themselves');
select pg_temp.must_fail($$update public.small_group_members set status = 'removed'
  where group_id = '00000000-0000-4000-c000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000a'$$,
  'assistant leader cannot remove the leader');
select pg_temp.must_fail($$select public.group_chat_set_member_role('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000c', 'assistant_leader')$$,
  'assistant leader cannot change roles');
select public.group_chat_pin_message((select v from t_ids where k = 'c_msg'), true);
select pg_temp.assert((select count(*) = 1 from public.small_group_messages where pinned_at is not null), 'moderator can pin');
select public.group_chat_mute_member('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000c', now() + interval '1 hour', 'cool down');
select pg_temp.assert((select count(*) = 1 from public.group_chat_members('00000000-0000-4000-c000-000000000001') where chat_muted_until is not null),
  'leaders see who is muted');
reset role;

select pg_temp.as_user('00000000-0000-4000-a000-00000000000c');
set local role authenticated;
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, body)
  values ('00000000-0000-4000-c000-000000000001', 'am I muted?')$$, 'muted member cannot send');
reset role;

select pg_temp.as_user('00000000-0000-4000-a000-00000000000b');
set local role authenticated;
select public.group_chat_mute_member('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000c', null);
select public.group_chat_delete_message((select v from t_ids where k = 'c_msg'), 'off topic');
select pg_temp.assert((select deleted_at is not null and body = '' and pinned_at is null from public.small_group_messages
  where id = (select v from t_ids where k = 'c_msg')), 'moderator hide clears content and pin');
select pg_temp.assert((select count(*) >= 3 from public.small_group_moderation_log
  where group_id = '00000000-0000-4000-c000-000000000001'), 'moderation actions are logged');
reset role;

-- ── A: leader ───────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-a000-00000000000a');
set local role authenticated;
select pg_temp.assert((select public.group_chat_invite('00000000-0000-4000-c000-000000000001',
  array['00000000-0000-4000-a000-00000000000d', '00000000-0000-4000-a000-00000000000e']::uuid[]) = 1),
  'leader invites ministry members only');
reset role;

select pg_temp.as_user('00000000-0000-4000-a000-00000000000c');
set local role authenticated;
select pg_temp.must_fail($$select public.group_chat_respond_invite('00000000-0000-4000-c000-000000000001', true)$$,
  'only the invitee can answer an invitation');
reset role;

select pg_temp.as_user('00000000-0000-4000-a000-00000000000d');
set local role authenticated;
select pg_temp.assert((select membership_status = 'invited' from public.my_group_chats()
  where group_id = '00000000-0000-4000-c000-000000000001'), 'invitation shows in the inbox');
select pg_temp.assert((select count(*) = 0 from public.small_group_messages
  where group_id = '00000000-0000-4000-c000-000000000001'), 'invited (not yet accepted) cannot read');
select public.group_chat_respond_invite('00000000-0000-4000-c000-000000000001', true);
select pg_temp.assert((select count(*) > 0 from public.small_group_messages
  where group_id = '00000000-0000-4000-c000-000000000001'), 'accepted invitee can read');
select pg_temp.assert((select unread_count = 0 from public.my_group_chats()
  where group_id = '00000000-0000-4000-c000-000000000001'), 'history before joining is not unread');
reset role;

-- Notifications: a reply notifies its author; pushes are throttled.
-- (Everything in this script shares one transaction timestamp, so move C's
-- read position back a minute to make the next message count as unread.)
update public.small_group_members set last_read_at = now() - interval '1 minute'
 where group_id = '00000000-0000-4000-c000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000c';
select pg_temp.as_user('00000000-0000-4000-a000-00000000000a');
set local role authenticated;
insert into public.small_group_messages (group_id, body, reply_to_id)
  values ('00000000-0000-4000-c000-000000000001', 'Amen to that',
          (select id from public.small_group_messages where message_type = 'image' limit 1));
reset role;
select pg_temp.assert((select count(*) = 1 from public.notifications
  where user_id = '00000000-0000-4000-a000-00000000000c' and type = 'small_group_chat_reply'),
  'reply notifies the person replied to');
select pg_temp.assert((select count(*) = 0 from public.notifications
  where user_id = '00000000-0000-4000-a000-00000000000b' and type like 'small_group_chat%'),
  'ordinary messages do not create bell notifications');
select pg_temp.assert((select count(*) = 1 from public.notifications
  where user_id = '00000000-0000-4000-a000-00000000000d' and type = 'small_group_invite'),
  'invitation creates a notification');
select pg_temp.assert((select count(*) = 1 from public.notifications
  where user_id = '00000000-0000-4000-a000-00000000000b' and type = 'small_group_chat_reply') = false,
  'non-replied members get no reply notification');

-- Unread counts for C (A's reply is unread)
select pg_temp.as_user('00000000-0000-4000-a000-00000000000c');
set local role authenticated;
select pg_temp.assert((select unread_count = 1 from public.my_group_chats()
  where group_id = '00000000-0000-4000-c000-000000000001'), 'unread counts others'' messages since last read');
select public.group_chat_mark_read('00000000-0000-4000-c000-000000000001', now());
select pg_temp.assert((select unread_count = 0 from public.my_group_chats()
  where group_id = '00000000-0000-4000-c000-000000000001'), 'mark read clears unread');
reset role;

-- Leader removes C: access ends at once
select pg_temp.as_user('00000000-0000-4000-a000-00000000000a');
set local role authenticated;
select public.group_chat_remove_member('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000c', 'test');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-00000000000c');
set local role authenticated;
select pg_temp.assert((select count(*) = 0 from public.small_group_messages
  where group_id = '00000000-0000-4000-c000-000000000001'), 'removed member reads nothing');
select pg_temp.assert((select count(*) = 0 from storage.objects where bucket_id = 'group-chat-media'),
  'removed member loses image access');
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, body)
  values ('00000000-0000-4000-c000-000000000001', 'still here?')$$, 'removed member cannot send');
select pg_temp.must_fail($$insert into public.small_group_members (group_id, user_id, role, status)
  values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000c', 'member', 'pending')$$,
  'removed member cannot simply rejoin');
reset role;

-- Last leader leaves: the assistant leader takes over
select pg_temp.as_user('00000000-0000-4000-a000-00000000000a');
set local role authenticated;
select pg_temp.must_fail($$select public.group_chat_set_member_role('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000a', 'member')$$,
  'the last leader cannot step down without a successor');
select public.group_chat_leave('00000000-0000-4000-c000-000000000001');
reset role;
select pg_temp.assert((select role = 'leader' from public.small_group_members
  where group_id = '00000000-0000-4000-c000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000b'),
  'assistant leader succeeds a departing sole leader');

-- Ministry admin keeps control of every group
select pg_temp.as_user('00000000-0000-4000-a000-0000000000a1');
set local role authenticated;
select public.group_chat_set_member_role('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000d', 'assistant_leader');
select pg_temp.assert((select count(*) > 0 from public.group_chat_moderation_log('00000000-0000-4000-c000-000000000001')),
  'ministry admin can read the moderation log');
reset role;

-- Rate limit: 20 messages a minute
select pg_temp.as_user('00000000-0000-4000-a000-00000000000d');
set local role authenticated;
insert into public.small_group_messages (group_id, body)
  select '00000000-0000-4000-c000-000000000003', 'msg ' || g from generate_series(1, 20) g;
select pg_temp.must_fail($$insert into public.small_group_messages (group_id, body)
  values ('00000000-0000-4000-c000-000000000003', 'one too many')$$, 'rate limit stops the 21st message in a minute');
reset role;

select 'ALL GROUP CHAT CHECKS PASSED' as result;

rollback;
