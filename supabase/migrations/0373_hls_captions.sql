-- 0373_hls_captions.sql
-- =====================================================================
-- On-demand captions, Phase 2: webinar audiences watching over HLS.
--
-- HLS attendees never join the LiveKit room, so they can't set the
-- captions=on participant attribute the agent counts in Phase 1. Instead,
-- while CC is on, each HLS viewer calls caption_hls_viewer_heartbeat, which
-- stamps caption_sessions.hls_viewer_seen_at (at most once per 20 seconds
-- per room, however many viewers call it). The agent treats a stamp from
-- the last 90 seconds as "someone is watching captions".
--
-- claim_caption_session now also sends room_kind in its caption_dispatch
-- payload, so the agent knows to broadcast captions to HLS viewers (over
-- Supabase Realtime) for webinar rooms only.
--
-- Still nothing here touches any translation_* table, language_configs, or
-- the bot_dispatch channel. Idempotent — safe to re-run.
-- =====================================================================

begin;

alter table public.caption_sessions
  add column if not exists hls_viewer_seen_at timestamptz;

-- ── claim_caption_session: same behaviour as 0372, plus room_kind ────────
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
    'room_kind', p_room_kind,
    'room_name', p_room_name,
    'source_language', coalesce(nullif(p_source_language, ''), 'en')
  )::text);

  return jsonb_build_object('session_id', v_session_id, 'status', 'starting', 'reused', false);
end;
$$;

revoke all on function public.claim_caption_session(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_caption_session(uuid, uuid, text, text, text, text) to service_role;

-- ── caption_hls_viewer_heartbeat ─────────────────────────────────────────
-- Called by HLS attendees with CC on, about every 45 seconds. Uses the same
-- trust boundary as watching the webinar itself (the "read ministry
-- webinars" policy, migration 0354): the webinar must be live, and either
-- public or the caller a member. Returns whether a caption agent is running
-- for the webinar — false tells the client to call captions-start again.
-- It can only extend a session that already exists, never start one.
create or replace function public.caption_hls_viewer_heartbeat(p_webinar_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_name text;
  v_live      boolean;
begin
  select w.room_name into v_room_name
    from public.ministry_webinars w
   where w.id = p_webinar_id
     and w.status = 'live'
     and (w.is_public = true or public.is_group_member(w.ministry_id, auth.uid()));

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

revoke all on function public.caption_hls_viewer_heartbeat(uuid) from public;
grant execute on function public.caption_hls_viewer_heartbeat(uuid) to anon, authenticated;

commit;
