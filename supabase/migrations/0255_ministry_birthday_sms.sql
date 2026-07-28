-- 0255_ministry_birthday_sms.sql
-- =====================================================================
-- Adds SMS as a second channel for Birthday Wishes (packages/ministry/src/
-- components/MinistryBirthdayWishes.tsx + the process-birthday-wishes edge
-- function). SMS gets its own credentials (ministry_sms_configs), fully
-- independent of whatever the ministry uses for WhatsApp (Meta or Twilio,
-- in ministry_whatsapp_configs) — a ministry can run SMS with no WhatsApp
-- connected at all, or vice versa.
--
-- RLS reuses is_group_member()/is_group_admin() from
-- 0150_rls_hardening_phase4.sql — the safe, audited pattern. Not redefined.
-- =====================================================================

begin;

create table if not exists public.ministry_sms_configs (
  ministry_id                  uuid primary key references public.ministry_groups(id) on delete cascade,
  twilio_account_sid           text,
  twilio_auth_token_encrypted  text,
  from_number                  text,
  connection_status            text not null default 'disconnected'
    check (connection_status in ('disconnected', 'connected', 'error')),
  updated_at                   timestamptz not null default now()
);

alter table public.ministry_sms_configs enable row level security;

-- Credentials table — admin-only. No member-read policy: there's no reason
-- a plain member needs to see Twilio secrets (even encrypted).
create policy p_ministry_sms_configs_admin_all on public.ministry_sms_configs
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

alter table public.ministry_birthday_settings
  add column if not exists sms_enabled boolean not null default false,
  add column if not exists sms_message text;

alter table public.ministry_birthday_send_log
  add column if not exists channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'sms'));

-- The existing per-(ministry,user,year) uniqueness predates tracked
-- migrations, so its name isn't known statically — look it up and widen it
-- to include `channel`, so a WhatsApp send and an SMS send for the same
-- person in the same year don't block each other.
do $$
declare
  con_name text;
begin
  -- Compare the SET of column names (sorted), not conkey's attnum order —
  -- the original constraint's declared column order isn't known statically.
  select con.conname into con_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'ministry_birthday_send_log'
    and con.contype = 'u'
    and (
      select array_agg(attname::text order by attname)
      from pg_attribute
      where attrelid = rel.oid
        and attnum = any(con.conkey)
    ) = array['ministry_id', 'send_year', 'user_id']::text[]
  limit 1;

  if con_name is not null then
    execute format('alter table public.ministry_birthday_send_log drop constraint %I', con_name);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ministry_birthday_send_log_ministry_user_year_channel_key'
  ) then
    alter table public.ministry_birthday_send_log
      add constraint ministry_birthday_send_log_ministry_user_year_channel_key
      unique (ministry_id, user_id, send_year, channel);
  end if;
end $$;

commit;
