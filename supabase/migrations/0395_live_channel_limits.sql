-- 0395_live_channel_limits.sql
-- =====================================================================
-- One live channel per account, the way YouTube / Facebook Pages work:
--   • personal channels (ministry_id is null): 1 per owner
--   • ministry channels: 1 per ministry, whoever creates it;
--     Ministry Plus gets 3 extra for campuses or language services (4 total)
--   • platform admins: unlimited
-- Who may create a channel at all is still decided by the apps (Individual
-- Partners / ministry plans for personal channels, ministry leaders for
-- ministry channels). This only caps the count. Channels created before this
-- migration are kept even where they exceed the new cap.
-- =====================================================================

create or replace function public.live_channel_limit(p_ministry_id uuid)
returns integer
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_plan text;
begin
  if public.is_platform_admin(auth.uid()) then
    return null; -- unlimited
  end if;
  if p_ministry_id is null then
    return 1;
  end if;
  select plan_type into v_plan
    from public.ministry_subscriptions
    where ministry_id = p_ministry_id and status = 'active'
    order by created_at desc
    limit 1;
  return case when v_plan = 'ministry_plus' then 4 else 1 end;
end;
$$;

-- Limit and current count for the "create channel" button.
create or replace function public.get_live_channel_quota(p_ministry_id uuid default null)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_ministry_id is null then
    select count(*) into v_used from public.live_channels
      where owner_id = auth.uid() and ministry_id is null;
  else
    select count(*) into v_used from public.live_channels
      where ministry_id = p_ministry_id;
  end if;
  return json_build_object('max', public.live_channel_limit(p_ministry_id), 'used', v_used);
end;
$$;
grant execute on function public.get_live_channel_quota(uuid) to authenticated;

create or replace function public.enforce_live_channel_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_used  integer;
begin
  if auth.uid() is null then
    return new; -- service role / backend jobs
  end if;
  v_limit := public.live_channel_limit(new.ministry_id);
  if v_limit is null then
    return new;
  end if;
  if new.ministry_id is null then
    select count(*) into v_used from public.live_channels
      where owner_id = new.owner_id and ministry_id is null;
  else
    select count(*) into v_used from public.live_channels
      where ministry_id = new.ministry_id;
  end if;
  if v_used >= v_limit then
    raise exception 'Channel limit reached: % allows % live channel(s).',
      case when new.ministry_id is null then 'your account' else 'this ministry''s plan' end, v_limit
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_live_channel_limit on public.live_channels;
create trigger trg_enforce_live_channel_limit
  before insert on public.live_channels
  for each row
  execute function public.enforce_live_channel_limit();

-- Plan card copy.
update public.ministry_partner_plans
  set features = features || '["Up to 4 live channels for campuses or languages"]'::jsonb
  where slug = 'ministry_plus'
    and not features ? 'Up to 4 live channels for campuses or languages';
