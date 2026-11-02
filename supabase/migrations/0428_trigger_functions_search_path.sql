-- 0428_trigger_functions_search_path.sql
-- Pins search_path on every public trigger function that doesn't set one.
--
-- Deleting an account (delete-account edge function → auth.admin.deleteUser)
-- runs as supabase_auth_admin, whose search_path is the auth schema. The
-- cascade from auth.users fires triggers on public tables, and any trigger
-- function naming a table unqualified then fails — e.g.
-- update_ministry_member_count() on ministry_group_members:
--   ERROR: relation "ministry_groups" does not exist
-- public, extensions is the path app sessions already use, so normal
-- behaviour is unchanged. Trigger functions added later should set their own.

begin;

do $$
declare
  fn regprocedure;
begin
  for fn in
    select distinct p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_trigger t on t.tgfoid = p.oid and not t.tgisinternal
    where n.nspname = 'public'
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
      )
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', fn);
  end loop;
end;
$$;

commit;
