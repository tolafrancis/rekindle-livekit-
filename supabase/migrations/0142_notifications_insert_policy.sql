-- supabase/migrations/0142_notifications_insert_policy.sql
-- Allow an authenticated user to create notifications addressed to THEMSELVES.
-- Server-side writes (edge functions using the service role) already bypass RLS;
-- this covers client-side self-notifications (e.g. the "Send test" button and
-- any notify() call targeting the current user). It does NOT let a user create
-- notifications for anyone else — the WITH CHECK pins user_id to auth.uid().

alter table public.notifications enable row level security;

drop policy if exists "Users insert own notifications" on public.notifications;
create policy "Users insert own notifications"
  on public.notifications
  for insert
  to authenticated
  with check (auth.uid() = user_id);
