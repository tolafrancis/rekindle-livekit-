-- =====================================================================
-- Content submissions — a public link ("Write for Us") sent to writers
-- and authors, letting them submit a Book Summary, Devotional Series, or
-- Prayer Library series for review without an account. Platform admins
-- (is_content_admin — same check book_summaries/prayer_library/devotionals
-- already use, 0151/0153) review each submission from a queue and
-- Approve, Recommend changes (feedback back to the author, stays open for
-- a resubmission), or Reject.
--
-- Deliberately one shared table across all three content types rather than
-- three: the only real difference between them is shape (a book is one
-- summary; a devotional/prayer series is a list of days), which the
-- flexible `days` jsonb column already covers (empty for a book). All
-- three destination tables (book_summaries, devotional series, prayer
-- library series) are platform-wide content with no ministry_id, so this
-- mirrors that — not ministry-scoped.
--
-- Scope note: this migration + the submission form/review queue is the
-- MVP the workflow needs (submit -> review -> approve/recommend/reject).
-- Auto-publishing an approved submission straight into book_summaries /
-- the devotional or prayer series tables is a fast-follow — for now the
-- admin uses the submission's content as reference and publishes through
-- the existing AdminBookManager / devotional / prayer series tools.
-- =====================================================================

begin;

create table if not exists public.content_submissions (
  id               uuid primary key default gen_random_uuid(),
  content_type     text not null check (content_type in ('book', 'devotional_series', 'prayer_series')),
  title            text not null,
  author_name      text not null,
  author_email     text not null,
  category         text,
  description      text not null,
  -- Books: unused (summary text lives in `description`, takeaways below).
  key_takeaways    text[] not null default '{}',
  -- Devotional/prayer series: one entry per day, e.g.
  -- [{ "day": 1, "title": "...", "scripture": "...", "content": "..." }, ...].
  days             jsonb not null default '[]'::jsonb,
  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'changes_requested', 'rejected')),
  admin_notes      text,
  reviewed_by      uuid references auth.users(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_content_submissions_status
  on public.content_submissions (status, created_at desc);
create index if not exists idx_content_submissions_type
  on public.content_submissions (content_type);

alter table public.content_submissions enable row level security;

-- Anyone (including anonymous writers using the public link) can submit —
-- insert-only, no read-back of other people's submissions.
drop policy if exists content_submissions_public_insert on public.content_submissions;
create policy content_submissions_public_insert on public.content_submissions
  for insert to anon, authenticated
  with check (status = 'pending' and reviewed_by is null and reviewed_at is null);

-- Platform content admins get full access to review the queue.
drop policy if exists content_submissions_admin_all on public.content_submissions;
create policy content_submissions_admin_all on public.content_submissions
  for all to authenticated
  using (public.is_content_admin(auth.uid()))
  with check (public.is_content_admin(auth.uid()));

commit;
