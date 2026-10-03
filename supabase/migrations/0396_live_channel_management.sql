-- 0396_live_channel_management.sql
-- =====================================================================
-- Channel owners can edit their channel's details (name, description,
-- logo, cover, category), hide it or delete it. Ministry channels belong to
-- the ministry (0395), so the ministry's admins (is_group_admin) can manage
-- them too, not just whoever created them.
--
-- Renames are limited to once every 14 days, like YouTube, so a channel's
-- identity can't keep changing under its followers. Platform admins and
-- backend jobs are exempt.
-- =====================================================================

alter table public.live_channels add column if not exists name_changed_at timestamptz;

create policy "Ministry admins can update ministry channels" on public.live_channels
  for update to authenticated
  using (ministry_id is not null and public.is_group_admin(ministry_id, auth.uid()))
  with check (ministry_id is not null and public.is_group_admin(ministry_id, auth.uid()));

create policy "Ministry admins can delete ministry channels" on public.live_channels
  for delete to authenticated
  using (ministry_id is not null and public.is_group_admin(ministry_id, auth.uid()));

create or replace function public.limit_live_channel_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is not distinct from old.name then
    return new;
  end if;
  if auth.uid() is not null
     and not public.is_platform_admin(auth.uid())
     and old.name_changed_at is not null
     and old.name_changed_at > now() - interval '14 days' then
    raise exception 'Channel names can be changed once every 14 days. You can rename this channel again on %.',
      to_char(old.name_changed_at + interval '14 days', 'DD Mon YYYY')
      using errcode = 'P0001';
  end if;
  new.name_changed_at := now();
  return new;
end;
$$;

create trigger trg_limit_live_channel_rename
  before update of name on public.live_channels
  for each row
  execute function public.limit_live_channel_rename();
