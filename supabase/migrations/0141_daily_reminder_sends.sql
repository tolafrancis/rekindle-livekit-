-- supabase/migrations/0141_daily_reminder_sends.sql
-- Dedup ledger for the daily in-app reminder worker (process-daily-reminders).
-- One row per (user, reminder, local calendar day). The composite primary key
-- is what guarantees a reminder fires at most once per day even if the cron
-- job overlaps or runs twice in the same window.

create table if not exists public.daily_reminder_sends (
  user_id     uuid        not null,
  reminder_id text        not null,          -- 'bible' | 'book' | 'prayer' | 'devotional' | 'memory'
  sent_on     date        not null,          -- calendar day in the USER's timezone
  created_at  timestamptz not null default now(),
  primary key (user_id, reminder_id, sent_on)
);

-- Housekeeping: let us prune old rows cheaply.
create index if not exists idx_daily_reminder_sends_sent_on
  on public.daily_reminder_sends (sent_on);

-- Only the service role (edge function) touches this table. Enable RLS with no
-- policies so it is not exposed to client/anon roles; service role bypasses RLS.
alter table public.daily_reminder_sends enable row level security;
