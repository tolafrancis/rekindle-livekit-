-- 0389_ugc_comment_reports.sql
--
-- Follow-up to 0388_ugc_report_block. Comments on revelations and app
-- testimonies aren't rows: they're a jsonb array (`comments`) on the post,
-- and until now each comment carried only the author's display name. The
-- app now writes `user_id` on every new comment (CommentSection.tsx), and
-- this migration lets those comments be reported and removed:
--
--   1. content_type 'community_revelation_comments' / 'app_testimony_comments',
--      with content_id "<post id>:<comment id>".
--   2. flagged_content_before_insert resolves the comment's author (user_id
--      when present) and text from the post's jsonb array.
--   3. moderation_remove_content removes just that comment from the array.
--   4. Banned users can't add comments. Comments are added by UPDATE on the
--      post, which 0388's insert-only reject_banned_author didn't cover.

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
    'counselling_session_messages', 'user',
    -- comments stored in a post's jsonb array
    'community_revelation_comments', 'app_testimony_comments'
  ));

-- Which post table holds a comment content_type's jsonb array. Null for
-- every other content_type.
create or replace function public.ugc_comment_parent(p_content_type text)
returns text
language sql
immutable
as $$
  select case p_content_type
    when 'community_revelation_comments' then 'community_revelations'
    when 'app_testimony_comments' then 'app_testimonies'
  end;
$$;

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
  v_parent text;
  v_comment jsonb;
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

  v_parent := public.ugc_comment_parent(new.content_type);

  if new.content_type = 'user' then
    v_author := new.content_id::uuid;
    select coalesce(display_name, full_name) into v_preview
      from public.user_profiles where user_id = v_author limit 1;
    v_preview := coalesce('Profile: ' || v_preview, 'Profile');
  elsif v_parent is not null then
    -- content_id is "<post id>:<comment id>"
    execute format(
      'select e from public.%I p, jsonb_array_elements(coalesce(p.comments, ''[]''::jsonb)) e
        where p.id = $1::uuid and e->>''id'' = $2 limit 1', v_parent)
      into v_comment
      using split_part(new.content_id, ':', 1), split_part(new.content_id, ':', 2);
    if v_comment is null then
      raise exception 'That comment no longer exists' using errcode = 'P0002';
    end if;
    v_author_text := v_comment->>'user_id';
    v_preview := left(concat_ws(': ', v_comment->>'author', v_comment->>'content'), 1000);
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
    end if;
  end if;

  if v_author is null and v_author_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_author := v_author_text::uuid;
  end if;

  if v_author is not null and v_author = new.flagged_by then
    raise exception 'You can''t report your own content' using errcode = '42501';
  end if;

  new.reported_user_id := coalesce(v_author, new.reported_user_id);
  new.content_preview := coalesce(v_preview, new.content_preview);
  return new;
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

-- Banned users can't add comments (an UPDATE that grows the comments array).
create or replace function public.reject_banned_commenter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_backend_request() then
    return new;
  end if;
  if jsonb_array_length(coalesce(new.comments, '[]'::jsonb)) > jsonb_array_length(coalesce(old.comments, '[]'::jsonb))
     and exists (select 1 from public.user_profiles where user_id = auth.uid() and is_banned = true) then
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
  foreach t in array array['community_revelations', 'app_testimonies'] loop
    execute format('drop trigger if exists reject_banned_commenter on public.%I', t);
    execute format('create trigger reject_banned_commenter before update of comments on public.%I
                    for each row execute function public.reject_banned_commenter()', t);
  end loop;
end;
$$;
