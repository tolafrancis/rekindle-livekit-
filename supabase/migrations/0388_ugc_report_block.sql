-- 0388_ugc_report_block.sql
--
-- Google Play User-Generated Content policy: users must be able to report
-- objectionable content and block abusive users, and the platform must act
-- on reports. This adds:
--
--   1. public.user_blocks (+ RLS: you only see/manage your own blocks)
--   2. flagged_content reworked as the report inbox for every UGC table:
--      text content_id (prayer wall / voice notes use bigint ids), wider
--      content_type/reason checks, reported_user_id + content_preview
--      snapshotted server-side, self-reports rejected, insert RLS for
--      reporters, select/update RLS for moderators.
--   3. Moderator RPCs: dismiss / remove content / ban user.
--   4. Enforcement in the database, not just the UI:
--      - banned users can't insert into any UGC table
--      - a blocked user can't send a private message or counselling
--        message to (or book a counselling session with) the blocker
--   5. counselling_session_messages: the in-call counselling chat
--      (CounsellingChatSidebar.tsx) has always read and written this table,
--      but no migration ever created it, so that chat silently failed.
--   6. get_public_profile(): the name/avatar for the profile sheet behind
--      "Report user" / "Block" (user_profiles RLS hides other users' rows).
--   7. Closes a privilege hole: user_profiles' own_profile_update policy let
--      any user set their own is_admin / is_banned / role. A banned user
--      could unban themselves, and anyone could promote themselves to admin
--      (which now also means moderator). Those columns are now admin-only.

-- ---------------------------------------------------------------------------
-- Who counts as a moderator
-- ---------------------------------------------------------------------------
create or replace function public.is_moderation_admin(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and (
    exists (
      select 1 from public.user_profiles
      where user_id = p_uid
        and (is_admin = true or role in ('admin', 'super_admin', 'moderator'))
    )
    or exists (
      select 1 from public.platform_admins
      where user_id = p_uid and is_active = true
    )
  );
$$;

revoke all on function public.is_moderation_admin(uuid) from public, anon;
grant execute on function public.is_moderation_admin(uuid) to authenticated, service_role;

-- True when the request comes from a trusted backend (service role, SQL
-- editor, migrations, auth triggers) rather than an anon/authenticated
-- client. Reads the request's JWT role, not current_user: inside the
-- SECURITY DEFINER triggers below current_user is always the owner.
create or replace function public.is_backend_request()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') not in ('anon', 'authenticated');
$$;

-- ---------------------------------------------------------------------------
-- 5. Protect privileged user_profiles columns
-- ---------------------------------------------------------------------------
create or replace function public.guard_user_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_backend_request() or public.is_moderation_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.is_banned := false;
    if new.role in ('admin', 'super_admin', 'moderator') then
      new.role := 'user';
    end if;
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin
     or new.is_banned is distinct from old.is_banned
     or (new.role is distinct from old.role
         and (new.role in ('admin', 'super_admin', 'moderator')
              or old.role in ('admin', 'super_admin', 'moderator'))) then
    raise exception 'Only an administrator can change admin, role or ban status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_user_profile_privileged_columns on public.user_profiles;
create trigger guard_user_profile_privileged_columns
  before insert or update on public.user_profiles
  for each row execute function public.guard_user_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- 1. user_blocks
-- ---------------------------------------------------------------------------
create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own" on public.user_blocks
  for select to authenticated using (blocker_id = auth.uid());

drop policy if exists "user_blocks_insert_own" on public.user_blocks;
create policy "user_blocks_insert_own" on public.user_blocks
  for insert to authenticated with check (blocker_id = auth.uid());

drop policy if exists "user_blocks_delete_own" on public.user_blocks;
create policy "user_blocks_delete_own" on public.user_blocks
  for delete to authenticated using (blocker_id = auth.uid());

grant select, insert, delete on public.user_blocks to authenticated;

-- Does p_blocker block p_blocked? SECURITY DEFINER so enforcement triggers
-- can see the OTHER user's block list, which RLS hides from the sender.
create or replace function public.is_user_blocked(p_blocker uuid, p_blocked uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where blocker_id = p_blocker and blocked_id = p_blocked
  );
$$;

revoke all on function public.is_user_blocked(uuid, uuid) from public, anon;
grant execute on function public.is_user_blocked(uuid, uuid) to authenticated, service_role;

-- Settings > Privacy > Blocked users. user_profiles RLS only lets a user
-- read their own row, so names for the people *you* blocked come from here.
create or replace function public.list_my_blocked_users()
returns table (blocked_id uuid, created_at timestamptz, name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select b.blocked_id, b.created_at,
         coalesce(p.display_name, p.full_name)::text,
         nullif(p.avatar_url, '')::text
    from public.user_blocks b
    left join public.user_profiles p on p.user_id = b.blocked_id
   where b.blocker_id = auth.uid()
   order by b.created_at desc;
$$;

revoke all on function public.list_my_blocked_users() from public, anon;
grant execute on function public.list_my_blocked_users() to authenticated;

-- Profile sheet (Report user / Block). Only public-facing fields, and only
-- for accounts that aren't banned.
create or replace function public.get_public_profile(p_user_id uuid)
returns table (user_id uuid, name text, avatar_url text, member_since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id,
         coalesce(p.display_name, p.full_name)::text,
         nullif(p.avatar_url, '')::text,
         p.created_at
    from public.user_profiles p
   where p.user_id = p_user_id
     and coalesce(p.is_banned, false) = false
   limit 1;
$$;

revoke all on function public.get_public_profile(uuid) from public, anon;
grant execute on function public.get_public_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- counselling_session_messages (in-call counselling chat)
-- ---------------------------------------------------------------------------
create table if not exists public.counselling_session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.counselling_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,
  message text not null check (length(message) between 1 and 4000),
  is_host boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists counselling_session_messages_session_idx
  on public.counselling_session_messages (session_id, created_at);

alter table public.counselling_session_messages enable row level security;

-- The client and the counsellor of a session, plus moderators.
create or replace function public.is_counselling_participant(p_session_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.counselling_sessions s
      left join public.counsellors c on c.id = s.counsellor_id
     where s.id = p_session_id
       and (s.user_id = p_uid or c.user_id = p_uid)
  );
$$;

revoke all on function public.is_counselling_participant(uuid, uuid) from public, anon;
grant execute on function public.is_counselling_participant(uuid, uuid) to authenticated;

drop policy if exists "csm_select_participants" on public.counselling_session_messages;
create policy "csm_select_participants" on public.counselling_session_messages
  for select to authenticated
  using (public.is_counselling_participant(session_id, auth.uid()) or public.is_moderation_admin(auth.uid()));

drop policy if exists "csm_insert_participants" on public.counselling_session_messages;
create policy "csm_insert_participants" on public.counselling_session_messages
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_counselling_participant(session_id, auth.uid()));

grant select, insert on public.counselling_session_messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'counselling_session_messages'
  ) then
    alter publication supabase_realtime add table public.counselling_session_messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. flagged_content as the report inbox
-- ---------------------------------------------------------------------------
-- Table is empty in production (checked 2026-10-03), so the type change and
-- FK swap are safe.
alter table public.flagged_content
  alter column content_id type text using content_id::text;

alter table public.flagged_content
  add column if not exists reported_user_id uuid references auth.users(id) on delete set null,
  add column if not exists content_preview text;

-- reviewed_by pointed at platform_admins(id), which excludes moderators who
-- are admins via user_profiles. Store the reviewing user instead.
alter table public.flagged_content drop constraint if exists flagged_content_reviewed_by_fkey;
alter table public.flagged_content
  add constraint flagged_content_reviewed_by_fkey
  foreign key (reviewed_by) references auth.users(id) on delete set null;

alter table public.flagged_content drop constraint if exists flagged_content_content_type_check;
alter table public.flagged_content
  add constraint flagged_content_content_type_check check (content_type in (
    -- legacy values
    'post', 'comment', 'live_stream', 'profile', 'message',
    -- one per UGC table, plus a whole profile
    'chat_messages', 'room_chat_messages', 'channel_chat_messages',
    'meeting_chat_messages', 'group_messages', 'prayer_group_messages',
    'prayer_wall_posts', 'prayer_wall_responses', 'community_activities',
    'community_questions', 'community_answers', 'ministry_testimonies',
    'voice_notes', 'meeting_chat', 'small_group_posts',
    'community_revelations', 'app_testimonies', 'ministry_prayer_requests',
    'counselling_session_messages', 'user'
  ));

alter table public.flagged_content drop constraint if exists flagged_content_reason_check;
alter table public.flagged_content
  add constraint flagged_content_reason_check check (reason in (
    'spam', 'harassment', 'hate_speech', 'sexual_content', 'violence', 'other',
    -- legacy values
    'misinformation', 'inappropriate_content', 'copyright'
  ));

create index if not exists flagged_content_status_flagged_at_idx
  on public.flagged_content (status, flagged_at desc);
create index if not exists flagged_content_reported_user_idx
  on public.flagged_content (reported_user_id);
-- One open report per reporter per item; a repeat tap is a no-op (23505).
create unique index if not exists flagged_content_one_pending_per_reporter
  on public.flagged_content (flagged_by, content_type, content_id)
  where status = 'pending';

-- Where each reportable content_type lives. One place to extend.
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
    ('group_messages',        'group_messages',        'user_id',   'message',                               'uuid'),
    ('prayer_group_messages', 'prayer_group_messages', 'user_id',   'content',                               'uuid'),
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
    ('community_revelations', 'community_revelations', 'user_id',   'concat_ws(E''\n'', title, content)',    'uuid'),
    ('app_testimonies',       'app_testimonies',       'user_id',   'concat_ws(E''\n'', title, content)',    'uuid'),
    ('ministry_prayer_requests', 'ministry_prayer_requests', 'user_id', 'concat_ws(E''\n'', title, content)', 'uuid'),
    ('counselling_session_messages', 'counselling_session_messages', 'user_id', 'message', 'uuid')
  ) as m(ct, tbl, author_col, preview_expr, id_type)
  where m.ct = p_content_type;
$$;

-- Fill in who wrote the reported item and a snapshot of it (so moderators
-- still see what was reported after it's edited or removed), and reject
-- reports of your own content. Runs for every insert, so a client can't
-- forge reported_user_id or skip the self-report check.
create or replace function public.flagged_content_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  src record;
  v_author uuid;
  v_author_text text;
  v_preview text;
begin
  if not public.is_backend_request() then
    new.flagged_by := auth.uid();
    new.status := 'pending';
    new.assigned_to := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_notes := null;
    new.action_taken := null;
  end if;

  if new.content_type = 'user' then
    v_author := new.content_id::uuid;
    select coalesce(display_name, full_name) into v_preview
      from public.user_profiles where user_id = v_author limit 1;
    v_preview := coalesce('Profile: ' || v_preview, 'Profile');
  else
    select * into src from public.ugc_source(new.content_type);
    if src.tbl is not null then
      -- Author read as text: meeting_chat.user_id is text and can hold a
      -- guest id that isn't a user uuid.
      execute format('select %I::text, left((%s)::text, 1000) from public.%I where id = $1::%s',
                     src.author_col, src.preview_expr, src.tbl, src.id_type)
        into v_author_text, v_preview
        using new.content_id;
      if v_author_text is null and v_preview is null then
        raise exception 'That content no longer exists' using errcode = 'P0002';
      end if;
      if v_author_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_author := v_author_text::uuid;
      end if;
    end if;
  end if;

  if v_author is not null and v_author = new.flagged_by then
    raise exception 'You can''t report your own content' using errcode = '42501';
  end if;

  new.reported_user_id := coalesce(v_author, new.reported_user_id);
  new.content_preview := coalesce(v_preview, new.content_preview);
  return new;
end;
$$;

drop trigger if exists flagged_content_before_insert on public.flagged_content;
create trigger flagged_content_before_insert
  before insert on public.flagged_content
  for each row execute function public.flagged_content_before_insert();

alter table public.flagged_content enable row level security;

drop policy if exists "flagged_content_insert_reporter" on public.flagged_content;
create policy "flagged_content_insert_reporter" on public.flagged_content
  for insert to authenticated
  with check (flagged_by = auth.uid() and status = 'pending');

drop policy if exists "flagged_content_select_moderators" on public.flagged_content;
create policy "flagged_content_select_moderators" on public.flagged_content
  for select to authenticated using (public.is_moderation_admin(auth.uid()));

drop policy if exists "flagged_content_update_moderators" on public.flagged_content;
create policy "flagged_content_update_moderators" on public.flagged_content
  for update to authenticated
  using (public.is_moderation_admin(auth.uid()))
  with check (public.is_moderation_admin(auth.uid()));

grant select, insert, update on public.flagged_content to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Moderator actions
-- ---------------------------------------------------------------------------
create or replace function public.moderation_close_report(
  p_report_id uuid, p_status text, p_action text, p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.flagged_content;
begin
  select * into r from public.flagged_content where id = p_report_id;
  if r.id is null then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  -- Close this report and any other open ones about the same thing.
  update public.flagged_content
     set status = p_status,
         action_taken = p_action,
         review_notes = coalesce(p_notes, review_notes),
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   where id = p_report_id
      or (status in ('pending', 'under_review')
          and content_type = r.content_type
          and content_id = r.content_id);
end;
$$;

revoke all on function public.moderation_close_report(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.moderation_dismiss_report(p_report_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderation_admin(auth.uid()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  perform public.moderation_close_report(p_report_id, 'dismissed', 'dismissed', p_notes);
end;
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

  select * into src from public.ugc_source(r.content_type);
  if src.tbl is null then
    raise exception 'Unsupported content type %', r.content_type using errcode = '22023';
  end if;

  -- Soft-delete where the table already has a flag the apps respect, so
  -- threads and replies aren't broken; hard-delete everywhere else.
  if src.tbl in ('room_chat_messages') then
    execute format('update public.%I set is_deleted = true, deleted_at = now() where id = $1::%s', src.tbl, src.id_type)
      using r.content_id;
  elsif src.tbl = 'prayer_group_messages' then
    execute format('update public.%I set is_deleted = true where id = $1::%s', src.tbl, src.id_type)
      using r.content_id;
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

create or replace function public.moderation_ban_user(p_report_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.flagged_content;
begin
  if not public.is_moderation_admin(auth.uid()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into r from public.flagged_content where id = p_report_id;
  if r.id is null then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if r.reported_user_id is null then
    raise exception 'This report has no identifiable author to ban' using errcode = '22023';
  end if;
  if public.is_moderation_admin(r.reported_user_id) then
    raise exception 'Administrators can''t be banned from here' using errcode = '42501';
  end if;

  update public.user_profiles set is_banned = true
   where user_id = r.reported_user_id;

  -- Sign them out everywhere: revoke refresh tokens so no session can be
  -- renewed. The apps also sign out as soon as they see is_banned.
  begin
    delete from auth.sessions where user_id = r.reported_user_id;
  exception when others then
    raise warning 'moderation_ban_user: could not revoke sessions for %: %', r.reported_user_id, sqlerrm;
  end;

  perform public.moderation_close_report(p_report_id, 'resolved', 'user_banned', p_notes);
end;
$$;

revoke all on function public.moderation_dismiss_report(uuid, text) from public, anon;
revoke all on function public.moderation_remove_content(uuid, text) from public, anon;
revoke all on function public.moderation_ban_user(uuid, text) from public, anon;
grant execute on function public.moderation_dismiss_report(uuid, text) to authenticated;
grant execute on function public.moderation_remove_content(uuid, text) to authenticated;
grant execute on function public.moderation_ban_user(uuid, text) to authenticated;

-- Moderators need to see who reported and who was reported.
create or replace function public.moderation_list_reports(p_status text default null, p_limit int default 200)
returns table (
  id uuid,
  content_type text,
  content_id text,
  content_url text,
  content_preview text,
  reason text,
  description text,
  status text,
  action_taken text,
  review_notes text,
  flagged_at timestamptz,
  reviewed_at timestamptz,
  flagged_by uuid,
  reporter_name text,
  reported_user_id uuid,
  reported_user_name text,
  reported_user_is_banned boolean,
  ministry_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_moderation_admin(auth.uid()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select f.id, f.content_type, f.content_id, f.content_url, f.content_preview,
         f.reason, f.description, f.status, f.action_taken, f.review_notes,
         f.flagged_at, f.reviewed_at,
         f.flagged_by, coalesce(rp.display_name, rp.full_name, ru.email)::text,
         f.reported_user_id, coalesce(tp.display_name, tp.full_name, tu.email)::text,
         coalesce(tp.is_banned, false),
         f.ministry_id
    from public.flagged_content f
    left join public.user_profiles rp on rp.user_id = f.flagged_by
    left join auth.users ru on ru.id = f.flagged_by
    left join public.user_profiles tp on tp.user_id = f.reported_user_id
    left join auth.users tu on tu.id = f.reported_user_id
   where p_status is null or f.status = p_status
   order by (f.status = 'pending') desc, f.flagged_at desc
   limit greatest(1, least(p_limit, 500));
end;
$$;

revoke all on function public.moderation_list_reports(text, int) from public, anon;
grant execute on function public.moderation_list_reports(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4a. Banned users can't post anywhere
-- ---------------------------------------------------------------------------
create or replace function public.reject_banned_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_backend_request() then
    return new;
  end if;
  if exists (select 1 from public.user_profiles where user_id = auth.uid() and is_banned = true) then
    raise exception 'Your account has been suspended for violating our Community Guidelines'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'chat_messages', 'room_chat_messages', 'channel_chat_messages',
    'meeting_chat_messages', 'group_messages', 'prayer_group_messages',
    'prayer_wall_posts', 'prayer_wall_responses', 'community_activities',
    'community_questions', 'community_answers', 'ministry_testimonies',
    'voice_notes', 'counselling_messages', 'counselling_sessions',
    'meeting_chat', 'small_group_posts', 'community_revelations', 'app_testimonies',
    'ministry_prayer_requests', 'counselling_session_messages'
  ] loop
    execute format('drop trigger if exists reject_banned_author on public.%I', t);
    execute format('create trigger reject_banned_author before insert on public.%I
                    for each row execute function public.reject_banned_author()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4b. Blocked users can't reach the blocker privately
-- ---------------------------------------------------------------------------
-- Private messages live in the meeting/room chat tables (is_private +
-- recipient_id, which is text there).
create or replace function public.reject_blocked_private_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid;
  v_recipient uuid;
  v_recipient_text text;
begin
  if public.is_backend_request() then
    return new;
  end if;

  v_recipient_text := to_jsonb(new) ->> 'recipient_id';
  if v_recipient_text is null or v_recipient_text !~* '^[0-9a-f-]{36}$' then
    return new;
  end if;
  v_recipient := v_recipient_text::uuid;
  v_sender := coalesce((to_jsonb(new) ->> 'sender_id')::uuid, (to_jsonb(new) ->> 'user_id')::uuid, auth.uid());

  if public.is_user_blocked(v_recipient, v_sender) then
    raise exception 'You can''t message this person' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['chat_messages', 'room_chat_messages', 'meeting_chat_messages'] loop
    execute format('drop trigger if exists reject_blocked_private_message on public.%I', t);
    execute format('create trigger reject_blocked_private_message before insert on public.%I
                    for each row execute function public.reject_blocked_private_message()', t);
  end loop;
end;
$$;

-- Counselling: a user the counsellor blocked can't book them, and neither
-- side can message someone who blocked them.
create or replace function public.reject_blocked_counselling_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counsellor_user uuid;
begin
  if public.is_backend_request() then
    return new;
  end if;
  select user_id into v_counsellor_user from public.counsellors where id = new.counsellor_id;
  if v_counsellor_user is not null and new.user_id is not null
     and (public.is_user_blocked(v_counsellor_user, new.user_id)
          or public.is_user_blocked(new.user_id, v_counsellor_user)) then
    raise exception 'You can''t book a session with this counsellor' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_blocked_counselling_session on public.counselling_sessions;
create trigger reject_blocked_counselling_session
  before insert on public.counselling_sessions
  for each row execute function public.reject_blocked_counselling_session();

create or replace function public.reject_blocked_counselling_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_counsellor_user uuid;
  v_other uuid;
begin
  if public.is_backend_request() then
    return new;
  end if;
  select s.user_id, c.user_id into v_client, v_counsellor_user
    from public.counselling_sessions s
    left join public.counsellors c on c.id = s.counsellor_id
   where s.id = new.session_id;

  v_other := case when new.sender_id = v_client then v_counsellor_user else v_client end;
  if v_other is not null and public.is_user_blocked(v_other, new.sender_id) then
    raise exception 'You can''t message this person' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_blocked_counselling_message on public.counselling_messages;
create trigger reject_blocked_counselling_message
  before insert on public.counselling_messages
  for each row execute function public.reject_blocked_counselling_message();

-- Same rule for the in-call chat table, whose author column is user_id.
create or replace function public.reject_blocked_counselling_session_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_counsellor_user uuid;
  v_other uuid;
begin
  if public.is_backend_request() then
    return new;
  end if;
  select s.user_id, c.user_id into v_client, v_counsellor_user
    from public.counselling_sessions s
    left join public.counsellors c on c.id = s.counsellor_id
   where s.id = new.session_id;

  v_other := case when new.user_id = v_client then v_counsellor_user else v_client end;
  if v_other is not null and public.is_user_blocked(v_other, new.user_id) then
    raise exception 'You can''t message this person' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_blocked_counselling_session_message on public.counselling_session_messages;
create trigger reject_blocked_counselling_session_message
  before insert on public.counselling_session_messages
  for each row execute function public.reject_blocked_counselling_session_message();
