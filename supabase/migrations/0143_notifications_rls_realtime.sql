-- supabase/migrations/0143_notifications_rls_realtime.sql
-- Full RLS + realtime for the in-app notifications feed. Without SELECT a user
-- cannot read their own notifications (bell stays empty even when rows exist);
-- without the realtime publication the bell badge won't update live.
-- Server-side writes (edge functions, service role) bypass all of this.

alter table public.notifications enable row level security;

-- Read own notifications (bell feed + unread count).
drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select to authenticated
  using (auth.uid() = user_id);

-- Update own notifications (mark as read).
drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications"
  on public.notifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Delete own notifications (dismiss).
drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Users delete own notifications"
  on public.notifications for delete to authenticated
  using (auth.uid() = user_id);

-- Insert own notifications (client-side self-notifications; server bypasses RLS).
drop policy if exists "Users insert own notifications" on public.notifications;
create policy "Users insert own notifications"
  on public.notifications for insert to authenticated
  with check (auth.uid() = user_id);

-- Realtime: add the table to the supabase_realtime publication so the bell badge
-- blips live via postgres_changes. Guarded so it is safe to re-run.
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;
