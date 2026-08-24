-- 0294_add_sermon_retry_count.sql
-- Add retry_count column to ministry_sermon_library to track retry attempts

begin;

alter table if exists public.ministry_sermon_library
  add column if not exists retry_count integer not null default 0;

create index if not exists idx_ministry_sermon_library_retry_count
  on public.ministry_sermon_library (retry_count);

grant select, insert, update, delete on public.ministry_sermon_library to authenticated;

commit;
