-- supabase/migrations/0030_ui_translations.sql
-- Phase 1 of the multilingual initiative: DB-backed UI dictionary.
--
-- English (DEFAULT_TRANSLATIONS in src/lib/i18n.ts) stays the in-code source of
-- truth + universal fallback. This table stores TRANSLATED UI strings per
-- language (Vietnamese first). The loader merges these rows over the English
-- dictionary, so any missing key gracefully falls back to English instead of a
-- broken machine translation. Later (Phase 3.5) an admin "Language Manager"
-- screen writes to this table directly.
--
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.

begin;

create table if not exists public.ui_translations (
  id             uuid primary key default gen_random_uuid(),
  language_code  text not null,          -- e.g. 'vi'
  namespace      text not null,          -- e.g. 'common', 'navigation'
  key            text not null,          -- e.g. 'save', 'loading'
  value          text not null,          -- the translated string
  reviewed       boolean not null default false,  -- true once a human approves it
  updated_by     uuid,                   -- admin who last edited (auth.uid())
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ui_translations_lang_namespace_key_key
    unique (language_code, namespace, key)
);

create index if not exists idx_ui_translations_lang
  on public.ui_translations (language_code);
create index if not exists idx_ui_translations_lang_reviewed
  on public.ui_translations (language_code, reviewed);

alter table public.ui_translations enable row level security;

-- READ: UI strings are not sensitive and must load for logged-out visitors too
-- (landing page, auth screens). Open read to anon + authenticated.
drop policy if exists "ui_translations_public_read" on public.ui_translations;
create policy "ui_translations_public_read"
  on public.ui_translations
  for select
  to anon, authenticated
  using (true);

-- WRITE: only admins/moderators (same gate as ai_companion_settings, 0028).
drop policy if exists "ui_translations_admin_write" on public.ui_translations;
create policy "ui_translations_admin_write"
  on public.ui_translations
  for all
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

-- keep updated_at fresh on edits
create or replace function public.set_ui_translations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ui_translations_updated_at on public.ui_translations;
create trigger trg_ui_translations_updated_at
  before update on public.ui_translations
  for each row execute function public.set_ui_translations_updated_at();

commit;
