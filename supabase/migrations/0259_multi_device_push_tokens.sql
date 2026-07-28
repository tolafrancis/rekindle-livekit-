-- Migration: Multi-device push token support (one token per app per session)
begin;

-- 1. Add app_id column to push_tokens table
alter table public.push_tokens
  add column if not exists app_id text default null;

-- 2. Drop the old unique constraint on device_token alone
alter table public.push_tokens
  drop constraint if exists push_tokens_device_token_key;

-- 3. Add new unique constraint on (user_id, device_token, app_id)
alter table public.push_tokens
  add constraint push_tokens_user_device_app_key unique nulls not distinct (user_id, device_token, app_id);

-- 4. Update claim_push_token RPC to accept p_app_id and update ON CONFLICT target
create or replace function public.claim_push_token(
  p_device_token text,
  p_platform text default 'web',
  p_role text default 'user',
  p_app_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Delete any existing push token registration for this (device_token, app_id) belonging to a different user
  delete from push_tokens
  where device_token = p_device_token
    and coalesce(app_id, '') = coalesce(p_app_id, '')
    and user_id != v_user_id;

  -- Upsert current user's registration for this device token + app_id combination
  insert into push_tokens (user_id, device_token, platform, role, app_id, updated_at)
  values (v_user_id, p_device_token, p_platform, p_role, p_app_id, now())
  on conflict (user_id, device_token, app_id)
  do update set
    platform = excluded.platform,
    role = excluded.role,
    updated_at = now();
end;
$$;

commit;
