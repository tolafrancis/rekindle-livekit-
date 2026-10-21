-- 0416_help_assistant.sql
-- =====================================================================
-- In-app AI help assistant (help-assistant edge function + the "Need help?"
-- pop-up in both apps). It answers from faq_items (0393) and the Rekindle
-- Guide, and hands off to a person by filing a ministry_support_tickets row,
-- which shows up in Platform Admin › Support Tickets.
--
--   help_assistant_messages   one row per question asked: what was asked,
--                             what the AI answered, whether it was sure, and
--                             the ticket if it was handed off. Also backs the
--                             per-user daily limit, and shows admins which
--                             questions the FAQ is missing.
--
-- ministry_support_tickets fixes, needed now that tickets carry chat
-- transcripts from any app user:
--   * SELECT was open to everyone (qual = true). Now: the ticket's own
--     submitter, or a platform admin.
--   * INSERT was open (with_check = true). Now: only as yourself.
--   * resolved_by / resolution_notes are written by SupportTicketsManager but
--     never existed, so resolving a ticket failed. Added.
--   * source records where a ticket came from ('help_assistant' here).
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.help_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app text not null default 'rekindle' check (app in ('rekindle', 'ministry')),
  page text,
  question text not null,
  answer text,
  confident boolean not null default true,
  ticket_id uuid references public.ministry_support_tickets (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_help_assistant_messages_user_time
  on public.help_assistant_messages (user_id, created_at desc);
create index if not exists idx_help_assistant_messages_unsure
  on public.help_assistant_messages (created_at desc) where not confident;

alter table public.help_assistant_messages enable row level security;

drop policy if exists p_help_assistant_messages_own_read on public.help_assistant_messages;
create policy p_help_assistant_messages_own_read on public.help_assistant_messages
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists p_help_assistant_messages_own_insert on public.help_assistant_messages;
create policy p_help_assistant_messages_own_insert on public.help_assistant_messages
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists p_help_assistant_messages_own_update on public.help_assistant_messages;
create policy p_help_assistant_messages_own_update on public.help_assistant_messages
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.help_assistant_messages to authenticated;

-- ---------------------------------------------------------------------
-- ministry_support_tickets
-- ---------------------------------------------------------------------
alter table public.ministry_support_tickets
  add column if not exists resolved_by uuid references auth.users (id) on delete set null,
  add column if not exists resolution_notes text,
  add column if not exists source text not null default 'manual';

drop policy if exists "Users can view their support tickets" on public.ministry_support_tickets;
drop policy if exists p_ministry_support_tickets_read on public.ministry_support_tickets;
create policy p_ministry_support_tickets_read on public.ministry_support_tickets
  for select to authenticated
  using (submitted_by = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists "Users can insert support tickets" on public.ministry_support_tickets;
drop policy if exists p_ministry_support_tickets_insert on public.ministry_support_tickets;
create policy p_ministry_support_tickets_insert on public.ministry_support_tickets
  for insert to authenticated
  with check (submitted_by = auth.uid());
