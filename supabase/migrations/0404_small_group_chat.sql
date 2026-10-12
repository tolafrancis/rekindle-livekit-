-- supabase/migrations/0404_small_group_chat.sql
-- =====================================================================
-- Group Chat for Small Groups: a real-time conversation inside every
-- small group, built on the existing small_groups / small_group_members
-- model (0331) instead of a separate groups system.
--
--   1. Group chat settings on small_groups (chat on/off, members may
--      invite, welcome message, rules, last_message_at for the inbox).
--   2. Per-member chat state on small_group_members (read position,
--      notification level, moderator mute, push throttle, inviter) and a
--      new 'invited' membership status.
--   3. Tightens two existing holes on small_group_members:
--        - self-join could set its own role/status (e.g. role 'leader',
--          or 'active' in a private group);
--        - assistant leaders could promote themselves or change/remove
--          the group's leader.
--   4. small_group_messages (+ realtime) and small_group_moderation_log.
--   5. Chat functions: read state, settings, invite/respond, leave,
--      remove, mute, roles, leadership transfer, pin, delete, prayer
--      sharing, members list, inbox.
--   6. Private storage bucket group-chat-media with membership-checked
--      access for image messages.
--   7. Report/remove support for chat messages in the moderation tools
--      (0388), and the banned-author guard.
--
-- Every write except sending a message goes through a security definer
-- function that checks the caller's role first; members have no direct
-- update/delete rights on messages.
--
-- Idempotent. Paste into the Supabase SQL Editor.
-- =====================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 0. Helpers
-- ─────────────────────────────────────────────────────────────────────

-- Cast text to uuid without raising (storage paths come from clients).
create or replace function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- "Owner level" for a small group: an active leader, a small-group
-- coordinator of the ministry, or a ministry admin. Assistant leaders are
-- moderators, not owners.
create or replace function public.is_small_group_owner(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id is not null and (
    exists (
      select 1 from public.small_group_members
      where group_id = p_group_id and user_id = p_user_id
        and status = 'active' and role = 'leader'
    ) or exists (
      select 1 from public.small_groups sg
      join public.small_group_coordinators c
        on c.ministry_id = sg.ministry_id and c.user_id = p_user_id
      where sg.id = p_group_id
    ) or public.is_group_admin(
      (select ministry_id from public.small_groups where id = p_group_id), p_user_id
    )
  );
$$;
revoke all on function public.is_small_group_owner(uuid, uuid) from public, anon;
grant execute on function public.is_small_group_owner(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Group chat settings
-- ─────────────────────────────────────────────────────────────────────

alter table public.small_groups
  add column if not exists chat_enabled boolean not null default true,
  add column if not exists members_can_invite boolean not null default false,
  add column if not exists welcome_message text,
  add column if not exists rules text,
  add column if not exists last_message_at timestamptz;

alter table public.small_groups drop constraint if exists small_groups_welcome_message_len;
alter table public.small_groups
  add constraint small_groups_welcome_message_len check (welcome_message is null or char_length(welcome_message) <= 1000);
alter table public.small_groups drop constraint if exists small_groups_rules_len;
alter table public.small_groups
  add constraint small_groups_rules_len check (rules is null or char_length(rules) <= 2000);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Per-member chat state
-- ─────────────────────────────────────────────────────────────────────

alter table public.small_group_members
  add column if not exists last_read_at timestamptz,
  add column if not exists notify_level text not null default 'all',
  add column if not exists chat_muted_until timestamptz,
  add column if not exists last_push_at timestamptz,
  add column if not exists invited_by uuid references auth.users(id) on delete set null;

alter table public.small_group_members drop constraint if exists small_group_members_notify_level_check;
alter table public.small_group_members
  add constraint small_group_members_notify_level_check check (notify_level in ('all', 'replies', 'muted'));

alter table public.small_group_members drop constraint if exists small_group_members_status_check;
alter table public.small_group_members
  add constraint small_group_members_status_check
  check (status in ('pending', 'invited', 'active', 'declined', 'removed'));

create index if not exists idx_small_group_members_user_status
  on public.small_group_members (user_id, status);

-- ─────────────────────────────────────────────────────────────────────
-- 3. Tighten existing membership rules
-- ─────────────────────────────────────────────────────────────────────

-- Self-service join: always as a plain member; directly active only in a
-- public group, otherwise a pending request. Closed/inactive groups and
-- invite-only groups can't be joined this way.
drop policy if exists p_small_group_members_self_insert on public.small_group_members;
create policy p_small_group_members_self_insert on public.small_group_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and invited_by is null
    and chat_muted_until is null
    and exists (
      select 1 from public.small_groups sg
      where sg.id = group_id
        and sg.status = 'active'
        and public.is_group_member(sg.ministry_id, auth.uid())
        and (
          (sg.privacy = 'public' and status in ('active', 'pending'))
          or (sg.privacy = 'private' and status = 'pending')
        )
    )
  );

-- Role changes, and any change to a leader's row, need owner level.
-- Applies to direct table writes (leader policy) and to functions alike;
-- service-role / SQL-editor writes are exempt.
create or replace function public.small_group_members_guard_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if public.is_backend_request() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.role <> 'member' and not public.is_small_group_owner(new.group_id, v_uid) then
      raise exception 'Only the group leader can add leaders or assistant leaders.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.group_id is distinct from old.group_id or new.user_id is distinct from old.user_id then
      raise exception 'A membership can''t be moved to another group or person.' using errcode = '42501';
    end if;
    if new.role is distinct from old.role and not public.is_small_group_owner(old.group_id, v_uid) then
      raise exception 'Only the group leader can change member roles.' using errcode = '42501';
    end if;
    if old.role = 'leader' and old.user_id <> v_uid
       and (new.status is distinct from old.status or new.chat_muted_until is distinct from old.chat_muted_until)
       and not public.is_small_group_owner(old.group_id, v_uid) then
      raise exception 'Only the group leader or a ministry admin can change a leader''s membership.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- DELETE
  if old.role = 'leader' and old.user_id <> v_uid and not public.is_small_group_owner(old.group_id, v_uid) then
    raise exception 'Only the group leader or a ministry admin can remove a leader.' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_small_group_members_guard_roles on public.small_group_members;
create trigger trg_small_group_members_guard_roles
  before insert or update or delete on public.small_group_members
  for each row execute function public.small_group_members_guard_roles();

-- ─────────────────────────────────────────────────────────────────────
-- 4. Messages and moderation log
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.small_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.small_groups(id) on delete cascade,
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade, -- set by trigger
  sender_id uuid references auth.users(id) on delete set null default auth.uid(),
  client_id uuid not null default gen_random_uuid(),
  message_type text not null default 'text'
    check (message_type in ('text', 'scripture', 'prayer_request', 'image', 'system')),
  body text not null default '' check (char_length(body) <= 2000),
  scripture_ref text check (scripture_ref is null or char_length(scripture_ref) <= 64),
  prayer_post_id uuid references public.small_group_posts(id) on delete set null,
  reply_to_id uuid references public.small_group_messages(id) on delete set null,
  attachment_path text check (attachment_path is null or char_length(attachment_path) <= 300),
  attachment_width integer check (attachment_width is null or attachment_width between 1 and 10000),
  attachment_height integer check (attachment_height is null or attachment_height between 1 and 10000),
  pinned_at timestamptz,
  pinned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint small_group_messages_has_content check (
    deleted_at is not null
    or (message_type = 'image' and attachment_path is not null)
    or (message_type = 'scripture' and scripture_ref is not null)
    or (message_type <> 'image' and char_length(btrim(body)) > 0)
  )
);

create unique index if not exists small_group_messages_sender_client_uidx
  on public.small_group_messages (sender_id, client_id);
create index if not exists idx_small_group_messages_group_created
  on public.small_group_messages (group_id, created_at desc, id desc);
create index if not exists idx_small_group_messages_pinned
  on public.small_group_messages (group_id, pinned_at desc) where pinned_at is not null;
create index if not exists idx_small_group_messages_sender_created
  on public.small_group_messages (sender_id, created_at desc);
create index if not exists idx_small_group_messages_reply_to
  on public.small_group_messages (reply_to_id) where reply_to_id is not null;

-- Validates and normalises every new message. Runs for direct inserts and
-- for inserts made by the chat functions below (both carry the caller's
-- auth.uid()); service-role / SQL-editor inserts skip the user checks.
create or replace function public.small_group_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.small_groups%rowtype;
  v_member public.small_group_members%rowtype;
  v_recent integer;
  v_reply_group uuid;
begin
  select * into v_group from public.small_groups where id = new.group_id;
  if v_group.id is null then
    raise exception 'small_group_messages: group % not found', new.group_id;
  end if;
  new.ministry_id := v_group.ministry_id;

  if public.is_backend_request() then
    return new;
  end if;

  if new.sender_id is distinct from auth.uid() then
    raise exception 'You can only send messages as yourself.' using errcode = '42501';
  end if;
  if new.message_type = 'system' then
    raise exception 'System messages can''t be sent from the app.' using errcode = '42501';
  end if;
  if not v_group.chat_enabled or v_group.status <> 'active' then
    raise exception 'Chat is turned off for this group.' using errcode = '42501';
  end if;

  select * into v_member from public.small_group_members
    where group_id = new.group_id and user_id = new.sender_id;
  if v_member.chat_muted_until is not null and v_member.chat_muted_until > now() then
    raise exception 'A group leader has paused your messages in this group until %.',
      to_char(v_member.chat_muted_until at time zone 'UTC', 'FMDD Mon HH24:MI "UTC"') using errcode = '42501';
  end if;

  select count(*) into v_recent from public.small_group_messages
    where sender_id = new.sender_id and created_at > now() - interval '1 minute';
  if v_recent >= 20 then
    raise exception 'You''re sending messages too quickly. Please wait a moment.' using errcode = '54000';
  end if;

  -- Server-controlled fields.
  new.created_at := now();
  new.edited_at := null;
  new.deleted_at := null;
  new.deleted_by := null;
  new.pinned_at := null;
  new.pinned_by := null;
  new.body := btrim(new.body);

  if new.reply_to_id is not null then
    select group_id into v_reply_group from public.small_group_messages where id = new.reply_to_id;
    if v_reply_group is distinct from new.group_id then
      raise exception 'You can only reply to a message in the same group.' using errcode = '22023';
    end if;
  end if;

  if new.message_type = 'image' then
    -- <group_id>/<sender_id>/<file>, matching the storage policies below.
    if new.attachment_path is null
       or split_part(new.attachment_path, '/', 1) <> new.group_id::text
       or split_part(new.attachment_path, '/', 2) <> new.sender_id::text
       or position('..' in new.attachment_path) > 0 then
      raise exception 'Invalid image attachment.' using errcode = '22023';
    end if;
  else
    new.attachment_path := null;
    new.attachment_width := null;
    new.attachment_height := null;
  end if;

  if new.message_type = 'prayer_request' then
    if new.prayer_post_id is null or not exists (
      select 1 from public.small_group_posts p
      where p.id = new.prayer_post_id and p.group_id = new.group_id
        and p.author_id = new.sender_id and p.post_type = 'prayer_request'
    ) then
      raise exception 'Share prayer requests with group_chat_share_prayer().' using errcode = '22023';
    end if;
  else
    new.prayer_post_id := null;
  end if;

  if new.message_type <> 'scripture' then
    new.scripture_ref := null;
  else
    new.scripture_ref := nullif(btrim(new.scripture_ref), '');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_small_group_messages_before_insert on public.small_group_messages;
create trigger trg_small_group_messages_before_insert
  before insert on public.small_group_messages
  for each row execute function public.small_group_messages_before_insert();

drop trigger if exists reject_banned_author on public.small_group_messages;
create trigger reject_banned_author
  before insert on public.small_group_messages
  for each row execute function public.reject_banned_author();

-- Inbox ordering + the sender has read their own message.
create or replace function public.small_group_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.small_groups
     set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
   where id = new.group_id;
  if new.sender_id is not null then
    update public.small_group_members
       set last_read_at = greatest(coalesce(last_read_at, new.created_at), new.created_at)
     where group_id = new.group_id and user_id = new.sender_id and status = 'active';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_small_group_messages_after_insert on public.small_group_messages;
create trigger trg_small_group_messages_after_insert
  after insert on public.small_group_messages
  for each row execute function public.small_group_messages_after_insert();

alter table public.small_group_messages enable row level security;

drop policy if exists p_small_group_messages_select on public.small_group_messages;
create policy p_small_group_messages_select on public.small_group_messages
  for select to authenticated
  using (public.is_small_group_member(group_id, auth.uid()));

drop policy if exists p_small_group_messages_insert on public.small_group_messages;
create policy p_small_group_messages_insert on public.small_group_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and message_type in ('text', 'scripture', 'image', 'prayer_request')
    and public.is_small_group_member(group_id, auth.uid())
  );
-- No update/delete policies: hiding, pinning and deleting go through the
-- functions below.

revoke all on public.small_group_messages from anon;
grant select, insert on public.small_group_messages to authenticated;
revoke update, delete, truncate on public.small_group_messages from authenticated;

create table if not exists public.small_group_moderation_log (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.small_groups(id) on delete cascade,
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'remove_member', 'mute_member', 'unmute_member', 'hide_message', 'pin', 'unpin',
    'set_role', 'transfer_leadership', 'leave', 'invite', 'settings_change'
  )),
  target_user_id uuid references auth.users(id) on delete set null,
  target_message_id uuid references public.small_group_messages(id) on delete set null,
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists idx_small_group_moderation_log_group
  on public.small_group_moderation_log (group_id, created_at desc);

alter table public.small_group_moderation_log enable row level security;
drop policy if exists p_small_group_moderation_log_select on public.small_group_moderation_log;
create policy p_small_group_moderation_log_select on public.small_group_moderation_log
  for select to authenticated
  using (public.is_small_group_leader(group_id, auth.uid()));
revoke all on public.small_group_moderation_log from anon;
revoke insert, update, delete, truncate on public.small_group_moderation_log from authenticated;
grant select on public.small_group_moderation_log to authenticated;

create or replace function public.small_group_log(
  p_group_id uuid, p_action text, p_target_user uuid default null,
  p_target_message uuid default null, p_detail text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.small_group_moderation_log (group_id, ministry_id, actor_id, action, target_user_id, target_message_id, detail)
  select sg.id, sg.ministry_id, auth.uid(), p_action, p_target_user, p_target_message, left(p_detail, 500)
    from public.small_groups sg where sg.id = p_group_id;
$$;
revoke all on function public.small_group_log(uuid, text, uuid, uuid, text) from public, anon, authenticated;

-- Keep two years of moderation history.
create or replace function public.small_group_moderation_log_prune()
returns integer
language sql
security definer
set search_path = public
as $$
  with d as (
    delete from public.small_group_moderation_log where created_at < now() - interval '2 years' returning 1
  ) select count(*)::integer from d;
$$;
revoke all on function public.small_group_moderation_log_prune() from public, anon, authenticated;

-- Realtime: message inserts/updates, and membership changes (so an open
-- chat learns at once that its viewer was removed). Both are filtered by
-- the select policies above per subscriber.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'small_group_messages') then
    alter publication supabase_realtime add table public.small_group_messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'small_group_members') then
    alter publication supabase_realtime add table public.small_group_members;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Chat functions
-- ─────────────────────────────────────────────────────────────────────

-- Moves the caller's read position forward (never backwards, never into
-- the future). Called only for messages actually shown on screen.
create or replace function public.group_chat_mark_read(p_group_id uuid, p_read_until timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  update public.small_group_members
     set last_read_at = greatest(coalesce(last_read_at, '-infinity'::timestamptz), least(p_read_until, now()))
   where group_id = p_group_id and user_id = auth.uid() and status = 'active';
$$;

-- The caller's own notification settings for one group. Either argument
-- may be null to leave it unchanged. (Also fixes the WhatsApp reminder
-- toggle, which members had no permission to save.)
create or replace function public.small_group_update_my_settings(
  p_group_id uuid, p_notify_level text default null, p_whatsapp_notify boolean default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_notify_level is not null and p_notify_level not in ('all', 'replies', 'muted') then
    raise exception 'Unknown notification setting %', p_notify_level using errcode = '22023';
  end if;
  update public.small_group_members
     set notify_level = coalesce(p_notify_level, notify_level),
         whatsapp_notify = coalesce(p_whatsapp_notify, whatsapp_notify)
   where group_id = p_group_id and user_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'You''re not a member of this group.' using errcode = '42501';
  end if;
end;
$$;

-- Members of the group with display names, for the chat and member list.
-- Leaders also see who is muted.
create or replace function public.group_chat_members(p_group_id uuid)
returns table (
  user_id uuid, name text, avatar_url text, role text, joined_at timestamptz, chat_muted_until timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_is_leader boolean;
begin
  if not public.is_small_group_member(p_group_id, auth.uid()) then
    raise exception 'You''re not a member of this group.' using errcode = '42501';
  end if;
  v_is_leader := public.is_small_group_leader(p_group_id, auth.uid());
  return query
    select m.user_id,
           coalesce(nullif(btrim(up.display_name), ''), nullif(btrim(up.full_name), ''), 'Member')::text,
           nullif(up.avatar_url, '')::text,
           m.role,
           coalesce(m.joined_at, m.approved_at, m.created_at),
           case when v_is_leader then m.chat_muted_until else null end
      from public.small_group_members m
      left join public.user_profiles up on up.user_id = m.user_id
     where m.group_id = p_group_id and m.status = 'active'
     order by case m.role when 'leader' then 0 when 'assistant_leader' then 1 else 2 end,
              coalesce(m.joined_at, m.created_at);
end;
$$;

-- People the caller may invite: members of the group's ministry, with
-- their current status in this group. Leaders, or any member when the
-- group allows member invitations.
create or replace function public.group_chat_invite_candidates(p_group_id uuid)
returns table (user_id uuid, name text, avatar_url text, group_status text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_group public.small_groups%rowtype;
begin
  select * into v_group from public.small_groups where id = p_group_id;
  if not (public.is_small_group_leader(p_group_id, auth.uid())
          or (v_group.members_can_invite and public.is_small_group_member(p_group_id, auth.uid()))) then
    raise exception 'You don''t have permission to invite people to this group.' using errcode = '42501';
  end if;
  -- Everyone in the ministry who isn't already an active member, by name.
  return query
    select c.user_id, c.name, c.avatar_url, c.group_status
      from (
        select distinct on (mgm.user_id)
               mgm.user_id,
               coalesce(nullif(btrim(up.display_name), ''), nullif(btrim(up.full_name), ''), 'Member')::text as name,
               nullif(up.avatar_url, '')::text as avatar_url,
               sgm.status::text as group_status
          from public.ministry_group_members mgm
          left join public.user_profiles up on up.user_id = mgm.user_id
          left join public.small_group_members sgm on sgm.group_id = p_group_id and sgm.user_id = mgm.user_id
         where mgm.ministry_id = v_group.ministry_id and mgm.user_id is not null
           and coalesce(up.is_banned, false) = false
           and sgm.status is distinct from 'active'
         order by mgm.user_id
      ) c
     order by lower(c.name);
end;
$$;

-- Invite ministry members. Returns how many invitations were sent.
-- Removed members can only be re-invited by a leader.
create or replace function public.group_chat_invite(p_group_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.small_groups%rowtype;
  v_is_leader boolean;
  v_uid uuid;
  v_status text;
  v_count integer := 0;
begin
  select * into v_group from public.small_groups where id = p_group_id;
  if v_group.id is null or v_group.status <> 'active' then
    raise exception 'This group is not accepting members.' using errcode = '22023';
  end if;
  v_is_leader := public.is_small_group_leader(p_group_id, auth.uid());
  if not (v_is_leader or (v_group.members_can_invite and public.is_small_group_member(p_group_id, auth.uid()))) then
    raise exception 'You don''t have permission to invite people to this group.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_user_ids, 1), 0) > 50 then
    raise exception 'Invite at most 50 people at a time.' using errcode = '22023';
  end if;

  foreach v_uid in array coalesce(p_user_ids, '{}') loop
    continue when v_uid = auth.uid();
    continue when not exists (
      select 1 from public.ministry_group_members where ministry_id = v_group.ministry_id and user_id = v_uid
    );
    select status into v_status from public.small_group_members where group_id = p_group_id and user_id = v_uid;
    if v_status is null then
      insert into public.small_group_members (group_id, user_id, role, status, invited_by, requested_at)
        values (p_group_id, v_uid, 'member', 'invited', auth.uid(), now());
    elsif v_status = 'declined' or (v_status = 'removed' and v_is_leader) then
      update public.small_group_members
         set status = 'invited', invited_by = auth.uid(), requested_at = now(), role = 'member'
       where group_id = p_group_id and user_id = v_uid;
    elsif v_status = 'pending' and v_is_leader then
      -- A leader inviting someone who already asked to join: let them in.
      update public.small_group_members
         set status = 'active', approved_by = auth.uid(), approved_at = now(), joined_at = now()
       where group_id = p_group_id and user_id = v_uid;
    else
      continue;
    end if;
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    perform public.small_group_log(p_group_id, 'invite', null, null, v_count || ' invited');
  end if;
  return v_count;
end;
$$;

-- The invitee accepts or declines.
create or replace function public.group_chat_respond_invite(p_group_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_accept then
    update public.small_group_members
       set status = 'active', approved_by = invited_by, approved_at = now(), joined_at = now(), last_read_at = now()
     where group_id = p_group_id and user_id = auth.uid() and status = 'invited';
  else
    update public.small_group_members
       set status = 'declined'
     where group_id = p_group_id and user_id = auth.uid() and status = 'invited';
  end if;
  if not found then
    raise exception 'This invitation is no longer available.' using errcode = 'P0002';
  end if;
end;
$$;

-- Leave a group. If the caller is the only leader, the longest-serving
-- assistant leader becomes leader; with none, ministry admins and
-- small-group coordinators keep full control of the group.
create or replace function public.group_chat_leave(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.small_group_members%rowtype;
  v_successor uuid;
begin
  select * into v_me from public.small_group_members
   where group_id = p_group_id and user_id = auth.uid() and status = 'active';
  if v_me.id is null then
    raise exception 'You''re not a member of this group.' using errcode = '42501';
  end if;

  if v_me.role = 'leader' and not exists (
    select 1 from public.small_group_members
     where group_id = p_group_id and status = 'active' and role = 'leader' and user_id <> auth.uid()
  ) then
    select user_id into v_successor from public.small_group_members
     where group_id = p_group_id and status = 'active' and role = 'assistant_leader'
     order by coalesce(joined_at, created_at) asc
     limit 1;
    if v_successor is not null then
      update public.small_group_members set role = 'leader'
       where group_id = p_group_id and user_id = v_successor;
      update public.small_groups set leader_id = v_successor where id = p_group_id;
      perform public.small_group_log(p_group_id, 'transfer_leadership', v_successor, null, 'Previous leader left');
    else
      update public.small_groups set leader_id = null where id = p_group_id and leader_id = auth.uid();
    end if;
  end if;

  perform public.small_group_log(p_group_id, 'leave', auth.uid());
  delete from public.small_group_members where id = v_me.id;
end;
$$;

-- Remove a member (moderators; only owners may remove a leader or an
-- assistant leader). The row stays with status 'removed' so they can't
-- simply rejoin; a leader can invite them back.
create or replace function public.group_chat_remove_member(p_group_id uuid, p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.small_group_members%rowtype;
begin
  if not public.is_small_group_leader(p_group_id, auth.uid()) then
    raise exception 'Only group leaders can remove members.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use Leave group to leave.' using errcode = '22023';
  end if;
  select * into v_target from public.small_group_members where group_id = p_group_id and user_id = p_user_id;
  if v_target.id is null or v_target.status not in ('active', 'invited', 'pending') then
    raise exception 'That person is not in this group.' using errcode = 'P0002';
  end if;
  if v_target.role <> 'member' and not public.is_small_group_owner(p_group_id, auth.uid()) then
    raise exception 'Only the group leader can remove a leader or assistant leader.' using errcode = '42501';
  end if;
  update public.small_group_members
     set status = 'removed', role = 'member', chat_muted_until = null
   where id = v_target.id;
  perform public.small_group_log(p_group_id, 'remove_member', p_user_id, null, p_reason);
end;
$$;

-- Pause (or with p_until null, resume) a member's messages.
create or replace function public.group_chat_mute_member(
  p_group_id uuid, p_user_id uuid, p_until timestamptz, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.small_group_members%rowtype;
begin
  if not public.is_small_group_leader(p_group_id, auth.uid()) then
    raise exception 'Only group leaders can mute members.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You can''t mute yourself.' using errcode = '22023';
  end if;
  select * into v_target from public.small_group_members
   where group_id = p_group_id and user_id = p_user_id and status = 'active';
  if v_target.id is null then
    raise exception 'That person is not in this group.' using errcode = 'P0002';
  end if;
  if v_target.role <> 'member' and not public.is_small_group_owner(p_group_id, auth.uid()) then
    raise exception 'Only the group leader can mute a leader or assistant leader.' using errcode = '42501';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'Choose a time in the future.' using errcode = '22023';
  end if;
  update public.small_group_members set chat_muted_until = p_until where id = v_target.id;
  perform public.small_group_log(p_group_id, case when p_until is null then 'unmute_member' else 'mute_member' end,
                                 p_user_id, null, p_reason);
end;
$$;

-- Change a member's role (owners only). The last leader can't step down
-- this way; use group_chat_transfer_leadership.
create or replace function public.group_chat_set_member_role(p_group_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.small_group_members%rowtype;
begin
  if p_role not in ('leader', 'assistant_leader', 'member') then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;
  if not public.is_small_group_owner(p_group_id, auth.uid()) then
    raise exception 'Only the group leader can change member roles.' using errcode = '42501';
  end if;
  select * into v_target from public.small_group_members
   where group_id = p_group_id and user_id = p_user_id and status = 'active';
  if v_target.id is null then
    raise exception 'That person is not in this group.' using errcode = 'P0002';
  end if;
  if v_target.role = p_role then
    return;
  end if;
  if v_target.role = 'leader' and not exists (
    select 1 from public.small_group_members
     where group_id = p_group_id and status = 'active' and role = 'leader' and user_id <> p_user_id
  ) then
    raise exception 'Choose a new leader first, then change this role.' using errcode = '22023';
  end if;
  update public.small_group_members set role = p_role, chat_muted_until = null where id = v_target.id;
  if p_role = 'leader' then
    update public.small_groups set leader_id = p_user_id where id = p_group_id and leader_id is null;
  elsif v_target.role = 'leader' then
    update public.small_groups set leader_id = (
      select user_id from public.small_group_members
       where group_id = p_group_id and status = 'active' and role = 'leader'
       order by coalesce(joined_at, created_at) limit 1)
     where id = p_group_id and leader_id = p_user_id;
  end if;
  perform public.small_group_log(p_group_id, 'set_role', p_user_id, null, v_target.role || ' -> ' || p_role);
end;
$$;

-- Hand leadership to another active member; the caller (if a leader)
-- becomes an assistant leader.
create or replace function public.group_chat_transfer_leadership(p_group_id uuid, p_new_leader uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_small_group_owner(p_group_id, auth.uid()) then
    raise exception 'Only the group leader can hand over leadership.' using errcode = '42501';
  end if;
  if p_new_leader = auth.uid() then
    raise exception 'Choose someone else.' using errcode = '22023';
  end if;
  update public.small_group_members set role = 'leader', chat_muted_until = null
   where group_id = p_group_id and user_id = p_new_leader and status = 'active';
  if not found then
    raise exception 'That person is not in this group.' using errcode = 'P0002';
  end if;
  update public.small_group_members set role = 'assistant_leader'
   where group_id = p_group_id and user_id = auth.uid() and status = 'active' and role = 'leader';
  update public.small_groups set leader_id = p_new_leader where id = p_group_id;
  perform public.small_group_log(p_group_id, 'transfer_leadership', p_new_leader);
end;
$$;

-- Pin or unpin a message (moderators). At most 10 pins per group.
create or replace function public.group_chat_pin_message(p_message_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.small_group_messages%rowtype;
begin
  select * into v_msg from public.small_group_messages where id = p_message_id;
  if v_msg.id is null or not public.is_small_group_leader(v_msg.group_id, auth.uid()) then
    raise exception 'Only group leaders can pin messages.' using errcode = '42501';
  end if;
  if p_pinned then
    if v_msg.deleted_at is not null then
      raise exception 'A removed message can''t be pinned.' using errcode = '22023';
    end if;
    if v_msg.pinned_at is null and (
      select count(*) from public.small_group_messages where group_id = v_msg.group_id and pinned_at is not null
    ) >= 10 then
      raise exception 'A group can have up to 10 pinned messages. Unpin one first.' using errcode = '22023';
    end if;
    update public.small_group_messages set pinned_at = coalesce(pinned_at, now()), pinned_by = auth.uid()
     where id = p_message_id;
  else
    update public.small_group_messages set pinned_at = null, pinned_by = null where id = p_message_id;
  end if;
  perform public.small_group_log(v_msg.group_id, case when p_pinned then 'pin' else 'unpin' end,
                                 v_msg.sender_id, p_message_id);
end;
$$;

-- Delete your own message, or hide anyone's as a moderator. The row stays
-- (so replies keep their place) with its content cleared. Returns the
-- attachment path, if any, so the app can remove the stored image.
create or replace function public.group_chat_delete_message(p_message_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.small_group_messages%rowtype;
  v_is_mod boolean;
begin
  select * into v_msg from public.small_group_messages where id = p_message_id;
  if v_msg.id is null then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;
  v_is_mod := public.is_small_group_leader(v_msg.group_id, auth.uid());
  if not (v_is_mod or (v_msg.sender_id = auth.uid() and public.is_small_group_member(v_msg.group_id, auth.uid()))) then
    raise exception 'You can only delete your own messages.' using errcode = '42501';
  end if;
  if v_msg.deleted_at is not null then
    return null;
  end if;
  update public.small_group_messages
     set deleted_at = now(), deleted_by = auth.uid(), body = '', scripture_ref = null,
         attachment_path = null, attachment_width = null, attachment_height = null,
         pinned_at = null, pinned_by = null
   where id = p_message_id;
  if v_msg.sender_id is distinct from auth.uid() then
    perform public.small_group_log(v_msg.group_id, 'hide_message', v_msg.sender_id, p_message_id, p_reason);
  end if;
  return v_msg.attachment_path;
end;
$$;

-- Share a prayer request: one transaction adds it to the group's prayer
-- list (small_group_posts) and posts a prayer card in the chat. Safe to
-- retry with the same client id.
create or replace function public.group_chat_share_prayer(
  p_group_id uuid, p_body text, p_client_id uuid, p_reply_to uuid default null)
returns public.small_group_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.small_group_messages%rowtype;
  v_post_id uuid;
  v_msg public.small_group_messages%rowtype;
begin
  select * into v_existing from public.small_group_messages
   where sender_id = auth.uid() and client_id = p_client_id;
  if v_existing.id is not null then
    return v_existing;
  end if;
  if not public.is_small_group_member(p_group_id, auth.uid()) then
    raise exception 'You''re not a member of this group.' using errcode = '42501';
  end if;
  if p_body is null or char_length(btrim(p_body)) = 0 or char_length(p_body) > 2000 then
    raise exception 'A prayer request needs 1 to 2,000 characters.' using errcode = '22023';
  end if;

  insert into public.small_group_posts (group_id, author_id, post_type, content)
    values (p_group_id, auth.uid(), 'prayer_request', btrim(p_body))
    returning id into v_post_id;

  insert into public.small_group_messages (group_id, sender_id, client_id, message_type, body, prayer_post_id, reply_to_id)
    values (p_group_id, auth.uid(), p_client_id, 'prayer_request', p_body, v_post_id, p_reply_to)
    returning * into v_msg;
  return v_msg;
end;
$$;

-- The caller's groups (all ministries) for the Messages inbox: active
-- memberships with last message and unread count, plus open invitations.
create or replace function public.my_group_chats()
returns table (
  group_id uuid, ministry_id uuid, ministry_name text, name text, cover_image_url text,
  category text, member_count integer, role text, membership_status text, notify_level text,
  chat_enabled boolean, last_message_at timestamptz, last_message_type text, last_message_body text,
  last_sender_id uuid, last_sender_name text, last_message_deleted boolean, unread_count integer,
  invited_by_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select sg.id, sg.ministry_id, mg.name::text, sg.name, sg.cover_image_url,
         sg.category, sg.member_count, m.role, m.status, m.notify_level,
         sg.chat_enabled, sg.last_message_at,
         lm.message_type,
         left(case when lm.message_type = 'scripture'
                   then concat_ws(' · ', lm.scripture_ref, nullif(lm.body, ''))
                   else lm.body end, 140),
         lm.sender_id,
         coalesce(nullif(btrim(lp.display_name), ''), nullif(btrim(lp.full_name), ''))::text,
         lm.deleted_at is not null,
         case when m.status = 'active' then (
           select count(*)::integer from (
             select 1 from public.small_group_messages x
              where x.group_id = sg.id
                and x.created_at > coalesce(m.last_read_at, m.joined_at, m.approved_at, m.created_at)
                and x.sender_id is distinct from auth.uid()
                and x.deleted_at is null
                and x.message_type <> 'system'
              limit 100
           ) u
         ) else 0 end,
         coalesce(nullif(btrim(ip.display_name), ''), nullif(btrim(ip.full_name), ''))::text
    from public.small_group_members m
    join public.small_groups sg on sg.id = m.group_id
    left join public.ministry_groups mg on mg.id = sg.ministry_id
    left join lateral (
      select x.* from public.small_group_messages x
       where x.group_id = sg.id and m.status = 'active'
       order by x.created_at desc, x.id desc
       limit 1
    ) lm on true
    left join public.user_profiles lp on lp.user_id = lm.sender_id
    left join public.user_profiles ip on ip.user_id = m.invited_by and m.status = 'invited'
   where m.user_id = auth.uid()
     and m.status in ('active', 'invited')
     and sg.status = 'active'
   order by (m.status = 'invited') desc, coalesce(sg.last_message_at, m.joined_at, m.created_at) desc;
$$;

-- Moderation history for leaders, with names.
create or replace function public.group_chat_moderation_log(p_group_id uuid, p_limit integer default 50)
returns table (
  id uuid, action text, created_at timestamptz, detail text,
  actor_name text, target_name text, target_message_id uuid
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_small_group_leader(p_group_id, auth.uid()) then
    raise exception 'Only group leaders can view the moderation log.' using errcode = '42501';
  end if;
  return query
    select l.id, l.action, l.created_at, l.detail,
           coalesce(nullif(btrim(a.display_name), ''), nullif(btrim(a.full_name), ''), 'Someone')::text,
           coalesce(nullif(btrim(t.display_name), ''), nullif(btrim(t.full_name), ''))::text,
           l.target_message_id
      from public.small_group_moderation_log l
      left join public.user_profiles a on a.user_id = l.actor_id
      left join public.user_profiles t on t.user_id = l.target_user_id
     where l.group_id = p_group_id
     order by l.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.group_chat_mark_read(uuid, timestamptz)',
    'public.small_group_update_my_settings(uuid, text, boolean)',
    'public.group_chat_members(uuid)',
    'public.group_chat_invite_candidates(uuid)',
    'public.group_chat_invite(uuid, uuid[])',
    'public.group_chat_respond_invite(uuid, boolean)',
    'public.group_chat_leave(uuid)',
    'public.group_chat_remove_member(uuid, uuid, text)',
    'public.group_chat_mute_member(uuid, uuid, timestamptz, text)',
    'public.group_chat_set_member_role(uuid, uuid, text)',
    'public.group_chat_transfer_leadership(uuid, uuid)',
    'public.group_chat_pin_message(uuid, boolean)',
    'public.group_chat_delete_message(uuid, text)',
    'public.group_chat_share_prayer(uuid, text, uuid, uuid)',
    'public.my_group_chats()',
    'public.group_chat_moderation_log(uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Image storage: private bucket, members only
--    Path: <group_id>/<sender_id>/<client_id>-{full|thumb}.<ext>
-- ─────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-chat-media', 'group-chat-media', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists p_group_chat_media_select on storage.objects;
create policy p_group_chat_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'group-chat-media'
    and public.is_small_group_member(public.try_uuid((storage.foldername(name))[1]), auth.uid())
  );

drop policy if exists p_group_chat_media_insert on storage.objects;
create policy p_group_chat_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'group-chat-media'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_small_group_member(public.try_uuid((storage.foldername(name))[1]), auth.uid())
  );

drop policy if exists p_group_chat_media_delete on storage.objects;
create policy p_group_chat_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'group-chat-media'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_small_group_leader(public.try_uuid((storage.foldername(name))[1]), auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 7. Moderation tools (0388): chat messages are reportable/removable
-- ─────────────────────────────────────────────────────────────────────

alter table public.flagged_content drop constraint if exists flagged_content_content_type_check;
alter table public.flagged_content
  add constraint flagged_content_content_type_check check (content_type in (
    'post', 'comment', 'live_stream', 'profile', 'message',
    'chat_messages', 'room_chat_messages', 'channel_chat_messages',
    'meeting_chat_messages', 'group_messages', 'prayer_group_messages',
    'prayer_wall_posts', 'prayer_wall_responses', 'community_activities',
    'community_questions', 'community_answers', 'ministry_testimonies',
    'voice_notes', 'meeting_chat', 'small_group_posts', 'small_group_messages',
    'community_revelations', 'app_testimonies', 'ministry_prayer_requests',
    'counselling_session_messages', 'user',
    'community_revelation_comments', 'app_testimony_comments'
  ));

create or replace function public.ugc_source(p_content_type text,
  out tbl text, out author_col text, out preview_expr text, out id_type text)
language sql
immutable
as $$
  select m.tbl, m.author_col, m.preview_expr, m.id_type from (values
    ('chat_messages',        'chat_messages',         'sender_id', 'content',                               'uuid'),
    ('room_chat_messages',    'room_chat_messages',    'user_id',   'content',                               'uuid'),
    ('channel_chat_messages', 'channel_chat_messages', 'user_id',   'message',                               'uuid'),
    ('meeting_chat_messages', 'meeting_chat_messages', 'sender_id', 'content',                               'uuid'),
    ('prayer_wall_posts',     'prayer_wall_posts',     'user_id',   'concat_ws(E''\n'', title, content)',    'bigint'),
    ('prayer_wall_responses', 'prayer_wall_responses', 'user_id',   'response',                              'bigint'),
    ('community_activities',  'community_activities',  'user_id',   'concat_ws(E''\n'', title, content)',    'uuid'),
    ('community_questions',   'community_questions',   'user_id',   'concat_ws(E''\n'', title, content)',    'uuid'),
    ('community_answers',     'community_answers',     'user_id',   'content',                               'uuid'),
    ('ministry_testimonies',  'ministry_testimonies',  'user_id',   'concat_ws(E''\n'', title, content)',    'uuid'),
    ('voice_notes',           'voice_notes',           'user_id',   '''Voice note: '' || file_url',          'bigint'),
    -- The tables the apps actually use for meeting chat and small groups.
    ('meeting_chat',          'meeting_chat',          'user_id',   'content',                               'uuid'),
    ('small_group_posts',     'small_group_posts',     'author_id', 'concat_ws(E''\n'', title, content)',    'uuid'),
    ('small_group_messages',  'small_group_messages',  'sender_id', 'case when attachment_path is not null then ''[Image] '' else '''' end || body', 'uuid'),
    ('community_revelations', 'community_revelations', 'user_id',   'concat_ws(E''\n'', title, content)',    'uuid'),
    ('app_testimonies',       'app_testimonies',       'user_id',   'concat_ws(E''\n'', title, content)',    'uuid'),
    ('ministry_prayer_requests', 'ministry_prayer_requests', 'user_id', 'concat_ws(E''\n'', title, content)', 'uuid'),
    ('counselling_session_messages', 'counselling_session_messages', 'user_id', 'message', 'uuid')
  ) as m(ct, tbl, author_col, preview_expr, id_type)
  where m.ct = p_content_type;
$$;

create or replace function public.moderation_remove_content(p_report_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.flagged_content;
  src record;
  v_parent text;
begin
  if not public.is_moderation_admin(auth.uid()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into r from public.flagged_content where id = p_report_id;
  if r.id is null then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if r.content_type = 'user' then
    raise exception 'A profile report can''t be removed as content — ban the user instead'
      using errcode = '22023';
  end if;

  v_parent := public.ugc_comment_parent(r.content_type);
  if v_parent is not null then
    -- Drop just that comment from the post's jsonb array.
    execute format(
      'update public.%I p
          set comments = coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(p.comments, ''[]''::jsonb)) e
                                    where e->>''id'' <> $2), ''[]''::jsonb)
        where p.id = $1::uuid', v_parent)
      using split_part(r.content_id, ':', 1), split_part(r.content_id, ':', 2);
    perform public.moderation_close_report(p_report_id, 'resolved', 'content_removed', p_notes);
    return;
  end if;

  select * into src from public.ugc_source(r.content_type);
  if src.tbl is null then
    raise exception 'Unsupported content type %', r.content_type using errcode = '22023';
  end if;

  -- Soft-delete where the table already has a flag the apps respect, so
  -- threads and replies aren't broken; hard-delete everywhere else.
  if src.tbl in ('room_chat_messages') then
    execute format('update public.%I set is_deleted = true, deleted_at = now() where id = $1::%s', src.tbl, src.id_type)
      using r.content_id;
  elsif src.tbl = 'small_group_messages' then
    update public.small_group_messages
       set deleted_at = now(), deleted_by = auth.uid(), body = '', scripture_ref = null,
           attachment_path = null, attachment_width = null, attachment_height = null,
           pinned_at = null, pinned_by = null
     where id = r.content_id::uuid and deleted_at is null;
  elsif src.tbl in ('prayer_wall_posts', 'community_revelations', 'app_testimonies') then
    execute format('update public.%I set is_hidden = true where id = $1::%s', src.tbl, src.id_type)
      using r.content_id;
  else
    execute format('delete from public.%I where id = $1::%s', src.tbl, src.id_type)
      using r.content_id;
  end if;

  perform public.moderation_close_report(p_report_id, 'resolved', 'content_removed', p_notes);
end;
$$;

commit;
