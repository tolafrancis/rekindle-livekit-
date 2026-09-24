-- 0375_personal_channel_captions.sql
-- =====================================================================
-- On-demand captions for personal (non-ministry) Live Broadcast channels.
--
-- Caption sessions and usage were keyed to an org (ministry_groups). A
-- personal channel has no ministry, so its sessions and minutes are logged
-- against the channel owner instead: org_id is now nullable, a new
-- owner_user_id column holds the owner, and exactly one of the two is set.
--
--   - caption_usage is now unique per (room_id, usage_date) — room ids are
--     meeting/webinar/channel uuids, so that's still one row per room per
--     day — because a null org_id would defeat the old
--     (org_id, room_id, usage_date) constraint.
--   - The internal daily alert totals per org, or per owner for personal
--     channels. Still no user-facing cap.
--   - Channel owners can read their own usage and sessions; org admins
--     still read their org's. Writes stay service-role only.
--   - claim_caption_session and record_caption_usage gain a trailing
--     p_owner_user_id (default null). The old signatures are dropped so
--     calls stay unambiguous; existing callers work unchanged.
--
-- Still nothing here touches any translation_* table, language_configs, or
-- the bot_dispatch channel. Idempotent — safe to re-run.
-- =====================================================================

begin;

-- ── 1. Owner columns ─────────────────────────────────────────────────────
alter table public.caption_sessions
  add column if not exists owner_user_id uuid references auth.users (id) on delete cascade;
alter table public.caption_sessions alter column org_id drop not null;

alter table public.caption_usage
  add column if not exists owner_user_id uuid references auth.users (id) on delete cascade;
alter table public.caption_usage alter column org_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'caption_sessions_owner_check') then
    alter table public.caption_sessions
      add constraint caption_sessions_owner_check
      check ((org_id is not null) <> (owner_user_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caption_usage_owner_check') then
    alter table public.caption_usage
      add constraint caption_usage_owner_check
      check ((org_id is not null) <> (owner_user_id is not null));
  end if;
end;
$$;

create unique index if not exists caption_usage_room_date_uidx
  on public.caption_usage (room_id, usage_date);

create index if not exists caption_usage_owner_date_idx
  on public.caption_usage (owner_user_id, usage_date desc)
  where owner_user_id is not null;

-- ── 2. RLS: owners read their own ────────────────────────────────────────
drop policy if exists caption_sessions_select_org_admin on public.caption_sessions;
create policy caption_sessions_select_org_admin on public.caption_sessions
  for select
  using (
    (org_id is not null and public.is_group_admin(org_id, auth.uid()))
    or (owner_user_id is not null and owner_user_id = auth.uid())
  );

drop policy if exists caption_usage_select_org_admin on public.caption_usage;
create policy caption_usage_select_org_admin on public.caption_usage
  for select
  using (
    (org_id is not null and public.is_group_admin(org_id, auth.uid()))
    or (owner_user_id is not null and owner_user_id = auth.uid())
  );

-- ── 3. claim_caption_session: org OR owner ───────────────────────────────
drop function if exists public.claim_caption_session(uuid, uuid, text, text, text, text);

create or replace function public.claim_caption_session(
  p_org_id          uuid,
  p_room_id         uuid,
  p_room_kind       text,
  p_room_name       text,
  p_source_language text,
  p_started_by      text,
  p_owner_user_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing   public.caption_sessions%rowtype;
  v_session_id uuid;
  v_owner      uuid := case when p_org_id is null then p_owner_user_id else null end;
begin
  update public.caption_sessions
     set status = 'ended', ended_at = now(), stop_reason = 'heartbeat_lost'
   where room_name = p_room_name
     and status in ('starting', 'active')
     and last_heartbeat_at < now() - interval '2 minutes';

  insert into public.caption_sessions (
    org_id, owner_user_id, room_id, room_kind, room_name, source_language, status, started_by
  )
  values (
    p_org_id, v_owner, p_room_id, p_room_kind, p_room_name,
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
    'owner_user_id', v_owner,
    'room_id', p_room_id,
    'room_kind', p_room_kind,
    'room_name', p_room_name,
    'source_language', coalesce(nullif(p_source_language, ''), 'en')
  )::text);

  return jsonb_build_object('session_id', v_session_id, 'status', 'starting', 'reused', false);
end;
$$;

revoke all on function public.claim_caption_session(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_caption_session(uuid, uuid, text, text, text, text, uuid) to service_role;

-- ── 4. record_caption_usage: org OR owner ────────────────────────────────
drop function if exists public.record_caption_usage(uuid, uuid, integer, integer);

create or replace function public.record_caption_usage(
  p_org_id          uuid,
  p_room_id         uuid,
  p_minutes         integer,
  p_alert_threshold integer default null,
  p_owner_user_id   uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   date := (now() at time zone 'utc')::date;
  v_owner   uuid := case when p_org_id is null then p_owner_user_id else null end;
  v_before  integer;
  v_after   integer;
  v_who     text;
begin
  if p_org_id is null and v_owner is null then
    raise exception 'record_caption_usage: an org or an owner is required';
  end if;

  select coalesce(sum(minutes), 0) into v_before
    from public.caption_usage
   where usage_date = v_today
     and (case when p_org_id is not null then org_id = p_org_id else owner_user_id = v_owner end);

  insert into public.caption_usage (org_id, owner_user_id, room_id, usage_date, minutes)
  values (p_org_id, v_owner, p_room_id, v_today, greatest(p_minutes, 0))
  on conflict (room_id, usage_date)
  do update set minutes = public.caption_usage.minutes + excluded.minutes,
                updated_at = now();

  v_after := v_before + greatest(p_minutes, 0);

  if p_alert_threshold is not null
     and v_before < p_alert_threshold
     and v_after >= p_alert_threshold then
    v_who := case when p_org_id is not null
                  then 'Ministry ' || p_org_id::text
                  else 'Channel owner ' || v_owner::text end;
    raise warning 'caption usage alert: % reached % caption minutes on %', v_who, v_after, v_today;
    begin
      insert into public.notifications (user_id, type, title, message, link, is_read)
      select up.user_id, 'caption_usage_alert', 'Caption usage alert',
             v_who || ' has used ' || v_after || ' caption minutes today (' || v_today || ').',
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

revoke all on function public.record_caption_usage(uuid, uuid, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.record_caption_usage(uuid, uuid, integer, integer, uuid) to service_role;

-- ── 5. Channel viewer heartbeat: personal channels too ───────────────────
create or replace function public.caption_channel_viewer_heartbeat(p_channel_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_name text;
  v_live      boolean;
begin
  select 'channel-' || c.id::text into v_room_name
    from public.live_channels c
   where c.id = p_channel_id
     and (coalesce(c.is_live, false) or coalesce(c.is_hls_live, false));

  if v_room_name is null then
    return false;
  end if;

  select exists (
    select 1 from public.caption_sessions
     where room_name = v_room_name and status in ('starting', 'active')
  ) into v_live;

  if v_live then
    update public.caption_sessions
       set hls_viewer_seen_at = now()
     where room_name = v_room_name
       and status in ('starting', 'active')
       and (hls_viewer_seen_at is null or hls_viewer_seen_at < now() - interval '20 seconds');
  end if;

  return v_live;
end;
$$;

revoke all on function public.caption_channel_viewer_heartbeat(uuid) from public;
grant execute on function public.caption_channel_viewer_heartbeat(uuid) to anon, authenticated;

commit;
