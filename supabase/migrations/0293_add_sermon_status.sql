-- 0293_add_sermon_status.sql
-- Add status and processing_error to ministry_sermon_library

begin;

alter table if exists public.ministry_sermon_library
  add column if not exists status text not null default 'pending' check (status in ('pending','processing','done','error'));

alter table if exists public.ministry_sermon_library
  add column if not exists processing_error text;

create index if not exists idx_ministry_sermon_library_status
  on public.ministry_sermon_library (status);

grant select, insert, update, delete on public.ministry_sermon_library to authenticated;

commit;
