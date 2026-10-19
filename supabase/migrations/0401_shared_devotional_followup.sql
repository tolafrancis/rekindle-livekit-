-- 0401_shared_devotional_followup.sql
-- The morning after someone signs up from a shared devotional link, email them
-- that day's devotional and the app's store link (edge function
-- send-shared-devotional-followup). Sent once per person, only with email
-- consent, and skipped for anyone who already has the phone app.

-- One row per person: the first shared devotional they opened on the web.
-- The app writes it (recordSharedDevotionalOpen); the function decides whether
-- the account is new enough and when it's morning where they are.
create table if not exists public.shared_devotional_followups (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('daily', 'ministry')),
  devotional_id  uuid not null,
  app            text not null check (app in ('consumer', 'ministry')),
  created_at     timestamptz not null default now(),
  processed_at   timestamptz,
  outcome        text
);

alter table public.shared_devotional_followups enable row level security;

drop policy if exists shared_devotional_followups_insert_own on public.shared_devotional_followups;
create policy shared_devotional_followups_insert_own
  on public.shared_devotional_followups
  for insert
  to authenticated
  with check (user_id = auth.uid() and processed_at is null and outcome is null);

grant insert on public.shared_devotional_followups to authenticated;

create index if not exists shared_devotional_followups_pending
  on public.shared_devotional_followups (created_at)
  where processed_at is null;

-- Hourly, so each person's email goes out in their local morning.
select cron.schedule(
  'send-shared-devotional-followup',
  '35 * * * *',
  $$
  select net.http_post(
    url     := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/send-shared-devotional-followup',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
