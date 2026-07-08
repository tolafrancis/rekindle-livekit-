-- supabase/migrations/0028_ai_companion_settings.sql
-- Single-row settings table controlling which AI provider powers the
-- GraceCounsel spiritual companion. Toggled from the admin panel; read by the
-- `spiritual-companion` edge function on every request (no redeploy to switch).
--
-- Paste this into the Supabase SQL Editor and run it once.

create table if not exists public.ai_companion_settings (
  id          smallint primary key default 1,
  provider    text not null default 'openai' check (provider in ('openai', 'claude')),
  updated_at  timestamptz not null default now(),
  constraint ai_companion_settings_singleton check (id = 1)
);

-- Seed the single row (default: OpenAI).
insert into public.ai_companion_settings (id, provider)
values (1, 'openai')
on conflict (id) do nothing;

alter table public.ai_companion_settings enable row level security;

-- Any signed-in user can READ the current provider (the edge function reads it
-- with the caller's JWT; the value is not sensitive).
drop policy if exists "ai_settings_read" on public.ai_companion_settings;
create policy "ai_settings_read"
  on public.ai_companion_settings
  for select
  to authenticated
  using (true);

-- Only admins/moderators can CHANGE the provider.
drop policy if exists "ai_settings_admin_update" on public.ai_companion_settings;
create policy "ai_settings_admin_update"
  on public.ai_companion_settings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.role in ('admin', 'super_admin', 'moderator')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.role in ('admin', 'super_admin', 'moderator')
    )
  );
