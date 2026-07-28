-- 0266_platform_settings.sql
-- =====================================================================
-- Generic key/value platform-wide feature toggle store. First use: letting
-- a platform admin hide the "Ministries" tab in the consumer app's nav
-- without a code deploy. Readable by everyone (these gate UI visibility,
-- not sensitive data) — writable by platform admins only.
-- =====================================================================

begin;

create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

alter table public.platform_settings enable row level security;

drop policy if exists p_platform_settings_public_select on public.platform_settings;
create policy p_platform_settings_public_select on public.platform_settings
  for select to public
  using (true);

drop policy if exists p_platform_settings_admin_write on public.platform_settings;
create policy p_platform_settings_admin_write on public.platform_settings
  for all to authenticated
  using ((select up.role from public.user_profiles up where up.user_id = auth.uid()) in ('super_admin','platform_admin'))
  with check ((select up.role from public.user_profiles up where up.user_id = auth.uid()) in ('super_admin','platform_admin'));

insert into public.platform_settings (key, value) values
  ('consumer_ministries_tab_enabled', 'true'::jsonb)
on conflict (key) do nothing;

commit;
