-- 0254_ministry_volunteer_teams.sql
-- =====================================================================
-- Volunteer Teams v1 — a tagging/team-assignment layer, deliberately
-- decoupled from the permission-role enum in
-- packages/auth/src/ministryPermissions.ts (owner/leader/admin/
-- content_editor/member). Volunteering (usher team, media team, kids
-- team, etc.) governs what ministry TEAM a person serves on; it must
-- never grant or imply app permissions. Column named `team_role` (not
-- `role`) to avoid confusion with that enum and with the pre-existing,
-- purely cosmetic `ministry_members.role = 'volunteer'` filter tag in
-- MinistryMembersManager.tsx, which has zero effect on permissions.
--
-- RLS reuses is_group_member()/is_group_admin() defined once in
-- 0150_rls_hardening_phase4.sql — the safe, audited pattern (never
-- touches auth.users directly). Not redefined here.
-- =====================================================================

begin;

create table if not exists public.ministry_volunteer_teams (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references public.ministry_groups(id) on delete cascade,
  name         text not null,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);

create index if not exists idx_ministry_volunteer_teams_ministry_id
  on public.ministry_volunteer_teams (ministry_id);

create table if not exists public.ministry_volunteer_assignments (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.ministry_volunteer_teams(id) on delete cascade,
  -- Denormalized from team_id so RLS can do a flat check instead of a
  -- correlated subquery on every row; kept in sync by trigger below,
  -- never trusted from client input, so there's no drift risk.
  ministry_id  uuid not null references public.ministry_groups(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  team_role    text not null default 'member' check (team_role in ('lead','member')),
  status       text not null default 'active' check (status in ('active','inactive')),
  joined_at    timestamptz not null default now(),
  added_by     uuid references auth.users(id),
  unique (team_id, user_id)
);

create index if not exists idx_ministry_volunteer_assignments_team_id
  on public.ministry_volunteer_assignments (team_id);
create index if not exists idx_ministry_volunteer_assignments_ministry_id
  on public.ministry_volunteer_assignments (ministry_id);
create index if not exists idx_ministry_volunteer_assignments_user_id
  on public.ministry_volunteer_assignments (user_id);

-- Keep ministry_id in lockstep with the parent team; client never sets it.
create or replace function public.ministry_volunteer_assignments_set_ministry_id()
returns trigger language plpgsql as $$
begin
  select ministry_id into new.ministry_id
  from public.ministry_volunteer_teams
  where id = new.team_id;
  return new;
end;
$$;

drop trigger if exists trg_ministry_volunteer_assignments_ministry_id
  on public.ministry_volunteer_assignments;
create trigger trg_ministry_volunteer_assignments_ministry_id
  before insert or update of team_id on public.ministry_volunteer_assignments
  for each row execute function public.ministry_volunteer_assignments_set_ministry_id();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.ministry_volunteer_teams enable row level security;

create policy p_ministry_volunteer_teams_member_sel on public.ministry_volunteer_teams
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

create policy p_ministry_volunteer_teams_admin_all on public.ministry_volunteer_teams
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

alter table public.ministry_volunteer_assignments enable row level security;

-- A member can see their own assignment row(s) even without admin rights.
create policy p_ministry_volunteer_assignments_self_sel on public.ministry_volunteer_assignments
  for select to authenticated
  using (user_id = auth.uid() or public.is_group_admin(ministry_id, auth.uid()));

create policy p_ministry_volunteer_assignments_admin_all on public.ministry_volunteer_assignments
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

commit;
