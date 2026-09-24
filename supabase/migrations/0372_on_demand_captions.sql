-- 0372_on_demand_captions.sql
-- =====================================================================
-- On-demand source-language captions (Phase 1: Interactive Meetings).
--
-- Any participant can turn CC on without the host enabling anything. The
-- captions-start edge function claims a caption_sessions row for the room
-- (one live row per room, enforced by a partial unique index, so two
-- participants tapping CC at the same instant start exactly one agent) and
-- the caption agent (agents/captions) picks it up over LISTEN
-- "caption_dispatch".
--
-- Deliberately separate from the Live Translation pipeline: nothing here
-- reads or writes any translation_* table, language_configs, or the
-- bot_dispatch channel.
--
-- Idempotent — safe to re-run in the SQL editor.
-- =====================================================================

begin;

-- ── 1. Per-room caption language (STT language only) ─────────────────────
alter table public.ministry_video_meetings
  add column if not exists source_language text not null default 'en';

alter table public.ministry_webinars
  add column if not exists source_language text not null default 'en';

-- ── 2. caption_sessions — one live caption agent per room ────────────────
create table if not exists public.caption_sessions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.ministry_groups (id) on delete cascade,
  room_id            uuid not null,
  room_kind          text not null default 'ministry_meeting',
  room_name          text not null,
  source_language    text not null default 'en',
  status             text not null default 'starting',
  started_by         text,
  last_heartbeat_at  timestamptz not null default now(),
  stop_reason        text,
  created_at         timestamptz not null default now(),
  ended_at           timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'caption_sessions_status_check'
  ) then
    alter table public.caption_sessions
      add constraint caption_sessions_status_check
      check (status in ('starting', 'active', 'ended'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'caption_sessions_room_kind_check'
  ) then
    alter table public.caption_sessions
      add constraint caption_sessions_room_kind_check
      check (room_kind in ('ministry_meeting', 'ministry_webinar'));
  end if;
end;
$$;

-- The idempotency guarantee: at most one non-ended session per room.
create unique index if not exists caption_sessions_one_live_per_room
  on public.caption_sessions (room_name)
  where status in ('starting', 'active');

create index if not exists caption_sessions_org_created_idx
  on public.caption_sessions (org_id, created_at desc);

alter table public.caption_sessions enable row level security;

-- Org admins can see their own org's sessions; all writes are service-role
-- only (the edge function and the agent), so no insert/update/delete policy.
drop policy if exists caption_sessions_select_org_admin on public.caption_sessions;
create policy caption_sessions_select_org_admin on public.caption_sessions
  for select
  using (public.is_group_admin(org_id, auth.uid()));

-- ── 3. caption_usage — caption minutes per org, room and date ────────────
create table if not exists public.caption_usage (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.ministry_groups (id) on delete cascade,
  room_id     uuid not null,
  usage_date  date not null default (now() at time zone 'utc')::date,
  minutes     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, room_id, usage_date)
);

create index if not exists caption_usage_org_date_idx
  on public.caption_usage (org_id, usage_date desc);

alter table public.caption_usage enable row level security;

drop policy if exists caption_usage_select_org_admin on public.caption_usage;
create policy caption_usage_select_org_admin on public.caption_usage
  for select
  using (public.is_group_admin(org_id, auth.uid()));

-- ── 4. claim_caption_session — atomic get-or-create + dispatch ──────────
-- Called only by the captions-start edge function (service role), after it
-- has verified the caller is really in the room. A session whose agent has
-- stopped heartbeating for 2 minutes is treated as dead and ended first, so
-- a crashed agent can never block captions for the rest of a meeting.
create or replace function public.claim_caption_session(
  p_org_id          uuid,
  p_room_id         uuid,
  p_room_kind       text,
  p_room_name       text,
  p_source_language text,
  p_started_by      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing   public.caption_sessions%rowtype;
  v_session_id uuid;
begin
  update public.caption_sessions
     set status = 'ended', ended_at = now(), stop_reason = 'heartbeat_lost'
   where room_name = p_room_name
     and status in ('starting', 'active')
     and last_heartbeat_at < now() - interval '2 minutes';

  insert into public.caption_sessions (
    org_id, room_id, room_kind, room_name, source_language, status, started_by
  )
  values (
    p_org_id, p_room_id, p_room_kind, p_room_name,
    coalesce(nullif(p_source_language, ''), 'en'), 'starting', p_started_by
  )
  on conflict (room_name) where status in ('starting', 'active') do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select * into v_existing
      from public.caption_sessions
     where room_name = p_room_name and status in ('starting', 'active')
     limit 1;
    return jsonb_build_object('session_id', v_existing.id, 'status', v_existing.status, 'reused', true);
  end if;

  perform pg_notify('caption_dispatch', jsonb_build_object(
    'action', 'start',
    'session_id', v_session_id,
    'org_id', p_org_id,
    'room_id', p_room_id,
    'room_name', p_room_name,
    'source_language', coalesce(nullif(p_source_language, ''), 'en')
  )::text);

  return jsonb_build_object('session_id', v_session_id, 'status', 'starting', 'reused', false);
end;
$$;

revoke all on function public.claim_caption_session(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_caption_session(uuid, uuid, text, text, text, text) to service_role;

-- ── 5. record_caption_usage — agent's per-minute usage + safety alert ────
-- Adds minutes for (org, room, today) and returns the org's total for today
-- so the agent can apply its internal safety threshold. When the org first
-- crosses p_alert_threshold today, every platform admin gets one in-app
-- notification (public.notifications, same shape 0159/0332/0334 use).
-- There is no user-facing cap: this never blocks or stops anything itself.
create or replace function public.record_caption_usage(
  p_org_id          uuid,
  p_room_id         uuid,
  p_minutes         integer,
  p_alert_threshold integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today       date := (now() at time zone 'utc')::date;
  v_before      integer;
  v_after       integer;
begin
  select coalesce(sum(minutes), 0) into v_before
    from public.caption_usage
   where org_id = p_org_id and usage_date = v_today;

  insert into public.caption_usage (org_id, room_id, usage_date, minutes)
  values (p_org_id, p_room_id, v_today, greatest(p_minutes, 0))
  on conflict (org_id, room_id, usage_date)
  do update set minutes = public.caption_usage.minutes + excluded.minutes,
                updated_at = now();

  v_after := v_before + greatest(p_minutes, 0);

  if p_alert_threshold is not null
     and v_before < p_alert_threshold
     and v_after >= p_alert_threshold then
    raise warning 'caption usage alert: org % reached % caption minutes on %', p_org_id, v_after, v_today;
    begin
      insert into public.notifications (user_id, type, title, message, link, is_read)
      select up.user_id, 'caption_usage_alert', 'Caption usage alert',
             'Ministry ' || p_org_id::text || ' has used ' || v_after || ' caption minutes today (' || v_today || ').',
             null, false
        from public.user_profiles up
       where up.role in ('admin', 'super_admin');
    exception when others then
      raise warning 'record_caption_usage: admin notification failed: %', sqlerrm;
    end;
  end if;

  return v_after;
end;
$$;

revoke all on function public.record_caption_usage(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.record_caption_usage(uuid, uuid, integer, integer) to service_role;

commit;
