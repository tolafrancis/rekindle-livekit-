-- 0292_ministry_sermon_library.sql
-- =====================================================================
-- Ministry sermon library and approved vocabulary persistence.
--
-- This stores leader-uploaded sermon drafts, optional source links, and the
-- approved sermon phrases that improve STT quality for future live sessions.
-- =====================================================================

begin;

create table if not exists public.ministry_sermon_library (
  id            uuid primary key default gen_random_uuid(),
  ministry_id   uuid not null references public.ministry_groups(id) on delete cascade,
  title         text not null,
  speaker       text not null default 'Unknown speaker',
  transcript    text not null default '',
  file_name     text,
  source_type   text not null default 'upload' check (source_type in ('upload', 'link', 'youtube')),
  source_url    text,
  approved_terms text[] not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists idx_ministry_sermon_library_ministry_id
  on public.ministry_sermon_library (ministry_id);
create index if not exists idx_ministry_sermon_library_created_at
  on public.ministry_sermon_library (created_at desc);

create table if not exists public.ministry_sermon_vocabularies (
  ministry_id     uuid not null references public.ministry_groups(id) on delete cascade,
  term            text not null,
  source_sermon_id uuid references public.ministry_sermon_library(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (ministry_id, term)
);

create index if not exists idx_ministry_sermon_vocabularies_ministry_id
  on public.ministry_sermon_vocabularies (ministry_id);
create index if not exists idx_ministry_sermon_vocabularies_source_sermon_id
  on public.ministry_sermon_vocabularies (source_sermon_id);

alter table public.ministry_sermon_library enable row level security;
alter table public.ministry_sermon_vocabularies enable row level security;

create policy p_ministry_sermon_library_member_read on public.ministry_sermon_library
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

create policy p_ministry_sermon_library_admin_all on public.ministry_sermon_library
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

create policy p_ministry_sermon_vocabularies_member_read on public.ministry_sermon_vocabularies
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

create policy p_ministry_sermon_vocabularies_admin_all on public.ministry_sermon_vocabularies
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

grant select, insert, update, delete on public.ministry_sermon_library to authenticated;
grant select, insert, update, delete on public.ministry_sermon_vocabularies to authenticated;

commit;
