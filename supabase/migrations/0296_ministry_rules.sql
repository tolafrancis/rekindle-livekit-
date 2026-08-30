-- 0296_ministry_rules.sql
-- =====================================================================
-- "Ministry Rules & Guidelines" — a per-ministry, admin-managed, versioned
-- list of rule items (title + body each), with a per-ministry toggle to
-- require members to accept the current version before using ministry
-- features, and tracking of which version each member last accepted.
--
-- Four tables:
--   ministry_rules            — one row per ministry: the toggle + which
--                                version is currently "live".
--   ministry_rule_items       — the rule items themselves. Draft rows
--                                (version = 0, mutable, admin-only) and
--                                published snapshots (version >= 1,
--                                immutable once written) share this one
--                                table rather than living in two separate
--                                shapes — publishing is just "copy the
--                                version=0 rows to version=N", not a
--                                cross-table migration.
--   ministry_rule_versions    — append-only publish log (who/when), since
--                                deriving "when was version N published"
--                                from item timestamps would be fragile
--                                once items are copied at publish time.
--   ministry_rule_acceptances — latest acceptance per (ministry, user).
--                                Composite PK, not a full history table —
--                                the product requirement is "track which
--                                version each user accepted" (current
--                                state), not an acceptance-event log.
--
-- Draft edits (version=0) never affect what members see or are gated on —
-- only publish_ministry_rules() below advances ministry_rules.current_version,
-- which is the only thing the member-facing read policy and the re-
-- acceptance check compare against.
--
-- RLS follows the is_group_member/is_group_admin pattern from
-- 0150_rls_hardening_phase4.sql:24-48 (both security definer, already
-- granted to `authenticated`) — reused here, not redefined.
-- =====================================================================

begin;

create table if not exists public.ministry_rules (
  ministry_id         uuid primary key references public.ministry_groups(id) on delete cascade,
  require_acceptance  boolean not null default false,
  current_version     integer not null default 0,  -- 0 = never published; nothing to accept yet
  updated_at          timestamptz not null default now()
);

create table if not exists public.ministry_rule_items (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references public.ministry_groups(id) on delete cascade,
  -- 0 = draft (mutable, admin-only). N >= 1 = an immutable snapshot of
  -- published version N, written only by publish_ministry_rules().
  version      integer not null default 0,
  title        text not null,
  body         text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_ministry_rule_items_ministry_version
  on public.ministry_rule_items (ministry_id, version, sort_order);

create table if not exists public.ministry_rule_versions (
  ministry_id   uuid not null references public.ministry_groups(id) on delete cascade,
  version       integer not null,
  published_at  timestamptz not null default now(),
  published_by  uuid references auth.users(id),
  primary key (ministry_id, version)
);

create table if not exists public.ministry_rule_acceptances (
  ministry_id       uuid not null references public.ministry_groups(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  accepted_version  integer not null,
  accepted_at       timestamptz not null default now(),
  primary key (ministry_id, user_id)
);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.ministry_rules enable row level security;

create policy p_ministry_rules_member_sel on public.ministry_rules
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

create policy p_ministry_rules_admin_all on public.ministry_rules
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

alter table public.ministry_rule_items enable row level security;

-- Admins see everything (drafts + every past published snapshot, for the
-- version-history panel). Members only ever see the CURRENTLY published
-- snapshot — never drafts, never superseded versions.
create policy p_ministry_rule_items_sel on public.ministry_rule_items
  for select to authenticated
  using (
    public.is_group_admin(ministry_id, auth.uid())
    or (
      public.is_group_member(ministry_id, auth.uid())
      and version = coalesce(
        (select r.current_version from public.ministry_rules r where r.ministry_id = ministry_rule_items.ministry_id),
        -1  -- no ministry_rules row yet -> no version matches -> members see nothing, not an error
      )
    )
  );

-- Admin-write covers draft CRUD (add/edit/delete/reorder, all at version=0
-- from the client). publish_ministry_rules() below is security definer and
-- doesn't rely on this policy to write the version>=1 snapshot rows.
create policy p_ministry_rule_items_admin_write on public.ministry_rule_items
  for insert to authenticated
  with check (public.is_group_admin(ministry_id, auth.uid()));

create policy p_ministry_rule_items_admin_upd on public.ministry_rule_items
  for update to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

create policy p_ministry_rule_items_admin_del on public.ministry_rule_items
  for delete to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()));

alter table public.ministry_rule_versions enable row level security;

create policy p_ministry_rule_versions_member_sel on public.ministry_rule_versions
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

-- No client insert/update/delete policy — only publish_ministry_rules()
-- (security definer) ever writes this table.

alter table public.ministry_rule_acceptances enable row level security;

-- A member can read/insert/update only their own acceptance row (mainly so
-- the client can cheaply check "have I accepted?" without a round trip
-- through the RPC; actual writes should go through accept_ministry_rules()
-- for the current_version >= 1 validation, but this policy alone would
-- also be safe to write through directly since it's scoped to the caller's
-- own user_id).
create policy p_ministry_rule_acceptances_own on public.ministry_rule_acceptances
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Admins can see every member's acceptance row for their ministry (e.g. an
-- "N/M members accepted" readout in the admin UI).
create policy p_ministry_rule_acceptances_admin_sel on public.ministry_rule_acceptances
  for select to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()));

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

-- Atomically snapshots the current draft (version=0) items into a new
-- published version and advances ministry_rules.current_version. Draft
-- rows are left in place (still version=0) so admins can keep editing
-- toward the *next* publish without any "restore draft from latest" step.
create or replace function public.publish_ministry_rules(p_ministry_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_new_version integer;
begin
  if auth.uid() is null or not public.is_group_admin(p_ministry_id, auth.uid()) then
    raise exception 'Not authorized to publish rules for this ministry';
  end if;

  insert into public.ministry_rules (ministry_id)
    values (p_ministry_id)
    on conflict (ministry_id) do nothing;

  update public.ministry_rules
    set current_version = current_version + 1,
        updated_at = now()
    where ministry_id = p_ministry_id
    returning current_version into v_new_version;

  insert into public.ministry_rule_items (ministry_id, version, title, body, sort_order)
    select ministry_id, v_new_version, title, body, sort_order
    from public.ministry_rule_items
    where ministry_id = p_ministry_id and version = 0
    order by sort_order;

  insert into public.ministry_rule_versions (ministry_id, version, published_by)
    values (p_ministry_id, v_new_version, auth.uid());

  return v_new_version;
end;
$$;

grant execute on function public.publish_ministry_rules(uuid) to authenticated;

-- Records the caller's acceptance of the CURRENT version. Rejects
-- accepting before anything has ever been published (current_version = 0
-- means "nothing to accept yet").
create or replace function public.accept_ministry_rules(p_ministry_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_version integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select current_version into v_version
    from public.ministry_rules
    where ministry_id = p_ministry_id;

  if v_version is null or v_version < 1 then
    raise exception 'This ministry has not published any rules to accept';
  end if;

  insert into public.ministry_rule_acceptances (ministry_id, user_id, accepted_version, accepted_at)
    values (p_ministry_id, auth.uid(), v_version, now())
    on conflict (ministry_id, user_id)
    do update set accepted_version = excluded.accepted_version, accepted_at = excluded.accepted_at;

  return v_version;
end;
$$;

grant execute on function public.accept_ministry_rules(uuid) to authenticated;

commit;
