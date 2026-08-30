-- 0297_ministry_limit_enforcement.sql
-- =====================================================================
-- Real server-side backstop for the member-count limit that
-- MinistryMemberRegistration.tsx / MinistryRegistrations.tsx already
-- check client-side (see ministry-billing-tier-enforcement-audit.md, fix
-- 6): a client-side check alone stops nothing against a direct API call,
-- and there is otherwise zero tier-aware RLS/trigger anywhere in this
-- schema.
--
-- Mirrors the exact fallback semantics already used by
-- packages/auth/src/ministryEntitlements.ts and the client-side checks:
--   - no ACTIVE ministry_subscriptions row, or an active row with a null
--     member_limit -> Free-tier fallback of 25 (FREE_LIMITS.members)
--   - member_limit = -1 -> unlimited (MinistryLimits.members's own
--     documented sentinel)
--
-- Only fires on INSERT — a ministry already over a since-lowered limit is
-- never retroactively broken, same non-destructive principle the
-- client-side fix already followed.
--
-- security definer so the check can read ministry_subscriptions
-- regardless of the inserting user's own RLS grants on that table — same
-- reasoning as every other security definer helper in this codebase
-- (is_group_member/is_group_admin, 0150_rls_hardening_phase4.sql).
-- =====================================================================

begin;

create or replace function public.enforce_ministry_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit   integer;
  v_status  text;
  v_current integer;
begin
  select member_limit, status into v_limit, v_status
    from public.ministry_subscriptions
    where ministry_id = new.ministry_id
    order by created_at desc
    limit 1;

  if v_status is distinct from 'active' or v_limit is null then
    v_limit := 25;
  end if;

  if v_limit <> -1 then
    select count(*) into v_current from public.ministry_group_members where ministry_id = new.ministry_id;
    if v_current >= v_limit then
      raise exception 'This ministry has reached its member limit (%). Ask an admin to upgrade the plan.', v_limit;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_ministry_member_limit on public.ministry_group_members;
create trigger trg_enforce_ministry_member_limit
  before insert on public.ministry_group_members
  for each row
  execute function public.enforce_ministry_member_limit();

commit;
