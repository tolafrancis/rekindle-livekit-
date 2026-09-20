-- 0357_webinar_phase2.sql
-- Webinar Phase 2: chat (zero new schema, reuses meeting_chat), Q&A moderation
-- queue, polls, registration (reuses meeting_registrations widened to a third
-- kind), and the attendance-analytics RPCs the new WebinarAnalytics view reads
-- from (meeting_attendance has service-role-only RLS, so a client-facing door
-- is needed). All additive — no existing ministry/channel-kind behavior is
-- touched, only new CHECK values / new RLS policy arms / new tables.

begin;

-- ── Registration: widen meeting_registrations to a third kind ──────────────
alter table public.meeting_registrations
  drop constraint if exists meeting_registrations_meeting_kind_check;
alter table public.meeting_registrations
  add constraint meeting_registrations_meeting_kind_check
  check (meeting_kind in ('ministry', 'channel', 'webinar'));

drop policy if exists meeting_reg_host_read on public.meeting_registrations;
create policy meeting_reg_host_read on public.meeting_registrations
  for select using (
    (meeting_kind = 'ministry' and exists (
      select 1 from public.ministry_video_meetings m where m.id = meeting_id and m.host_id = auth.uid()))
    or (meeting_kind = 'channel' and exists (
      select 1 from public.live_channel_video_meetings m where m.id = meeting_id and m.host_id = auth.uid()))
    or (meeting_kind = 'webinar' and public.is_webinar_manager(meeting_id, auth.uid()))
  );

-- ── Reminders: webinars need an opt-in offsets list (no is_active/meeting_type
--    columns to piggyback the other two kinds' "still upcoming" filter on) ───
alter table public.ministry_webinars
  add column if not exists reminder_offsets integer[] not null default '{}'::integer[];

-- ── Q&A moderation queue ─────────────────────────────────────────────────
create table if not exists public.webinar_questions (
  id            uuid primary key default gen_random_uuid(),
  webinar_id    uuid not null references public.ministry_webinars (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  user_name     text,
  question      text not null check (char_length(question) between 1 and 500),
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'answered')),
  is_pinned     boolean not null default false,
  upvote_count  integer not null default 0,
  answered_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_webinar_questions_webinar_status
  on public.webinar_questions (webinar_id, status);
create index if not exists idx_webinar_questions_ranking
  on public.webinar_questions (webinar_id, is_pinned desc, upvote_count desc, created_at asc);

alter table public.webinar_questions enable row level security;

-- Pending/rejected are moderation-in-progress: visible only to the asker and
-- the host/co-hosts. Approved/answered are the public queue everyone sees.
drop policy if exists "read webinar questions" on public.webinar_questions;
create policy "read webinar questions"
  on public.webinar_questions for select using (
    status in ('approved', 'answered')
    or user_id = auth.uid()
    or public.is_webinar_manager(webinar_id, auth.uid())
  );

drop policy if exists "attendee asks question" on public.webinar_questions;
create policy "attendee asks question"
  on public.webinar_questions for insert to authenticated
  with check (user_id = auth.uid());

-- No takebacks once moderated — only a still-pending question can be withdrawn.
drop policy if exists "asker withdraws pending question" on public.webinar_questions;
create policy "asker withdraws pending question"
  on public.webinar_questions for delete using (user_id = auth.uid() and status = 'pending');

drop policy if exists "host moderates questions" on public.webinar_questions;
create policy "host moderates questions"
  on public.webinar_questions for all using (public.is_webinar_manager(webinar_id, auth.uid()))
  with check (public.is_webinar_manager(webinar_id, auth.uid()));

create table if not exists public.webinar_question_votes (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.webinar_questions (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (question_id, user_id)
);

alter table public.webinar_question_votes enable row level security;

drop policy if exists "read own question votes" on public.webinar_question_votes;
create policy "read own question votes"
  on public.webinar_question_votes for select using (user_id = auth.uid());

drop policy if exists "cast own question vote" on public.webinar_question_votes;
create policy "cast own question vote"
  on public.webinar_question_votes for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "retract own question vote" on public.webinar_question_votes;
create policy "retract own question vote"
  on public.webinar_question_votes for delete using (user_id = auth.uid());

-- Keeps webinar_questions.upvote_count in sync without a client-writable counter.
create or replace function public.bump_question_upvote_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.webinar_questions set upvote_count = upvote_count + 1 where id = new.question_id;
  elsif tg_op = 'DELETE' then
    update public.webinar_questions set upvote_count = greatest(upvote_count - 1, 0) where id = old.question_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_webinar_question_votes_count on public.webinar_question_votes;
create trigger trg_webinar_question_votes_count
  after insert or delete on public.webinar_question_votes
  for each row execute function public.bump_question_upvote_count();

-- ── Polls ────────────────────────────────────────────────────────────────
create table if not exists public.webinar_polls (
  id                     uuid primary key default gen_random_uuid(),
  webinar_id             uuid not null references public.ministry_webinars (id) on delete cascade,
  created_by             uuid not null references auth.users (id),
  question               text not null check (char_length(question) between 1 and 300),
  status                 text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  allow_multiple_choice  boolean not null default false,
  opened_at              timestamptz,
  closed_at              timestamptz,
  created_at             timestamptz not null default now()
);

create index if not exists idx_webinar_polls_webinar_status
  on public.webinar_polls (webinar_id, status);

alter table public.webinar_polls enable row level security;

drop policy if exists "read visible polls" on public.webinar_polls;
create policy "read visible polls"
  on public.webinar_polls for select using (
    status in ('open', 'closed') or public.is_webinar_manager(webinar_id, auth.uid())
  );

drop policy if exists "host manages polls" on public.webinar_polls;
create policy "host manages polls"
  on public.webinar_polls for all using (public.is_webinar_manager(webinar_id, auth.uid()))
  with check (public.is_webinar_manager(webinar_id, auth.uid()));

create table if not exists public.webinar_poll_options (
  id           uuid primary key default gen_random_uuid(),
  poll_id      uuid not null references public.webinar_polls (id) on delete cascade,
  option_text  text not null check (char_length(option_text) between 1 and 200),
  position     integer not null default 0,
  vote_count   integer not null default 0
);

create index if not exists idx_webinar_poll_options_poll
  on public.webinar_poll_options (poll_id, position);

alter table public.webinar_poll_options enable row level security;

drop policy if exists "read visible poll options" on public.webinar_poll_options;
create policy "read visible poll options"
  on public.webinar_poll_options for select using (
    exists (
      select 1 from public.webinar_polls p
      where p.id = poll_id and (p.status in ('open', 'closed') or public.is_webinar_manager(p.webinar_id, auth.uid()))
    )
  );

drop policy if exists "host manages poll options" on public.webinar_poll_options;
create policy "host manages poll options"
  on public.webinar_poll_options for all using (
    exists (select 1 from public.webinar_polls p where p.id = poll_id and public.is_webinar_manager(p.webinar_id, auth.uid()))
  ) with check (
    exists (select 1 from public.webinar_polls p where p.id = poll_id and public.is_webinar_manager(p.webinar_id, auth.uid()))
  );

create table if not exists public.webinar_poll_votes (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.webinar_polls (id) on delete cascade,
  option_id   uuid not null references public.webinar_poll_options (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (poll_id, user_id, option_id)
);

create index if not exists idx_webinar_poll_votes_poll on public.webinar_poll_votes (poll_id);

alter table public.webinar_poll_votes enable row level security;

-- No client insert/delete policy — all writes go through cast_poll_vote()
-- below, which atomically enforces "poll is open" + single-vs-multiple-choice
-- + replace-previous-vote. Letting RLS + client discipline carry that (like
-- webinar_question_votes) would let a buggy/malicious client stuff multiple
-- single-choice votes. SELECT stays open so a voter/host can read raw ballots.
drop policy if exists "read own or hosted poll votes" on public.webinar_poll_votes;
create policy "read own or hosted poll votes"
  on public.webinar_poll_votes for select using (
    user_id = auth.uid()
    or exists (select 1 from public.webinar_polls p where p.id = poll_id and public.is_webinar_manager(p.webinar_id, auth.uid()))
  );

create or replace function public.bump_poll_option_vote_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.webinar_poll_options set vote_count = vote_count + 1 where id = new.option_id;
  elsif tg_op = 'DELETE' then
    update public.webinar_poll_options set vote_count = greatest(vote_count - 1, 0) where id = old.option_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_webinar_poll_votes_count on public.webinar_poll_votes;
create trigger trg_webinar_poll_votes_count
  after insert or delete on public.webinar_poll_votes
  for each row execute function public.bump_poll_option_vote_count();

-- Atomic vote-cast: validates the poll is open, enforces single/multi-choice,
-- and replaces any prior vote(s) by this user on this poll. SECURITY DEFINER
-- so it can write webinar_poll_votes despite no client insert policy existing.
create or replace function public.cast_poll_vote(p_poll_id uuid, p_option_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_multi boolean;
begin
  select status, allow_multiple_choice into v_status, v_multi
  from public.webinar_polls where id = p_poll_id;

  if v_status is null then
    raise exception 'poll not found';
  end if;
  if v_status <> 'open' then
    raise exception 'poll is not open for voting';
  end if;
  if p_option_ids is null or array_length(p_option_ids, 1) is null then
    raise exception 'at least one option is required';
  end if;
  if not v_multi and array_length(p_option_ids, 1) > 1 then
    raise exception 'this poll only allows a single choice';
  end if;
  if exists (
    select 1 from unnest(p_option_ids) oid
    where not exists (select 1 from public.webinar_poll_options o where o.id = oid and o.poll_id = p_poll_id)
  ) then
    raise exception 'invalid option for this poll';
  end if;

  delete from public.webinar_poll_votes where poll_id = p_poll_id and user_id = auth.uid();
  insert into public.webinar_poll_votes (poll_id, option_id, user_id)
  select p_poll_id, oid, auth.uid() from unnest(p_option_ids) oid;
end;
$$;

grant execute on function public.cast_poll_vote(uuid, uuid[]) to authenticated;

-- ── Attendance analytics: meeting_attendance is service-role-only, so a
--    client-facing SECURITY DEFINER door is needed for the host's analytics
--    view. Guest registrants (no stable key into meeting_attendance's
--    synthetic guest ids) are excluded — shown as "unknown", not fuzzy-matched.
create or replace function public.webinar_attendance_summary(p_webinar_id uuid)
returns table (
  registered_count      integer,
  attended_count        integer,
  no_show_count         integer,
  avg_duration_minutes  numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_webinar_manager(p_webinar_id, auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
  with regs as (
    select user_id from public.meeting_registrations
    where meeting_id = p_webinar_id and meeting_kind = 'webinar'
      and status = 'registered' and user_id is not null
  ),
  att as (
    select user_id::uuid as user_id,
           min(joined_at) as first_joined,
           max(coalesce(left_at, joined_at)) as last_left
    from public.meeting_attendance
    where meeting_id = p_webinar_id::text and meeting_table = 'ministry_webinars'
    group by user_id
  )
  select
    (select count(*) from regs)::int,
    (select count(*) from regs r join att a on a.user_id = r.user_id)::int,
    (select count(*) from regs r where not exists (select 1 from att a where a.user_id = r.user_id))::int,
    (select avg(extract(epoch from (a.last_left - a.first_joined)) / 60.0)
       from regs r join att a on a.user_id = r.user_id);
end;
$$;

grant execute on function public.webinar_attendance_summary(uuid) to authenticated;

create or replace function public.webinar_registrant_attendance(p_webinar_id uuid)
returns table (
  user_id           uuid,
  guest_name        text,
  guest_email       text,
  attended          boolean,
  joined_at         timestamptz,
  left_at           timestamptz,
  duration_minutes  numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_webinar_manager(p_webinar_id, auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
  select
    r.user_id,
    r.guest_name,
    r.guest_email,
    (a.user_id is not null) as attended,
    a.first_joined as joined_at,
    a.last_left as left_at,
    case when a.user_id is not null
      then extract(epoch from (a.last_left - a.first_joined)) / 60.0 else null end as duration_minutes
  from public.meeting_registrations r
  left join (
    select user_id::uuid as user_id, min(joined_at) as first_joined, max(coalesce(left_at, joined_at)) as last_left
    from public.meeting_attendance
    where meeting_id = p_webinar_id::text and meeting_table = 'ministry_webinars'
    group by user_id
  ) a on a.user_id = r.user_id
  where r.meeting_id = p_webinar_id and r.meeting_kind = 'webinar' and r.status = 'registered';
end;
$$;

grant execute on function public.webinar_registrant_attendance(uuid) to authenticated;

commit;
