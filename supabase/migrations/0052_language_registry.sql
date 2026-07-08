-- supabase/migrations/0052_language_registry.sql
-- Phase 3.5 (Language Manager) — the language registry. Moves the "which
-- languages exist and are live" decision out of the hardcoded SUPPORTED_LANGUAGES
-- array in src/lib/i18n.ts and into the DB, so an admin can add / publish a
-- language with no code change (paired with the ui_translations table from 0030).
--
-- The app reads ENABLED + published rows to decide which languages appear in the
-- switcher; the in-code SUPPORTED_LANGUAGES list remains the catalogue an admin
-- picks from when adding a language, plus a safe fallback if this table is empty.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

create table if not exists public.app_languages (
  code          text primary key,        -- 'en', 'vi', ...
  name          text not null,           -- 'Vietnamese'
  native_name   text not null,           -- 'Tiếng Việt'
  flag          text,
  rtl           boolean not null default false,
  region        text,
  font_family   text,
  enabled       boolean not null default false,   -- shows in the switcher when true
  ui_status     text not null default 'draft',    -- 'draft' | 'published'
  bible_version text,                    -- linked scripture version id for this language (never MT scripture)
  sort_order    integer not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint app_languages_ui_status_chk check (ui_status in ('draft', 'published'))
);

create index if not exists idx_app_languages_enabled on public.app_languages (enabled, ui_status);

alter table public.app_languages enable row level security;

-- READ: everyone (the switcher must load for logged-out visitors too).
drop policy if exists "app_languages_public_read" on public.app_languages;
create policy "app_languages_public_read"
  on public.app_languages for select to anon, authenticated using (true);

-- WRITE: admins/moderators only (same gate as ui_translations, 0030).
drop policy if exists "app_languages_admin_write" on public.app_languages;
create policy "app_languages_admin_write"
  on public.app_languages for all to authenticated
  using (exists (select 1 from public.user_profiles up
                 where up.user_id = auth.uid() and up.role in ('admin','super_admin','moderator')))
  with check (exists (select 1 from public.user_profiles up
                      where up.user_id = auth.uid() and up.role in ('admin','super_admin','moderator')));

-- keep updated_at fresh
create or replace function public.set_app_languages_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_app_languages_updated_at on public.app_languages;
create trigger trg_app_languages_updated_at
  before update on public.app_languages
  for each row execute function public.set_app_languages_updated_at();

-- Seed the two launch languages as enabled + published. Others are added by an
-- admin via the Language Manager (drafted, reviewed, then published).
insert into public.app_languages (code, name, native_name, flag, rtl, region, enabled, ui_status, sort_order) values
  ('en', 'English',    'English',    '🇬🇧', false, 'european', true, 'published', 0),
  ('vi', 'Vietnamese', 'Tiếng Việt', '🇻🇳', false, 'asian',    true, 'published', 1)
on conflict (code) do nothing;

commit;
