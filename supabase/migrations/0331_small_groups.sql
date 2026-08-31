-- supabase/migrations/0331_small_groups.sql
-- Small Groups feature: structured groups (Bible study, prayer, youth, etc.)
-- within a ministry. Additive only — does not touch any existing table,
-- policy, or the free-text ministry_member_profiles.small_group column.
--
-- Tenant boundary: every table carries ministry_id -> ministry_groups(id).
-- Membership is modeled after the LIVE ministry_group_members table (not the
-- legacy, unused ministry_members table) per docs/investigations/3a-tenant-identity.md.
-- RLS reuses the existing is_group_member/is_group_admin helpers from
-- 0150_rls_hardening_phase4.sql for ministry-wide fallback checks.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.small_groups (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade,
  name text not null,
  description text,
  category text,
  leader_id uuid references auth.users(id) on delete set null, -- denormalized display convenience; source of truth is small_group_members.role='leader'
  meeting_day text,
  meeting_time time,
  meeting_frequency text,
  location_type text not null default 'physical' check (location_type in ('physical', 'online', 'hybrid')),
  location_address text,
  meeting_link text,
  max_members integer check (max_members is null or max_members > 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'closed')),
  cover_image_url text,
  privacy text not null default 'public' check (privacy in ('public', 'private', 'invite_only')),
  member_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_small_groups_ministry_id on public.small_groups (ministry_id);
create index if not exists idx_small_groups_ministry_status on public.small_groups (ministry_id, status);

create table if not exists public.small_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.small_groups(id) on delete cascade,
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade, -- denormalized from small_groups, see trigger below
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'assistant_leader', 'member')),
  status text not null default 'active' check (status in ('pending', 'active', 'declined', 'removed')),
  requested_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists idx_small_group_members_group_id on public.small_group_members (group_id);
create index if not exists idx_small_group_members_ministry_id on public.small_group_members (ministry_id);
create index if not exists idx_small_group_members_user_id on public.small_group_members (user_id);
create index if not exists idx_small_group_members_group_status on public.small_group_members (group_id, status);

create table if not exists public.small_group_coordinators (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (ministry_id, user_id)
);
create index if not exists idx_small_group_coordinators_ministry_id on public.small_group_coordinators (ministry_id);

create table if not exists public.small_group_meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.small_groups(id) on delete cascade,
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade, -- denormalized, see trigger below
  title text not null,
  description text,
  meeting_date date not null,
  start_time time,
  end_time time,
  location_type text not null default 'physical' check (location_type in ('physical', 'online')),
  location_address text,
  meeting_link text,
  is_recurring boolean not null default false,
  recurrence_pattern text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_small_group_meetings_group_id on public.small_group_meetings (group_id);
create index if not exists idx_small_group_meetings_ministry_id on public.small_group_meetings (ministry_id);
create index if not exists idx_small_group_meetings_group_date on public.small_group_meetings (group_id, meeting_date desc);

create table if not exists public.small_group_attendance (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.small_group_meetings(id) on delete cascade,
  group_id uuid not null references public.small_groups(id) on delete cascade, -- denormalized, see trigger below
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade, -- denormalized, see trigger below
  user_id uuid references auth.users(id) on delete cascade, -- null for a guest with no account
  guest_name text, -- set when user_id is null (first-time guest)
  status text not null check (status in ('present', 'absent', 'excused', 'first_time_guest')),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint small_group_attendance_person_check check (user_id is not null or guest_name is not null)
);
create unique index if not exists uq_small_group_attendance_meeting_user
  on public.small_group_attendance (meeting_id, user_id) where user_id is not null;
create index if not exists idx_small_group_attendance_meeting_id on public.small_group_attendance (meeting_id);
create index if not exists idx_small_group_attendance_group_id on public.small_group_attendance (group_id);
create index if not exists idx_small_group_attendance_ministry_id on public.small_group_attendance (ministry_id);

create table if not exists public.small_group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.small_groups(id) on delete cascade,
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade, -- denormalized, see trigger below
  author_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null check (post_type in ('announcement', 'discussion', 'prayer_request', 'resource')),
  title text,
  content text,
  resource_type text, -- e.g. 'devotional' | 'reading_plan' | 'book' | 'link' | 'file' — only meaningful when post_type = 'resource'
  resource_url text,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_small_group_posts_group_id on public.small_group_posts (group_id, created_at desc);
create index if not exists idx_small_group_posts_ministry_id on public.small_group_posts (ministry_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Denormalization triggers (ministry_id / group_id flattened onto children
-- so RLS never needs a correlated subquery — same technique used for
-- ministry_volunteer_assignments in 0254_ministry_volunteer_teams.sql)
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.small_group_members_set_ministry_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select ministry_id into new.ministry_id from public.small_groups where id = new.group_id;
  if new.ministry_id is null then
    raise exception 'small_group_members: group_id % has no matching small_groups row', new.group_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_small_group_members_set_ministry_id on public.small_group_members;
create trigger trg_small_group_members_set_ministry_id
  before insert or update of group_id on public.small_group_members
  for each row execute function public.small_group_members_set_ministry_id();

create or replace function public.small_group_meetings_set_ministry_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select ministry_id into new.ministry_id from public.small_groups where id = new.group_id;
  if new.ministry_id is null then
    raise exception 'small_group_meetings: group_id % has no matching small_groups row', new.group_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_small_group_meetings_set_ministry_id on public.small_group_meetings;
create trigger trg_small_group_meetings_set_ministry_id
  before insert or update of group_id on public.small_group_meetings
  for each row execute function public.small_group_meetings_set_ministry_id();

create or replace function public.small_group_posts_set_ministry_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select ministry_id into new.ministry_id from public.small_groups where id = new.group_id;
  if new.ministry_id is null then
    raise exception 'small_group_posts: group_id % has no matching small_groups row', new.group_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_small_group_posts_set_ministry_id on public.small_group_posts;
create trigger trg_small_group_posts_set_ministry_id
  before insert or update of group_id on public.small_group_posts
  for each row execute function public.small_group_posts_set_ministry_id();

create or replace function public.small_group_attendance_set_denorm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select group_id, ministry_id into new.group_id, new.ministry_id
    from public.small_group_meetings where id = new.meeting_id;
  if new.group_id is null then
    raise exception 'small_group_attendance: meeting_id % has no matching small_group_meetings row', new.meeting_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_small_group_attendance_set_denorm on public.small_group_attendance;
create trigger trg_small_group_attendance_set_denorm
  before insert or update of meeting_id on public.small_group_attendance
  for each row execute function public.small_group_attendance_set_denorm();

-- ─────────────────────────────────────────────────────────────────────────
-- member_count maintenance + max_members enforcement on small_group_members
-- (mirrors the security-definer limit-check style of
-- 0297_ministry_limit_enforcement.sql, but implemented as a proper trigger
-- rather than a client-side bump for correctness under concurrent joins)
-- ─────────────────────────────────────────────────────────────────────────

-- BEFORE trigger: validate only (raises to block the write). Deliberately
-- does NOT touch member_count here — at BEFORE-trigger time this row hasn't
-- actually been written to storage yet, so a recount here would always lag
-- by one. The recount happens in a separate AFTER trigger below.
create or replace function public.small_group_members_enforce_max()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_max_members integer;
  v_active_count integer;
begin
  v_group_id := coalesce(new.group_id, old.group_id);

  -- Enforce max_members only when a row is becoming 'active'.
  if (tg_op = 'INSERT' and new.status = 'active')
     or (tg_op = 'UPDATE' and new.status = 'active' and old.status is distinct from 'active') then
    select max_members into v_max_members from public.small_groups where id = v_group_id;
    if v_max_members is not null then
      select count(*) into v_active_count
        from public.small_group_members
        where group_id = v_group_id and status = 'active' and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
      if v_active_count >= v_max_members then
        raise exception 'This small group is full (max % members).', v_max_members;
      end if;
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists trg_small_group_members_enforce_max on public.small_group_members;
create trigger trg_small_group_members_enforce_max
  before insert or update of status on public.small_group_members
  for each row execute function public.small_group_members_enforce_max();

-- AFTER trigger: recount now that the row is actually persisted.
create or replace function public.small_group_members_recount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  v_group_id := coalesce(new.group_id, old.group_id);
  update public.small_groups
    set member_count = (select count(*) from public.small_group_members where group_id = v_group_id and status = 'active')
    where id = v_group_id;
  return null; -- AFTER trigger return value is ignored
end;
$$;
drop trigger if exists trg_small_group_members_recount on public.small_group_members;
create trigger trg_small_group_members_recount
  after insert or update of status on public.small_group_members
  for each row execute function public.small_group_members_recount();

create or replace function public.small_group_members_recount_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.small_groups
    set member_count = (select count(*) from public.small_group_members where group_id = old.group_id and status = 'active')
    where id = old.group_id;
  return old;
end;
$$;
drop trigger if exists trg_small_group_members_recount_on_delete on public.small_group_members;
create trigger trg_small_group_members_recount_on_delete
  after delete on public.small_group_members
  for each row execute function public.small_group_members_recount_on_delete();

-- updated_at bumpers
create or replace function public.small_groups_touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_small_groups_touch_updated_at on public.small_groups;
create trigger trg_small_groups_touch_updated_at
  before update on public.small_groups for each row execute function public.small_groups_touch_updated_at();

drop trigger if exists trg_small_group_meetings_touch_updated_at on public.small_group_meetings;
create trigger trg_small_group_meetings_touch_updated_at
  before update on public.small_group_meetings for each row execute function public.small_groups_touch_updated_at();

drop trigger if exists trg_small_group_posts_touch_updated_at on public.small_group_posts;
create trigger trg_small_group_posts_touch_updated_at
  before update on public.small_group_posts for each row execute function public.small_groups_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS helper functions
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.is_small_group_leader(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.small_group_members
    where group_id = p_group_id and user_id = p_user_id
      and status = 'active' and role in ('leader', 'assistant_leader')
  ) or exists (
    select 1 from public.small_groups sg
    join public.small_group_coordinators c
      on c.ministry_id = sg.ministry_id and c.user_id = p_user_id
    where sg.id = p_group_id
  ) or public.is_group_admin(
    (select ministry_id from public.small_groups where id = p_group_id), p_user_id
  );
$$;
grant execute on function public.is_small_group_leader(uuid, uuid) to authenticated;

create or replace function public.is_small_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.small_group_members
    where group_id = p_group_id and user_id = p_user_id and status = 'active'
  ) or public.is_small_group_leader(p_group_id, p_user_id);
$$;
grant execute on function public.is_small_group_member(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS policies
-- ─────────────────────────────────────────────────────────────────────────

alter table public.small_groups enable row level security;
alter table public.small_group_members enable row level security;
alter table public.small_group_coordinators enable row level security;
alter table public.small_group_meetings enable row level security;
alter table public.small_group_attendance enable row level security;
alter table public.small_group_posts enable row level security;

-- small_groups ---------------------------------------------------------

-- Public AND private groups are browsable by any ministry member (per spec:
-- "Request to join private groups" implies private groups are still listed
-- in Discover) — only invite_only groups are hidden unless you already
-- belong to them or manage the ministry.
drop policy if exists p_small_groups_select on public.small_groups;
create policy p_small_groups_select on public.small_groups
  for select to authenticated
  using (
    public.is_group_admin(ministry_id, auth.uid())
    or exists (select 1 from public.small_group_coordinators c where c.ministry_id = small_groups.ministry_id and c.user_id = auth.uid())
    or (privacy in ('public', 'private') and public.is_group_member(ministry_id, auth.uid()))
    or public.is_small_group_member(id, auth.uid())
  );

drop policy if exists p_small_groups_admin_all on public.small_groups;
create policy p_small_groups_admin_all on public.small_groups
  for all to authenticated
  using (
    public.is_group_admin(ministry_id, auth.uid())
    or exists (select 1 from public.small_group_coordinators c where c.ministry_id = small_groups.ministry_id and c.user_id = auth.uid())
  )
  with check (
    public.is_group_admin(ministry_id, auth.uid())
    or exists (select 1 from public.small_group_coordinators c where c.ministry_id = small_groups.ministry_id and c.user_id = auth.uid())
  );

-- Group leaders may update their own group's non-destructive fields; they
-- get no delete/insert grant here, so archiving/deleting stays admin/coordinator-only.
drop policy if exists p_small_groups_leader_update on public.small_groups;
create policy p_small_groups_leader_update on public.small_groups
  for update to authenticated
  using (public.is_small_group_leader(id, auth.uid()))
  with check (public.is_small_group_leader(id, auth.uid()));

-- small_group_members ---------------------------------------------------

drop policy if exists p_small_group_members_select on public.small_group_members;
create policy p_small_group_members_select on public.small_group_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_small_group_member(group_id, auth.uid())
  );

-- Self-service join / join-request: never for invite_only groups.
drop policy if exists p_small_group_members_self_insert on public.small_group_members;
create policy p_small_group_members_self_insert on public.small_group_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.small_groups sg
      where sg.id = group_id
        and sg.privacy in ('public', 'private')
        and public.is_group_member(sg.ministry_id, auth.uid())
    )
  );

-- Leaders/coordinators/admins may add/manage any member row (manual add,
-- invite-only groups, approvals, role changes, removal).
drop policy if exists p_small_group_members_leader_all on public.small_group_members;
create policy p_small_group_members_leader_all on public.small_group_members
  for all to authenticated
  using (public.is_small_group_leader(group_id, auth.uid()))
  with check (public.is_small_group_leader(group_id, auth.uid()));

-- A member may cancel their own still-pending join request.
drop policy if exists p_small_group_members_self_cancel on public.small_group_members;
create policy p_small_group_members_self_cancel on public.small_group_members
  for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- small_group_coordinators ----------------------------------------------

drop policy if exists p_small_group_coordinators_select on public.small_group_coordinators;
create policy p_small_group_coordinators_select on public.small_group_coordinators
  for select to authenticated
  using (user_id = auth.uid() or public.is_group_admin(ministry_id, auth.uid()));

drop policy if exists p_small_group_coordinators_admin_all on public.small_group_coordinators;
create policy p_small_group_coordinators_admin_all on public.small_group_coordinators
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

-- small_group_meetings ----------------------------------------------------

drop policy if exists p_small_group_meetings_select on public.small_group_meetings;
create policy p_small_group_meetings_select on public.small_group_meetings
  for select to authenticated
  using (public.is_small_group_member(group_id, auth.uid()));

drop policy if exists p_small_group_meetings_leader_all on public.small_group_meetings;
create policy p_small_group_meetings_leader_all on public.small_group_meetings
  for all to authenticated
  using (public.is_small_group_leader(group_id, auth.uid()))
  with check (public.is_small_group_leader(group_id, auth.uid()));

-- small_group_attendance ---------------------------------------------------

drop policy if exists p_small_group_attendance_select on public.small_group_attendance;
create policy p_small_group_attendance_select on public.small_group_attendance
  for select to authenticated
  using (public.is_small_group_member(group_id, auth.uid()));

drop policy if exists p_small_group_attendance_leader_all on public.small_group_attendance;
create policy p_small_group_attendance_leader_all on public.small_group_attendance
  for all to authenticated
  using (public.is_small_group_leader(group_id, auth.uid()))
  with check (public.is_small_group_leader(group_id, auth.uid()));

-- small_group_posts ---------------------------------------------------------

drop policy if exists p_small_group_posts_select on public.small_group_posts;
create policy p_small_group_posts_select on public.small_group_posts
  for select to authenticated
  using (public.is_small_group_member(group_id, auth.uid()));

drop policy if exists p_small_group_posts_leader_all on public.small_group_posts;
create policy p_small_group_posts_leader_all on public.small_group_posts
  for all to authenticated
  using (public.is_small_group_leader(group_id, auth.uid()))
  with check (public.is_small_group_leader(group_id, auth.uid()));

-- Members may start a discussion or share a prayer request in a group they
-- belong to (but not post announcements/resources — leader-only, covered by
-- the policy above).
drop policy if exists p_small_group_posts_member_insert on public.small_group_posts;
create policy p_small_group_posts_member_insert on public.small_group_posts
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and post_type in ('discussion', 'prayer_request')
    and public.is_small_group_member(group_id, auth.uid())
  );

-- A member may edit/delete their own discussion/prayer-request post.
-- Deliberately UPDATE + DELETE only (not "for all") — an insert grant here
-- would have no membership check of its own and, since Postgres ORs
-- permissive policies together, would let any authenticated user post into
-- any group by just naming themselves as author. Insertion is covered
-- exclusively by p_small_group_posts_member_insert above, which does check
-- membership.
drop policy if exists p_small_group_posts_member_own on public.small_group_posts;
create policy p_small_group_posts_member_own_update on public.small_group_posts
  for update to authenticated
  using (author_id = auth.uid() and post_type in ('discussion', 'prayer_request'))
  with check (author_id = auth.uid() and post_type in ('discussion', 'prayer_request'));

drop policy if exists p_small_group_posts_member_own_delete on public.small_group_posts;
create policy p_small_group_posts_member_own_delete on public.small_group_posts
  for delete to authenticated
  using (author_id = auth.uid() and post_type in ('discussion', 'prayer_request'));

commit;
