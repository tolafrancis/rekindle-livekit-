-- Migration: platform_settings table for WhatsApp provider toggle
create table if not exists platform_settings (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Seed default provider
insert into platform_settings (key, value)
values ('whatsapp_reminder_provider', 'twilio')
on conflict (key) do nothing;

-- RLS
alter table platform_settings enable row level security;

create policy "admin_all_platform_settings" on platform_settings
  for all using (
    exists (
      select 1 from user_profiles
      where id = auth.uid()
      and role in ('admin', 'super_admin')
    )
  );
