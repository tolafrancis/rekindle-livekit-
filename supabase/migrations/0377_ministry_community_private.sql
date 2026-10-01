-- 0377_ministry_community_private.sql
-- A ministry's Community belongs to that ministry.
--
-- Revelations and Q&A posted inside a ministry carry community_revelations /
-- community_questions.ministry_id, but nothing stopped anyone else reading
-- them: the public Community tabs listed every row, and any signed-in user
-- could query another ministry's posts directly. The app now filters
-- (public tabs: ministry_id is null; a ministry: its own id), and these
-- RESTRICTIVE policies enforce it in the database, on top of whatever
-- permissive policies the tables already have:
--   • a row with a ministry_id is readable only by that ministry's members
--     (is_group_member, keyed on ministry_group_members + owner/leader) and
--     content admins;
--   • only members can post into a ministry;
--   • answers follow their question.
-- Public rows (ministry_id is null) are unaffected. service_role bypasses RLS.
--
-- The ministry Feed tab used to be the whole of Rekindle's activity feed.
-- get_ministry_community_activities returns only activity by the ministry's
-- own members, and only to a caller who is a member.
--
-- Idempotent. Run in the Supabase SQL editor.

begin;

-- ---------------------------------------------------------------------
-- Revelations
-- ---------------------------------------------------------------------
drop policy if exists community_revelations_ministry_read on public.community_revelations;
create policy community_revelations_ministry_read on public.community_revelations
  as restrictive for select
  using (
    ministry_id is null
    or public.is_group_member(ministry_id, auth.uid())
    or public.is_content_admin(auth.uid())
  );

drop policy if exists community_revelations_ministry_insert on public.community_revelations;
create policy community_revelations_ministry_insert on public.community_revelations
  as restrictive for insert
  with check (ministry_id is null or public.is_group_member(ministry_id, auth.uid()));

-- ---------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------
drop policy if exists community_questions_ministry_read on public.community_questions;
create policy community_questions_ministry_read on public.community_questions
  as restrictive for select
  using (
    ministry_id is null
    or public.is_group_member(ministry_id, auth.uid())
    or public.is_content_admin(auth.uid())
  );

drop policy if exists community_questions_ministry_insert on public.community_questions;
create policy community_questions_ministry_insert on public.community_questions
  as restrictive for insert
  with check (ministry_id is null or public.is_group_member(ministry_id, auth.uid()));

-- ---------------------------------------------------------------------
-- Answers: readable / postable only where the question is.
-- ---------------------------------------------------------------------
create or replace function public.community_question_visible(p_question_id uuid, p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((
    select q.ministry_id is null
        or public.is_group_member(q.ministry_id, p_user_id)
        or public.is_content_admin(p_user_id)
    from community_questions q
    where q.id = p_question_id
  ), true);
$$;
grant execute on function public.community_question_visible(uuid, uuid) to authenticated, anon;

drop policy if exists community_answers_ministry_read on public.community_answers;
create policy community_answers_ministry_read on public.community_answers
  as restrictive for select
  using (public.community_question_visible(question_id, auth.uid()));

drop policy if exists community_answers_ministry_insert on public.community_answers;
create policy community_answers_ministry_insert on public.community_answers
  as restrictive for insert
  with check (public.community_question_visible(question_id, auth.uid()));

-- ---------------------------------------------------------------------
-- Ministry activity feed
-- ---------------------------------------------------------------------
create or replace function public.get_ministry_community_activities(
  p_ministry_id uuid,
  p_activity_type text default null,
  p_limit int default 50
)
returns setof public.community_activities
language sql security definer set search_path = public stable as $$
  select a.*
  from community_activities a
  where public.is_group_member(p_ministry_id, auth.uid())
    and (p_activity_type is null or a.activity_type::text = p_activity_type)
    and (
      exists (select 1 from ministry_group_members m
              where m.ministry_id = p_ministry_id and m.user_id = a.user_id)
      or exists (select 1 from ministry_groups g
                 where g.id = p_ministry_id and a.user_id in (g.owner_id, g.leader_id))
    )
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
revoke all on function public.get_ministry_community_activities(uuid, text, int) from public;
grant execute on function public.get_ministry_community_activities(uuid, text, int) to authenticated;

commit;

-- Restrictive policies only take effect where RLS is enabled. Check with:
--   select relname, relrowsecurity from pg_class
--   where relname in ('community_revelations', 'community_questions', 'community_answers');
