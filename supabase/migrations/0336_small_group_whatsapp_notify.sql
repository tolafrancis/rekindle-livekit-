-- supabase/migrations/0336_small_group_whatsapp_notify.sql
-- WhatsApp as a notification channel for Small Groups: when a leader
-- schedules a meeting or posts an announcement, individually message each
-- opted-in member's own WhatsApp number (via the ministry's connected WABA)
-- using a pre-approved Meta message template — WhatsApp Business requires a
-- template for any business-initiated message outside a 24h customer-service
-- window, so free-text broadcast (like ministry-whatsapp-broadcast's Twilio
-- path) isn't an option here.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

-- Per-member, per-group opt-in. small_group_members has a confirmed real
-- CREATE TABLE (0331_small_groups.sql), so a plain ALTER is safe here.
alter table public.small_group_members
  add column if not exists whatsapp_notify boolean not null default false;

-- ministry_whatsapp_configs is dashboard-managed (no CREATE TABLE in this
-- repo's migrations) — ADD COLUMN IF NOT EXISTS is safe regardless of who
-- created it. One ministry-wide template is reused for every small group's
-- notifications (asking each group leader to know a Meta template name
-- isn't realistic); the admin picks an APPROVED template once in the
-- WhatsApp Connect settings tab. Fixed 2-variable contract: {{1}} = short
-- title, {{2}} = details/body — documented in send-small-group-whatsapp-notify.
alter table public.ministry_whatsapp_configs
  add column if not exists notify_template_name text;
alter table public.ministry_whatsapp_configs
  add column if not exists notify_template_language text not null default 'en_US';

-- Lightweight send log — not per-recipient granular (that level of detail
-- lives in Meta's own delivery reports), just enough for a leader to see
-- "this went out to N members, M failed" after scheduling a meeting or
-- posting an announcement.
create table if not exists public.small_group_whatsapp_log (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.small_groups(id) on delete cascade,
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade,
  meeting_id uuid references public.small_group_meetings(id) on delete set null,
  post_id uuid references public.small_group_posts(id) on delete set null,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_reason text, -- e.g. 'not_configured' when the ministry has no WABA/template set up
  triggered_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_small_group_whatsapp_log_group_id on public.small_group_whatsapp_log (group_id, created_at desc);

alter table public.small_group_whatsapp_log enable row level security;

drop policy if exists p_small_group_whatsapp_log_select on public.small_group_whatsapp_log;
create policy p_small_group_whatsapp_log_select on public.small_group_whatsapp_log
  for select to authenticated
  using (public.is_small_group_leader(group_id, auth.uid()));

-- Only the edge function (service role) writes rows — no client insert policy.

commit;
