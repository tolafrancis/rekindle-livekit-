-- 0422_delete_user_account.sql
-- =====================================================================
-- In-app account deletion (required by Apple for App Store apps).
--
-- The delete-account edge function calls prepare_user_account_deletion()
-- and then supabase.auth.admin.deleteUser(). Most tables that point at
-- auth.users cascade, but ~30 columns (and some columns pointing at
-- tables that cascade from auth.users, e.g. user_profiles, profiles_old,
-- platform_admins) are NO ACTION, which would make deleteUser fail.
-- This function clears those blockers first:
--   * a nullable referencing column is set to NULL (the row survives,
--     unattributed — e.g. prayers, donations, audit logs);
--   * a NOT NULL referencing column means the row can't exist without
--     the user, so the row is deleted (after clearing ITS blockers).
-- The walk is generic over pg_constraint, so FKs added later are covered
-- without editing this function.
--
-- Ministry owners are refused (OWNS_MINISTRY): deleting the owner would
-- orphan a whole ministry, so they must transfer or close it first.
-- Webinars the user hosted are handed to the ministry's owner instead of
-- being deleted with them.
-- =====================================================================

-- Clears every NO ACTION / RESTRICT reference to the rows of p_table that
-- match p_where, so those rows can be deleted. Recurses through CASCADE
-- children too, because a cascaded delete is still blocked by a NO ACTION
-- grandchild. Only single-column FKs from the public schema are handled.
create or replace function public._clear_fk_blockers(
  p_table regclass,
  p_where text,
  p_depth int default 0
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fk record;
  child_where text;
begin
  -- Guards against self-referencing tables looping forever.
  if p_depth > 6 then
    return;
  end if;

  for fk in
    select c.conrelid::regclass as child,
           ca.attname as child_col,
           pa.attname as parent_col,
           c.confdeltype as on_delete,
           ca.attnotnull as not_null
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute ca on ca.attrelid = c.conrelid and ca.attnum = c.conkey[1]
    join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
    where c.contype = 'f'
      and c.confrelid = p_table
      and array_length(c.conkey, 1) = 1
      and n.nspname = 'public'
  loop
    child_where := format('%I in (select %I from %s where %s)',
                          fk.child_col, fk.parent_col, p_table, p_where);

    if fk.on_delete = 'c' then
      -- Postgres deletes these rows itself; just clear what blocks them.
      perform public._clear_fk_blockers(fk.child, child_where, p_depth + 1);
    elsif fk.on_delete in ('a', 'r') then
      if fk.not_null then
        perform public._clear_fk_blockers(fk.child, child_where, p_depth + 1);
        execute format('delete from %s where %s', fk.child, child_where);
      else
        execute format('update %s set %I = null where %s',
                       fk.child, fk.child_col, child_where);
      end if;
    end if;
    -- 'n' (set null) and 'd' (set default) need nothing.
  end loop;
end;
$$;

create or replace function public.prepare_user_account_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if exists (select 1 from public.ministries where owner_id = p_user_id) then
    raise exception using
      errcode = 'P0001',
      message = 'OWNS_MINISTRY: transfer or close your ministry before deleting your account';
  end if;

  -- Keep the ministry's webinars (and their recordings, Q&A, polls) by
  -- handing them to the ministry owner rather than deleting them.
  update public.ministry_webinars w
     set host_id = m.owner_id
    from public.ministries m
   where w.ministry_id = m.id
     and w.host_id = p_user_id
     and m.owner_id is not null;

  perform public._clear_fk_blockers('auth.users'::regclass,
                                    format('id = %L', p_user_id));
end;
$$;

revoke all on function public._clear_fk_blockers(regclass, text, int) from public, anon, authenticated;
revoke all on function public.prepare_user_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_user_account_deletion(uuid) to service_role;
