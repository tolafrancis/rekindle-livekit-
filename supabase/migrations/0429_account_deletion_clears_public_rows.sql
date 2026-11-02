-- 0429_account_deletion_clears_public_rows.sql
-- Account deletion still failed after 0428, now with
--   ERROR: permission denied for table ministry_groups
-- auth.admin.deleteUser() deletes from auth.users as supabase_auth_admin.
-- The ON DELETE CASCADE / SET NULL references from public tables then run
-- as that role too, and so do the triggers they fire (e.g.
-- update_ministry_member_count() on ministry_group_members), but it has no
-- rights on public tables.
--
-- prepare_user_account_deletion() (security definer, see 0422) now also
-- removes the public rows that reference the user directly — deleting the
-- CASCADE ones, nulling the SET NULL ones — so the delete from auth.users
-- only touches the auth schema. Cascades and triggers inside public run
-- here, as the function owner.

create or replace function public.prepare_user_account_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fk record;
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

  -- Do the cascade from auth.users into public here, not as the auth role.
  for fk in
    select c.conrelid::regclass as child,
           ca.attname as child_col,
           c.confdeltype as on_delete
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute ca on ca.attrelid = c.conrelid and ca.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and array_length(c.conkey, 1) = 1
      and n.nspname = 'public'
  loop
    if fk.on_delete = 'c' then
      execute format('delete from %s where %I = %L', fk.child, fk.child_col, p_user_id);
    elsif fk.on_delete = 'n' then
      execute format('update %s set %I = null where %I = %L',
                     fk.child, fk.child_col, fk.child_col, p_user_id);
    elsif fk.on_delete = 'd' then
      execute format('update %s set %I = default where %I = %L',
                     fk.child, fk.child_col, fk.child_col, p_user_id);
    end if;
  end loop;
end;
$$;

revoke all on function public.prepare_user_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_user_account_deletion(uuid) to service_role;
