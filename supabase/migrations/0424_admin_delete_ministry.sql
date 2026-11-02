-- 0424_admin_delete_ministry.sql
-- =====================================================================
-- Lets a platform admin permanently delete a ministry from Platform
-- Admin → Ministries.
--
-- RLS only lets a ministry's owner delete its ministry_groups row, and a
-- plain delete is blocked by NO ACTION / RESTRICT references (e.g.
-- live_channels), so this runs as security definer and clears those
-- first with _clear_fk_blockers (0422). ~95 tables cascade from
-- ministry_groups and go with it.
--
-- Guards:
--   * caller must be a platform admin;
--   * p_confirm_name must match the ministry's name exactly, so a stale
--     or mis-clicked row can't be deleted by id alone;
--   * ministries with Gift Aid declarations are refused (HAS_GIFT_AID):
--     those are HMRC records that must be kept, so suspend instead.
--
-- The deletion is recorded in ministry_audit_logs before the delete;
-- its ministry_id is SET NULL by the FK, so the entry survives with the
-- name and id kept in metadata.
-- =====================================================================

create or replace function public.admin_delete_ministry(
  p_ministry_id uuid,
  p_confirm_name text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_owner uuid;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception using errcode = '42501', message = 'NOT_PLATFORM_ADMIN: only platform admins can delete a ministry';
  end if;

  select name, owner_id into v_name, v_owner
    from public.ministry_groups
   where id = p_ministry_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'MINISTRY_NOT_FOUND: ministry not found';
  end if;

  if p_confirm_name is distinct from v_name then
    raise exception using errcode = 'P0001', message = 'NAME_MISMATCH: the typed name does not match the ministry name';
  end if;

  if exists (select 1 from public.gift_aid_declarations where ministry_id = p_ministry_id) then
    raise exception using
      errcode = 'P0001',
      message = 'HAS_GIFT_AID: this ministry has Gift Aid declarations, which must be kept for HMRC — suspend it instead';
  end if;

  insert into public.ministry_audit_logs
    (ministry_id, actor_id, actor_type, action, resource_type, resource_id, old_values, metadata)
  values
    (p_ministry_id, auth.uid(), 'platform_admin', 'ministry_deleted', 'ministry', p_ministry_id,
     jsonb_build_object('name', v_name, 'owner_id', v_owner),
     jsonb_build_object('ministry_id', p_ministry_id, 'ministry_name', v_name));

  perform public._clear_fk_blockers('public.ministry_groups'::regclass,
                                    format('id = %L', p_ministry_id));

  delete from public.ministry_groups where id = p_ministry_id;
end;
$$;

revoke all on function public.admin_delete_ministry(uuid, text) from public, anon;
grant execute on function public.admin_delete_ministry(uuid, text) to authenticated;
