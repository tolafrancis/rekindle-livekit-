-- supabase/migrations/0018_user_book_progress_rls.sql
-- Make book completions persist and count correctly.
--
--   1. Enable Row Level Security on user_book_progress and add per-user policies
--      so a signed-in user can read/insert/update/delete only their own rows.
--      (Without these, anon-key writes from the client are silently rejected and
--      the "Books Completed" stat never increments.)
--   2. De-duplicate any existing rows (one per user+book, preferring a completed
--      row) and add a unique index so the count can never double-count a book.
--
-- Run in the Supabase SQL Editor. Idempotent and transactional — safe to re-run.

begin;

-- 1) Row Level Security ------------------------------------------------------
alter table public.user_book_progress enable row level security;

drop policy if exists "user_book_progress_select_own" on public.user_book_progress;
create policy "user_book_progress_select_own"
  on public.user_book_progress
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_book_progress_insert_own" on public.user_book_progress;
create policy "user_book_progress_insert_own"
  on public.user_book_progress
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_book_progress_update_own" on public.user_book_progress;
create policy "user_book_progress_update_own"
  on public.user_book_progress
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_book_progress_delete_own" on public.user_book_progress;
create policy "user_book_progress_delete_own"
  on public.user_book_progress
  for delete
  using (auth.uid() = user_id);

-- 2) De-duplicate, then enforce one row per (user, book) ---------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, book_id
      order by is_completed desc nulls last, completed_at desc nulls last, id
    ) as rn
  from public.user_book_progress
)
delete from public.user_book_progress
where id in (select id from ranked where rn > 1);

create unique index if not exists user_book_progress_user_book_uniq
  on public.user_book_progress (user_id, book_id);

commit;
