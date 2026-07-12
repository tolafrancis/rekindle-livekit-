-- =====================================================================
-- §3a — SPLIT TENANT IDENTITY: GROUND-TRUTH EXTRACTION
-- Master plan §3a (docs/MASTER-PLAN-ministry-standalone.md).
-- Question: what is the real relationship between `ministries` and
-- `ministry_groups`? They are queried with the SAME id across the app, yet
-- ministry creation (MinistriesHub.tsx) writes ONLY `ministry_groups`.
-- Is `ministries` a VIEW? a trigger-synced mirror? a shared-PK table?
--
-- READ-ONLY (SELECT / catalog only) — changes nothing. Run each block via
-- the Supabase Management API (POST /v1/projects/{ref}/database/query) or
-- paste into Dashboard → SQL Editor and return the results.
-- Project ref: vpnpembyqbbaaiynfvli
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Are they TABLES or VIEWS? (relkind: r=table, v=view, m=matview)
-- ---------------------------------------------------------------------
select c.relname,
       c.relkind,
       case c.relkind when 'r' then 'table' when 'v' then 'view'
                      when 'm' then 'matview' when 'p' then 'partitioned' end as kind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('ministries', 'ministry_groups',
                    'ministry_group_members', 'ministry_members',
                    'ministry_members_with_profiles');

-- ---------------------------------------------------------------------
-- 1b. If `ministries` (or the members view) is a VIEW, dump its definition
-- ---------------------------------------------------------------------
select table_name, view_definition
from information_schema.views
where table_schema = 'public'
  and table_name in ('ministries', 'ministry_groups',
                     'ministry_members', 'ministry_members_with_profiles');

-- ---------------------------------------------------------------------
-- 2. Full column definitions for both tenant faces + the membership tables
-- ---------------------------------------------------------------------
select table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('ministries', 'ministry_groups',
                     'ministry_group_members', 'ministry_members')
order by table_name, ordinal_position;

-- ---------------------------------------------------------------------
-- 3. PK / UNIQUE / FK constraints on all four — does an FK tie the two
--    tenant ids together? do the membership tables FK to one or the other?
-- ---------------------------------------------------------------------
select tc.table_name,
       tc.constraint_type,
       tc.constraint_name,
       string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns,
       ccu.table_name  as ref_table,
       ccu.column_name as ref_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
left join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
 and tc.constraint_type = 'FOREIGN KEY'
where tc.table_schema = 'public'
  and tc.table_name in ('ministries', 'ministry_groups',
                        'ministry_group_members', 'ministry_members')
group by tc.table_name, tc.constraint_type, tc.constraint_name,
         ccu.table_name, ccu.column_name
order by tc.table_name, tc.constraint_type;

-- ---------------------------------------------------------------------
-- 4. Triggers on either tenant table — a mirror/sync trigger would explain
--    how a `ministries` row appears when only `ministry_groups` is inserted
-- ---------------------------------------------------------------------
select event_object_table as table_name,
       trigger_name, action_timing, event_manipulation,
       action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('ministries', 'ministry_groups')
order by event_object_table, trigger_name;

-- 4b. Bodies of any functions those triggers call (fill names from 4 first)
-- select p.proname, pg_get_functiondef(p.oid)
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname in ( /* trigger fn names */ );

-- ---------------------------------------------------------------------
-- 5. THE DECISIVE DATA CHECK: do the two id sets actually coincide?
--    row counts, overlap, and any orphans in either direction.
-- ---------------------------------------------------------------------
select
  (select count(*) from public.ministries)               as ministries_rows,
  (select count(*) from public.ministry_groups)           as groups_rows,
  (select count(*) from public.ministries m
      join public.ministry_groups g on g.id = m.id)        as shared_ids,
  (select count(*) from public.ministries m
      left join public.ministry_groups g on g.id = m.id
      where g.id is null)                                  as in_ministries_not_groups,
  (select count(*) from public.ministry_groups g
      left join public.ministries m on m.id = g.id
      where m.id is null)                                  as in_groups_not_ministries;

-- ---------------------------------------------------------------------
-- 6. Membership table: are ministry_id and group_id ever different?
--    The app sets both to the same value; confirm that holds in the data.
-- ---------------------------------------------------------------------
select
  count(*)                                                   as member_rows,
  count(*) filter (where ministry_id is distinct from group_id) as mismatched_ids,
  count(*) filter (where ministry_id is null)                as null_ministry_id,
  count(*) filter (where group_id is null)                   as null_group_id
from public.ministry_group_members;

-- ---------------------------------------------------------------------
-- 7. RLS posture on both tenant tables + membership (does RLS even apply,
--    and which columns do the policies key on?) — feeds the Phase 4 audit.
-- ---------------------------------------------------------------------
select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('ministries', 'ministry_groups', 'ministry_group_members');

select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('ministries', 'ministry_groups', 'ministry_group_members')
order by tablename, policyname;
