-- 0434: Ministry "Recent broadcasts" history.
--
-- The ministry Broadcast screen lists past sends by filtering broadcast_logs on
-- metadata->ministryId, and send-ministry-email / send-ministry-sms-broadcast
-- write that metadata, but the column never existed. The email/SMS log inserts
-- failed and the list was always empty. Ministry admins also had no SELECT
-- policy on the table (only platform admins did).
--
-- Adds the column, an index for the lookup, and lets a ministry's admins read
-- that ministry's own log rows. No DROP statements.

begin;

alter table public.broadcast_logs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists broadcast_logs_metadata_ministry_idx
  on public.broadcast_logs ((metadata->>'ministryId'), sent_at desc);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'broadcast_logs'
      and policyname = 'ministry_admin_read_broadcast_logs'
  ) then
    create policy ministry_admin_read_broadcast_logs on public.broadcast_logs
      for select to authenticated
      using (
        metadata ? 'ministryId'
        and (metadata->>'ministryId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.is_group_admin((metadata->>'ministryId')::uuid, auth.uid())
      );
  end if;
end $$;

commit;
